import { readErrorMessage, readSse } from '../lib/stream';
import {
    AgentMessage, ChatRequest, ChatResult, LlmProvider, ModelInfo, parseToolArgs,
    ProviderError, ToolCall, ToolDef
} from './types';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 8192;

/** Fallback, wenn /v1/models nicht erreichbar ist. */
export const ANTHROPIC_FALLBACK_MODELS: ModelInfo[] = [
    { id: 'claude-opus-5-5' },
    { id: 'claude-sonnet-5-5' },
    { id: 'claude-fable-5-1' },
    { id: 'claude-haiku-4-5-20251001' }
];

function toAnthropicTools(tools: ToolDef[]): any[] {
    return tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: {
            type: 'object',
            properties: Object.fromEntries(
                Object.entries(tool.parameters).map(([key, param]) => [
                    key,
                    { type: param.type, description: param.description }
                ])
            ),
            required: tool.required
        }
    }));
}

export function toAnthropicMessages(messages: AgentMessage[]): any[] {
    const out: any[] = [];

    for (const msg of messages) {
        if (msg.role === 'user') {
            // Anthropic erwartet abwechselnde Rollen. Zwei user-Nachrichten in Folge
            // können vorkommen, wenn ein vorheriger Lauf ohne Antwort abgebrochen ist.
            const last = out[out.length - 1];
            if (last?.role === 'user') {
                last.content.push({ type: 'text', text: msg.content });
            } else {
                out.push({ role: 'user', content: [{ type: 'text', text: msg.content }] });
            }
            continue;
        }

        if (msg.role === 'assistant') {
            const content: any[] = [];
            if (msg.content.trim()) { content.push({ type: 'text', text: msg.content }); }
            for (const call of msg.toolCalls ?? []) {
                content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args });
            }
            if (content.length > 0) { out.push({ role: 'assistant', content }); }
            continue;
        }

        // tool_result-Blöcke gehören bei Anthropic in eine user-Nachricht und
        // müssen — wie bei Gemini — pro Schritt zusammengefasst werden.
        const block = {
            type: 'tool_result',
            tool_use_id: msg.toolCallId ?? '',
            content: msg.content
        };
        const last = out[out.length - 1];
        if (last?.role === 'user' && last.content?.[0]?.type === 'tool_result') {
            last.content.push(block);
        } else {
            out.push({ role: 'user', content: [block] });
        }
    }

    return out;
}

export class AnthropicProvider implements LlmProvider {
    readonly label = 'Claude';

    constructor(private readonly apiKey: string) {}

    async chat(req: ChatRequest): Promise<ChatResult> {
        const body: any = {
            model: req.model,
            max_tokens: MAX_TOKENS,
            system: req.system,
            messages: toAnthropicMessages(req.messages),
            stream: true
        };
        if (req.tools?.length) { body.tools = toAnthropicTools(req.tools); }

        const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': ANTHROPIC_VERSION
            },
            body: JSON.stringify(body),
            signal: req.signal
        });

        if (!res.ok) {
            throw new ProviderError(`Claude (${res.status}): ${await readErrorMessage(res)}`);
        }

        let text = '';
        // Pro content_block index sammeln: Text-Blöcke streamen, tool_use-Blöcke
        // kommen als JSON-Fragmente (input_json_delta) stückweise an.
        const blocks = new Map<number, { type: string; id: string; name: string; json: string }>();

        for await (const event of readSse(res)) {
            if (event.type === 'error') {
                throw new ProviderError(`Claude: ${event.error?.message || 'Unbekannter Fehler'}`);
            }

            if (event.type === 'content_block_start') {
                blocks.set(event.index, {
                    type: event.content_block?.type ?? 'text',
                    id: event.content_block?.id ?? '',
                    name: event.content_block?.name ?? '',
                    json: ''
                });
                continue;
            }

            if (event.type === 'content_block_delta') {
                const delta = event.delta;
                if (delta?.type === 'text_delta' && delta.text) {
                    text += delta.text;
                    req.onDelta?.(delta.text);
                } else if (delta?.type === 'input_json_delta') {
                    const block = blocks.get(event.index);
                    if (block) { block.json += delta.partial_json ?? ''; }
                }
            }
        }

        const toolCalls: ToolCall[] = [...blocks.entries()]
            .sort((a, b) => a[0] - b[0])
            .filter(([, block]) => block.type === 'tool_use' && block.name)
            .map(([index, block]) => ({
                id: block.id || `toolu_${index}`,
                name: block.name,
                args: parseToolArgs(block.json)
            }));

        return { text, toolCalls };
    }
}

export async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
    const res = await fetch(`${ANTHROPIC_BASE}/models?limit=100`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
    });
    if (!res.ok) {
        throw new ProviderError(`Claude Models-Endpoint antwortete mit ${res.status}`);
    }

    const data: any = await res.json();
    const models: ModelInfo[] = (Array.isArray(data.data) ? data.data : [])
        .map((m: any) => String(m.id || ''))
        .filter((id: string) => id.length > 0)
        .map((id: string) => ({ id }));

    return models.length > 0 ? models : ANTHROPIC_FALLBACK_MODELS;
}
