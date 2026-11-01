import * as vscode from 'vscode';
import { ProviderCredentials } from '../providers';
import {
    DEFAULT_OLLAMA_URL, normalizeInstances, OllamaInstance
} from '../providers/ollama';

export const API_KEY_NAMES = ['geminiApiKey', 'groqApiKey', 'claudeApiKey', 'openaiApiKey'] as const;
export type ApiKeyName = typeof API_KEY_NAMES[number];

export interface Preferences {
    /** Konfigurierte Ollama-Server; jeder einzeln ein- und ausschaltbar. */
    ollamaInstances: OllamaInstance[];
    mcpConfig: string;
    userName: string;
    chatFont: string;
    /** Basis-Schriftgroesse des Chats in px; alles andere skaliert relativ dazu. */
    chatFontSize: number;
}

/**
 * Was das Webview über die Konfiguration erfahren darf.
 * Bewusst OHNE die API-Keys: vorher wurden alle vier Keys im Klartext als
 * window.INITIAL_AI_SETTINGS in das HTML geschrieben, obwohl das Webview sie
 * nie braucht — alle Requests laufen im Extension Host.
 */
export interface PublicSettings extends Preferences {
    hasGeminiKey: boolean;
    hasGroqKey: boolean;
    hasClaudeKey: boolean;
    hasOpenaiKey: boolean;
}

/** Eine Instanz für den eigenen Rechner, ausgeschaltet — damit es sofort etwas zum Umlegen gibt. */
export const DEFAULT_OLLAMA_INSTANCES: OllamaInstance[] = [
    { id: 'lokal', name: 'Dieser Rechner', url: DEFAULT_OLLAMA_URL, enabled: false }
];

const PREFERENCE_DEFAULTS: Preferences = {
    ollamaInstances: DEFAULT_OLLAMA_INSTANCES,
    mcpConfig: '',
    userName: '',
    chatFont: 'var(--vscode-font-family)',
    chatFontSize: 12
};

export class SettingsStore {
    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Verschiebt Keys aus dem globalState in die SecretStorage.
     * globalState liegt als Klartext-JSON auf der Platte; secrets nutzt den
     * Keychain des Betriebssystems.
     */
    async migrateSecrets(): Promise<void> {
        for (const name of API_KEY_NAMES) {
            const legacy = this.context.globalState.get<string>(name);
            if (!legacy) { continue; }

            const existing = await this.context.secrets.get(name);
            if (!existing) {
                await this.context.secrets.store(name, legacy);
            }
            await this.context.globalState.update(name, undefined);
        }
    }

    /**
     * Übernimmt die frühere Einzel-Instanz (localEnabled/baseUrl) als ersten Eintrag der
     * neuen Liste. Wer Ollama schon eingerichtet hatte, behält Adresse und Schalterstellung.
     */
    async migrateOllama(): Promise<void> {
        const state = this.context.globalState;
        if (state.get<unknown>('ollamaInstances') !== undefined) { return; }

        const legacyUrl = state.get<string>('baseUrl');
        const legacyEnabled = state.get<boolean>('localEnabled');

        if (legacyUrl || legacyEnabled !== undefined) {
            const migrated = normalizeInstances([{
                id: 'lokal',
                name: 'Dieser Rechner',
                url: legacyUrl || DEFAULT_OLLAMA_URL,
                enabled: legacyEnabled === true
            }]);
            await state.update('ollamaInstances', migrated.length > 0 ? migrated : DEFAULT_OLLAMA_INSTANCES);
        }

        for (const key of ['baseUrl', 'localEnabled', 'modelName']) {
            if (state.get(key) !== undefined) { await state.update(key, undefined); }
        }
    }

    async getKey(name: ApiKeyName): Promise<string> {
        return (await this.context.secrets.get(name)) || '';
    }

    async setKey(name: ApiKeyName, value: string): Promise<void> {
        if (value.trim()) {
            await this.context.secrets.store(name, value.trim());
        } else {
            await this.context.secrets.delete(name);
        }
    }

    getPreferences(): Preferences {
        const state = this.context.globalState;
        const stored = state.get<unknown>('ollamaInstances');

        return {
            // Eine absichtlich geleerte Liste bleibt leer; nur "nie gesetzt" bekommt den Standard.
            ollamaInstances: stored === undefined
                ? PREFERENCE_DEFAULTS.ollamaInstances
                : normalizeInstances(stored),
            mcpConfig: state.get<string>('mcpConfig') ?? PREFERENCE_DEFAULTS.mcpConfig,
            userName: state.get<string>('userName') ?? PREFERENCE_DEFAULTS.userName,
            chatFont: state.get<string>('chatFont') || PREFERENCE_DEFAULTS.chatFont,
            chatFontSize: Math.max(9, Math.min(18,
                state.get<number>('chatFontSize') ?? PREFERENCE_DEFAULTS.chatFontSize))
        };
    }

    /**
     * Speichert nur die übergebenen Felder. Vorher schrieb der Handler jedes Feld
     * bedingungslos — ein Speichern aus der Einstellungsseite (die den Key nie
     * geladen hatte) löschte dadurch den hinterlegten Gemini-Key.
     */
    async updatePreferences(partial: Partial<Preferences>): Promise<void> {
        for (const [key, value] of Object.entries(partial)) {
            if (value === undefined) { continue; }
            // Das Webview ist nicht vertrauenswürdig genug, um die Liste roh zu speichern.
            const clean = key === 'ollamaInstances' ? normalizeInstances(value) : value;
            await this.context.globalState.update(key, clean);
        }
    }

    /** Schaltet eine Instanz um und liefert die neue Liste zurück. */
    async setOllamaInstanceEnabled(id: string, enabled: boolean): Promise<OllamaInstance[]> {
        const next = this.getPreferences().ollamaInstances.map(
            instance => instance.id === id ? { ...instance, enabled } : instance
        );
        await this.updatePreferences({ ollamaInstances: next });
        return next;
    }

    async getPublicSettings(): Promise<PublicSettings> {
        const [gemini, groq, claude, openai] = await Promise.all(
            API_KEY_NAMES.map(name => this.getKey(name))
        );
        return {
            ...this.getPreferences(),
            hasGeminiKey: Boolean(gemini),
            hasGroqKey: Boolean(groq),
            hasClaudeKey: Boolean(claude),
            hasOpenaiKey: Boolean(openai)
        };
    }

    async getCredentials(): Promise<ProviderCredentials> {
        const [geminiApiKey, groqApiKey, claudeApiKey, openaiApiKey] = await Promise.all(
            API_KEY_NAMES.map(name => this.getKey(name))
        );
        return {
            geminiApiKey,
            groqApiKey,
            claudeApiKey,
            openaiApiKey,
            ollamaInstances: this.getPreferences().ollamaInstances
        };
    }
}

/** Agent-Grenzen aus den VS Code Settings. */
export function getAgentLimits(): { maxTurns: number; historyDepth: number } {
    const config = vscode.workspace.getConfiguration('codingForever');
    return {
        maxTurns: Math.max(1, Math.min(50, config.get<number>('agent.maxTurns', 12))),
        historyDepth: Math.max(0, Math.min(200, config.get<number>('agent.historyDepth', 20)))
    };
}
