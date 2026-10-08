import { readErrorMessage, readNdjson } from '../lib/stream';
import { toOpenAiMessages, toOpenAiTools } from './openaiCompat';
import {
    ChatRequest, ChatResult, LlmProvider, ModelInfo, parseToolArgs, ProviderError, ToolCall
} from './types';

/** Entfernt ein versehentlich mitkopiertes /v1 aus der Ollama-Basis-URL. */
export function normalizeOllamaUrl(baseUrl: string): string {
    return (baseUrl || 'http://localhost:11434').replace(/\/+$/, '').replace(/\/v1$/, '');
}

export class OllamaProvider implements LlmProvider {
    readonly label = 'Ollama';
    private readonly baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = normalizeOllamaUrl(baseUrl);
    }

    async chat(req: ChatRequest): Promise<ChatResult> {
        const body: any = {
            model: req.model,
            messages: toOpenAiMessages(req.system, req.messages, false),
            stream: true
        };
        // Modelle ohne Tool-Support ignorieren das Feld bei Ollama einfach.
        if (req.tools?.length) { body.tools = toOpenAiTools(req.tools); }

        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: req.signal
            });
        } catch (e: any) {
            if (e?.name === 'AbortError') { throw e; }
            throw new ProviderError(
                `Ollama unter ${this.baseUrl} nicht erreichbar: ${e.message}. Läuft "ollama serve"?`
            );
        }

        if (!res.ok) {
            throw new ProviderError(`Ollama (${res.status}): ${await readErrorMessage(res)}`);
        }

        let text = '';
        const toolCalls: ToolCall[] = [];

        for await (const chunk of readNdjson(res)) {
            if (chunk.error) {
                throw new ProviderError(`Ollama: ${chunk.error}`);
            }

            const content = chunk.message?.content;
            if (typeof content === 'string' && content.length > 0) {
                text += content;
                req.onDelta?.(content);
            }

            // Ollama liefert tool_calls komplett pro Chunk (nicht fragmentiert wie OpenAI).
            for (const call of chunk.message?.tool_calls ?? []) {
                const name = call.function?.name;
                if (!name) { continue; }
                toolCalls.push({
                    id: `ollama_${toolCalls.length}_${Date.now()}`,
                    name,
                    args: parseToolArgs(call.function?.arguments)
                });
            }
        }

        return { text, toolCalls };
    }
}

/** Lokal installierte Modelle auflisten (/api/tags). */
export async function fetchOllamaModels(baseUrl: string): Promise<ModelInfo[]> {
    const url = normalizeOllamaUrl(baseUrl);
    const res = await fetch(`${url}/api/tags`);
    if (!res.ok) {
        throw new ProviderError(`Ollama Tags-Endpoint antwortete mit ${res.status}`);
    }

    const data: any = await res.json();
    const models: ModelInfo[] = (Array.isArray(data.models) ? data.models : [])
        .map((m: any) => String(m.name || ''))
        .filter((id: string) => id.length > 0)
        .map((id: string) => ({ id }));

    models.sort((a, b) => a.id.localeCompare(b.id));
    return models;
}
