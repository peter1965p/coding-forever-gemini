import { readErrorMessage, readSse } from '../lib/stream';
import { toGeminiSchema, toJsonSchema } from './schema';
import {
    AgentMessage, ChatRequest, ChatResult, LlmProvider, ModelInfo, ProviderError, ToolCall, ToolDef
} from './types';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Fallback, wenn die Live-Modellliste nicht erreichbar ist. */
export const GEMINI_FALLBACK_MODELS: ModelInfo[] = [
    { id: 'gemini-3.6-flash' },
    { id: 'gemini-3.5-flash-lite' }
];

/** Modelle, die kein normales Text-Chat-Interface haben. */
const NON_CHAT_MARKERS = [
    'embedding', 'embed', 'aqa', 'imagen', 'veo', 'tts', 'image-generation',
    'native-audio', 'live-', 'learnlm'
];

function safeParse(raw: string): any {
    try { return JSON.parse(raw); } catch { return raw; }
}

function toGeminiTools(tools: ToolDef[]): any[] {
    return [{
        functionDeclarations: tools.map(tool => {
            // Gemini hat einen eigenen Schema-Dialekt (Grossbuchstaben-Typen,
            // nur eine Teilmenge der JSON-Schema-Keywords) — darum die Umwandlung
            // statt das Schema roh durchzureichen wie bei den anderen Anbietern.
            const schema = toGeminiSchema(toJsonSchema(tool));
            return {
                name: tool.name,
                description: tool.description,
                ...(schema.properties ? { parameters: schema } : {})
            };
        })
    }];
}

export function toGeminiContents(messages: AgentMessage[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
        if (msg.role === 'user') {
            contents.push({ role: 'user', parts: [{ text: msg.content }] });
            continue;
        }

        if (msg.role === 'assistant') {
            const parts: any[] = [];
            if (msg.content.trim()) { parts.push({ text: msg.content }); }
            for (const call of msg.toolCalls ?? []) {
                parts.push({ functionCall: { name: call.name, args: call.args } });
            }
            if (parts.length > 0) { contents.push({ role: 'model', parts }); }
            continue;
        }

        // Tool-Ergebnisse gehören bei Gemini als functionResponse in einen user-Turn.
        // Mehrere Ergebnisse aus demselben Schritt müssen in denselben Turn — sonst
        // beschwert sich die API über die Abfolge model → user → user.
        const part = {
            functionResponse: {
                name: msg.toolName ?? 'tool',
                response: { result: safeParse(msg.content) }
            }
        };
        const last = contents[contents.length - 1];
        if (last?.role === 'user' && last.parts?.[0]?.functionResponse) {
            last.parts.push(part);
        } else {
            contents.push({ role: 'user', parts: [part] });
        }
    }

    return contents;
}

export class GeminiProvider implements LlmProvider {
    readonly label = 'Gemini';

    constructor(private readonly apiKey: string) {}

    async chat(req: ChatRequest): Promise<ChatResult> {
        const url = `${GEMINI_BASE}/models/${encodeURIComponent(req.model)}:streamGenerateContent`
            + `?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

        const body: any = {
            system_instruction: { parts: [{ text: req.system }] },
            contents: toGeminiContents(req.messages)
        };
        if (req.tools?.length) { body.tools = toGeminiTools(req.tools); }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: req.signal
        });

        if (!res.ok) {
            throw new ProviderError(`Gemini (${res.status}): ${await readErrorMessage(res)}`);
        }

        let text = '';
        const toolCalls: ToolCall[] = [];
        let blockReason: string | undefined;
        let finishReason: string | undefined;

        for await (const chunk of readSse(res)) {
            blockReason ??= chunk.promptFeedback?.blockReason;
            const candidate = chunk.candidates?.[0];
            if (candidate?.finishReason) { finishReason = candidate.finishReason; }

            for (const part of candidate?.content?.parts ?? []) {
                if (typeof part.text === 'string' && part.text.length > 0) {
                    text += part.text;
                    req.onDelta?.(part.text);
                }
                if (part.functionCall?.name) {
                    toolCalls.push({
                        id: `gemini_${toolCalls.length}_${Date.now()}`,
                        name: part.functionCall.name,
                        args: part.functionCall.args ?? {}
                    });
                }
            }
        }

        // Google antwortet bei Safety-Blocks mit HTTP 200 und leerem Kandidaten —
        // ohne diese Auswertung kam beim Nutzer nur "Keine Antwort erhalten." an.
        if (!text && toolCalls.length === 0) {
            if (blockReason) {
                throw new ProviderError(`Von Gemini blockiert (${blockReason}).`);
            }
            if (finishReason && finishReason !== 'STOP') {
                throw new ProviderError(`Gemini lieferte keinen Text (finishReason: ${finishReason}).`);
            }
        }

        return { text, toolCalls };
    }
}

/** Live-Modellliste bei Google abfragen, damit das Dropdown nicht veraltet. */
export async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) {
        throw new ProviderError(`Gemini Models-Endpoint antwortete mit ${res.status}`);
    }

    const data: any = await res.json();
    const models: ModelInfo[] = (Array.isArray(data.models) ? data.models : [])
        .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m: any) => String(m.name || '').replace(/^models\//, ''))
        .filter((id: string) => id.length > 0 && !NON_CHAT_MARKERS.some(marker => id.includes(marker)))
        .map((id: string) => ({ id }));

    // Neuere Versionen zuerst, damit das Default-Modell oben im Dropdown steht.
    models.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
    return models.length > 0 ? models : GEMINI_FALLBACK_MODELS;
}
