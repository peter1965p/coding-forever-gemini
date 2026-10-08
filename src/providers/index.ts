import { AnthropicProvider, ANTHROPIC_FALLBACK_MODELS, fetchAnthropicModels } from './anthropic';
import { fetchGeminiModels, GEMINI_FALLBACK_MODELS, GeminiProvider } from './gemini';
import { fetchOllamaModels, normalizeOllamaUrl, OllamaProvider } from './ollama';
import { fetchOpenAiCompatModels, OpenAiCompatProvider } from './openaiCompat';
import { LlmProvider, ModelInfo, ProviderError } from './types';

export * from './types';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const OPENAI_BASE = 'https://api.openai.com/v1';

export type ProviderId = 'gemini' | 'groq' | 'openai' | 'claude' | 'local';

/** Die Keys/Endpunkte, die der Loop zum Auflösen eines Modells braucht. */
export interface ProviderCredentials {
    geminiApiKey: string;
    groqApiKey: string;
    openaiApiKey: string;
    claudeApiKey: string;
    localEnabled: boolean;
    localBaseUrl: string;
}

export interface ResolvedModel {
    provider: LlmProvider;
    providerId: ProviderId;
    /** Modell-ID ohne Präfix, so wie der Anbieter sie erwartet. */
    model: string;
    /**
     * true, wenn dieses Modell kein extern definiertes Function-Calling kann
     * (z.B. groq/compound mit seinen eingebauten Server-Tools).
     */
    toolsUnsupported: boolean;
}

export const GROQ_FALLBACK_MODELS: ModelInfo[] = [
    { id: 'openai/gpt-oss-120b' },
    { id: 'openai/gpt-oss-20b' },
    { id: 'qwen/qwen3.6-27b' },
    { id: 'groq/compound' }
];

/** Audio-, Moderations- und Bildmodelle sind keine Chat-/Coding-Modelle. */
const GROQ_NON_CHAT = ['whisper', 'tts', 'guard', 'orpheus', 'canopylabs', 'playai'];
const OPENAI_NON_CHAT = [
    'audio', 'realtime', 'whisper', 'tts', 'dall-e', 'embedding',
    'moderation', 'image', 'transcribe', 'search', 'computer-use'
];

function splitModelId(modelId: string): { providerId: ProviderId; model: string } {
    const separator = modelId.indexOf(':');
    if (separator > 0) {
        const prefix = modelId.slice(0, separator);
        const rest = modelId.slice(separator + 1);
        if (prefix === 'groq') { return { providerId: 'groq', model: rest }; }
        if (prefix === 'openai') { return { providerId: 'openai', model: rest }; }
        if (prefix === 'claude') { return { providerId: 'claude', model: rest }; }
        if (prefix === 'local') { return { providerId: 'local', model: rest }; }
        if (prefix === 'gemini') { return { providerId: 'gemini', model: rest }; }
    }
    // Ohne Präfix: historische Gemini-IDs wie "gemini-3.6-flash".
    return { providerId: 'gemini', model: modelId };
}

/**
 * Löst eine Modell-Auswahl aus dem Dropdown in einen konkreten Provider auf.
 * Wirft eine ProviderError mit klarer Anweisung, wenn der nötige Key fehlt —
 * vorher wurde eine explizite Auswahl bei fehlendem Key still umgeleitet.
 */
export function resolveModel(modelId: string, creds: ProviderCredentials): ResolvedModel {
    const { providerId, model } = splitModelId(modelId || 'gemini-3.6-flash');

    switch (providerId) {
        case 'groq': {
            if (!creds.groqApiKey) {
                throw new ProviderError('Kein Groq API-Key hinterlegt. Bitte unter "AI Engine" eintragen.');
            }
            const id = model || 'openai/gpt-oss-120b';
            return {
                provider: new OpenAiCompatProvider('Groq', GROQ_BASE, creds.groqApiKey, { temperature: 0.2 }),
                providerId,
                model: id,
                // groq/compound akzeptiert ausschließlich seine eingebauten Tools.
                toolsUnsupported: id.startsWith('groq/compound')
            };
        }

        case 'openai': {
            if (!creds.openaiApiKey) {
                throw new ProviderError('Kein OpenAI API-Key hinterlegt. Bitte unter "AI Engine" eintragen.');
            }
            return {
                provider: new OpenAiCompatProvider('OpenAI', OPENAI_BASE, creds.openaiApiKey),
                providerId,
                model: model || 'gpt-4.1',
                toolsUnsupported: false
            };
        }

        case 'claude': {
            if (!creds.claudeApiKey) {
                throw new ProviderError('Kein Anthropic API-Key hinterlegt. Bitte unter "AI Engine" eintragen.');
            }
            return {
                provider: new AnthropicProvider(creds.claudeApiKey),
                providerId,
                model: model || 'claude-sonnet-5-5',
                toolsUnsupported: false
            };
        }

        case 'local': {
            return {
                provider: new OllamaProvider(creds.localBaseUrl),
                providerId,
                model: model || 'llama3.2',
                toolsUnsupported: false
            };
        }

        default: {
            if (!creds.geminiApiKey) {
                throw new ProviderError('Kein Gemini API-Key hinterlegt. Bitte unter "AI Engine" eintragen.');
            }
            return {
                provider: new GeminiProvider(creds.geminiApiKey),
                providerId: 'gemini',
                model: model || 'gemini-3.6-flash',
                toolsUnsupported: false
            };
        }
    }
}

