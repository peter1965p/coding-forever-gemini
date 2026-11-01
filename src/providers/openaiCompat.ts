import { readErrorMessage, readSse } from '../lib/stream';
import { toJsonSchema } from './schema';
import {
    AgentMessage, ChatRequest, ChatResult, LlmProvider, ModelInfo, parseToolArgs,
    ProviderError, ToolCall, ToolDef, ToolsUnsupportedError
} from './types';

/** Tool-Schema im OpenAI-Format — nutzen Groq, OpenAI und Ollama gleichermaßen. */
export function toOpenAiTools(tools: ToolDef[]): any[] {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: toJsonSchema(tool)
        }
    }));
}

/**
 * Nachrichten ins OpenAI-Chat-Format.
 * `withToolCallIds=false` für Ollama, das tool_call_id nicht erwartet.
 */
export function toOpenAiMessages(
    system: string,
    messages: AgentMessage[],
    withToolCallIds = true
): any[] {
    const out: any[] = [{ role: 'system', content: system }];

    for (const msg of messages) {
        if (msg.role === 'assistant') {
            const entry: any = { role: 'assistant', content: msg.content || '' };
            if (msg.toolCalls?.length) {
                entry.tool_calls = msg.toolCalls.map(call => ({
                    id: call.id,
                    type: 'function',
                    function: { name: call.name, arguments: JSON.stringify(call.args) }
                }));
            }
            out.push(entry);
        } else if (msg.role === 'tool') {
            const entry: any = { role: 'tool', content: msg.content };
            if (withToolCallIds && msg.toolCallId) { entry.tool_call_id = msg.toolCallId; }
            if (msg.toolName) { entry.name = msg.toolName; }
            out.push(entry);
        } else {
            out.push({ role: 'user', content: msg.content });
        }
    }

    return out;
}

/** Erkennt die Fehlermeldungen, mit denen ein Anbieter Function-Calling ablehnt. */
function isToolRejection(message: string): boolean {
    return /tool|function/i.test(message)
        && /(not support|does not support|not enabled|unsupported|no tools)/i.test(message);
}

/**
 * Deckt jeden OpenAI-kompatiblen Endpunkt ab — aktuell Groq und OpenAI selbst.
 * Beide sprechen dasselbe /chat/completions-Protokoll, nur mit anderer Basis-URL.
 */
export class OpenAiCompatProvider implements LlmProvider {
    constructor(
        readonly label: string,
        private readonly baseUrl: string,
        private readonly apiKey: string,
        private readonly extraBody: Record<string, any> = {}
    ) {}

    async chat(req: ChatRequest): Promise<ChatResult> {
        const body: any = {
            model: req.model,
            messages: toOpenAiMessages(req.system, req.messages),
            stream: true,
            ...this.extraBody
        };
        if (req.tools?.length) {
            body.tools = toOpenAiTools(req.tools);
            body.tool_choice = 'auto';
        }

        const res = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: req.signal
        });

        if (!res.ok) {
            const message = await readErrorMessage(res);
            // Lehnt das Modell nur die Tools ab, soll der Loop ohne Tools weitermachen
            // statt die ganze Anfrage zu verlieren.
            if (req.tools?.length && isToolRejection(message)) {
                throw new ToolsUnsupportedError(message);
            }
            throw new ProviderError(`${this.label} (${res.status}): ${message}`);
        }

        let text = '';
        // tool_calls kommen beim Streaming fragmentiert an: pro index wachsen Name
        // und arguments über mehrere Chunks zusammen.
        const partial = new Map<number, { id: string; name: string; args: string }>();

        for await (const chunk of readSse(res)) {
            if (chunk.error) {
                throw new ProviderError(`${this.label}: ${chunk.error.message || chunk.error}`);
            }

            const delta = chunk.choices?.[0]?.delta;
            if (!delta) { continue; }

            if (typeof delta.content === 'string' && delta.content.length > 0) {
                text += delta.content;
                req.onDelta?.(delta.content);
            }

            for (const call of delta.tool_calls ?? []) {
                const index = call.index ?? 0;
                const entry = partial.get(index) ?? { id: '', name: '', args: '' };
                if (call.id) { entry.id = call.id; }
                if (call.function?.name) { entry.name += call.function.name; }
                if (call.function?.arguments) { entry.args += call.function.arguments; }
                partial.set(index, entry);
            }
        }

        const toolCalls: ToolCall[] = [...partial.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([index, entry]) => ({
                id: entry.id || `call_${index}`,
                name: entry.name,
                args: parseToolArgs(entry.args)
            }))
            .filter(call => call.name.length > 0);

        return { text, toolCalls };
    }
}

/** Modell-Liste eines OpenAI-kompatiblen Endpunkts (/models). */
export async function fetchOpenAiCompatModels(
    baseUrl: string,
    apiKey: string,
    filter: (id: string) => boolean
): Promise<ModelInfo[]> {
    const res = await fetch(`${baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!res.ok) {
        throw new ProviderError(`Models-Endpoint antwortete mit ${res.status}`);
    }

    const data: any = await res.json();
    const models: ModelInfo[] = (Array.isArray(data.data) ? data.data : [])
        .map((m: any) => String(m.id || ''))
        .filter((id: string) => id.length > 0 && filter(id))
        .map((id: string) => ({ id }));

    models.sort((a, b) => a.id.localeCompare(b.id));
    return models;
}
