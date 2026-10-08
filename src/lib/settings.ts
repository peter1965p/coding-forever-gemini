import * as vscode from 'vscode';
import { ProviderCredentials } from '../providers';

export const API_KEY_NAMES = ['geminiApiKey', 'groqApiKey', 'claudeApiKey', 'openaiApiKey'] as const;
export type ApiKeyName = typeof API_KEY_NAMES[number];

export interface Preferences {
    localEnabled: boolean;
    baseUrl: string;
    modelName: string;
    mcpConfig: string;
    userName: string;
    chatFont: string;
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

const PREFERENCE_DEFAULTS: Preferences = {
    localEnabled: false,
    baseUrl: 'http://localhost:11434',
    modelName: 'llama3.2',
    mcpConfig: '',
    userName: '',
    chatFont: 'var(--vscode-font-family)'
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
        return {
            localEnabled: state.get<boolean>('localEnabled') ?? PREFERENCE_DEFAULTS.localEnabled,
            baseUrl: state.get<string>('baseUrl') || PREFERENCE_DEFAULTS.baseUrl,
            modelName: state.get<string>('modelName') || PREFERENCE_DEFAULTS.modelName,
            mcpConfig: state.get<string>('mcpConfig') ?? PREFERENCE_DEFAULTS.mcpConfig,
            userName: state.get<string>('userName') ?? PREFERENCE_DEFAULTS.userName,
            chatFont: state.get<string>('chatFont') || PREFERENCE_DEFAULTS.chatFont
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
            await this.context.globalState.update(key, value);
        }
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
        const prefs = this.getPreferences();
        const [geminiApiKey, groqApiKey, claudeApiKey, openaiApiKey] = await Promise.all(
            API_KEY_NAMES.map(name => this.getKey(name))
        );
        return {
            geminiApiKey,
            groqApiKey,
            claudeApiKey,
            openaiApiKey,
            localEnabled: prefs.localEnabled,
            localBaseUrl: prefs.baseUrl
        };
    }

    /** Das erste Modell, für das ein Key hinterlegt ist. */
    async getDefaultModel(): Promise<string> {
        const creds = await this.getCredentials();
        if (creds.geminiApiKey) { return 'gemini-3.6-flash'; }
        if (creds.groqApiKey) { return 'groq:openai/gpt-oss-120b'; }
        if (creds.claudeApiKey) { return 'claude:claude-sonnet-5-5'; }
        if (creds.openaiApiKey) { return 'openai:gpt-4.1'; }
        if (creds.localEnabled) { return `local:${this.getPreferences().modelName}`; }
        return 'gemini-3.6-flash';
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