/** Ein günstiges Modell desselben Anbieters für Nebenaufgaben (Chat-Titel). */
export function pickCheapModel(providerId: ProviderId, model: string): string {
    switch (providerId) {
        case 'gemini': return 'gemini-3.5-flash-lite';
        case 'groq': return 'openai/gpt-oss-20b';
        case 'claude': return 'claude-haiku-4-5-20251001';
        case 'openai': return 'gpt-4.1-mini';
        default: return model;
    }
}

export interface ModelGroup {
    providerId: ProviderId;
    label: string;
    models: ModelInfo[];
    /** Gesetzt, wenn die Liste nicht geladen werden konnte (kein Key, Netzfehler). */
    hint?: string;
}

/**
 * Holt die Modell-Listen aller konfigurierten Anbieter parallel.
 * Ein Ausfall bei einem Anbieter darf die anderen nicht blockieren, deshalb
 * allSettled statt all — und bei Gemini/Groq/Claude eine Fallback-Liste.
 */
export async function listAllModels(creds: ProviderCredentials): Promise<ModelGroup[]> {
    const tasks: Array<Promise<ModelGroup>> = [];

    tasks.push((async (): Promise<ModelGroup> => {
        if (!creds.geminiApiKey) {
            return { providerId: 'gemini', label: 'Gemini', models: [], hint: 'Key unter "AI Engine" hinterlegen' };
        }
        try {
            return { providerId: 'gemini', label: 'Gemini', models: await fetchGeminiModels(creds.geminiApiKey) };
        } catch {
            return { providerId: 'gemini', label: 'Gemini', models: GEMINI_FALLBACK_MODELS, hint: 'Live-Liste nicht erreichbar' };
        }
    })());

    tasks.push((async (): Promise<ModelGroup> => {
        if (!creds.groqApiKey) {
            return { providerId: 'groq', label: 'Groq', models: [], hint: 'Key unter "AI Engine" hinterlegen' };
        }
        try {
            const models = await fetchOpenAiCompatModels(
                GROQ_BASE,
                creds.groqApiKey,
                id => !GROQ_NON_CHAT.some(marker => id.toLowerCase().includes(marker))
            );
            return { providerId: 'groq', label: 'Groq', models: models.length > 0 ? models : GROQ_FALLBACK_MODELS };
        } catch {
            return { providerId: 'groq', label: 'Groq', models: GROQ_FALLBACK_MODELS, hint: 'Live-Liste nicht erreichbar' };
        }
    })());

    tasks.push((async (): Promise<ModelGroup> => {
        if (!creds.claudeApiKey) {
            return { providerId: 'claude', label: 'Claude', models: [], hint: 'Key unter "AI Engine" hinterlegen' };
        }
        try {
            return { providerId: 'claude', label: 'Claude', models: await fetchAnthropicModels(creds.claudeApiKey) };
        } catch {
            return { providerId: 'claude', label: 'Claude', models: ANTHROPIC_FALLBACK_MODELS, hint: 'Live-Liste nicht erreichbar' };
        }
    })());

    tasks.push((async (): Promise<ModelGroup> => {
        if (!creds.openaiApiKey) {
            return { providerId: 'openai', label: 'OpenAI', models: [], hint: 'Key unter "AI Engine" hinterlegen' };
        }
        try {
            const models = await fetchOpenAiCompatModels(
                OPENAI_BASE,
                creds.openaiApiKey,
                id => /^(gpt|o[1-9])/.test(id) && !OPENAI_NON_CHAT.some(marker => id.includes(marker))
            );
            return { providerId: 'openai', label: 'OpenAI', models };
        } catch (e: any) {
            return { providerId: 'openai', label: 'OpenAI', models: [], hint: `Liste nicht erreichbar: ${e.message}` };
        }
    })());

    tasks.push((async (): Promise<ModelGroup> => {
        if (!creds.localEnabled) {
            return { providerId: 'local', label: 'Lokal (Ollama)', models: [], hint: 'Unter "AI Engine" aktivieren' };
        }
        try {
            const models = await fetchOllamaModels(creds.localBaseUrl);
            return {
                providerId: 'local',
                label: 'Lokal (Ollama)',
                models,
                hint: models.length === 0 ? 'Keine Modelle installiert' : undefined
            };
        } catch {
            return {
                providerId: 'local',
                label: 'Lokal (Ollama)',
                models: [],
                hint: `${normalizeOllamaUrl(creds.localBaseUrl)} nicht erreichbar`
            };
        }
    })());

    const settled = await Promise.allSettled(tasks);
    return settled
        .filter((r): r is PromiseFulfilledResult<ModelGroup> => r.status === 'fulfilled')
        .map(r => r.value);
}
