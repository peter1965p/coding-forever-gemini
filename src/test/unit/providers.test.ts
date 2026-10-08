import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readSse, readNdjson } from '../../lib/stream';
import { toGeminiContents } from '../../providers/gemini';
import { toAnthropicMessages } from '../../providers/anthropic';
import { toOpenAiMessages, toOpenAiTools } from '../../providers/openaiCompat';
import { normalizeOllamaUrl } from '../../providers/ollama';
import { isNewerVersion } from '../../system/updates';
import { AgentMessage, parseToolArgs, ToolDef } from '../../providers/types';
import { resolveModel, ProviderCredentials } from '../../providers';

const EMPTY_CREDS: ProviderCredentials = {
    geminiApiKey: '', groqApiKey: '', openaiApiKey: '', claudeApiKey: '',
    localEnabled: false, localBaseUrl: 'http://localhost:11434'
};

/** Ein Verlauf mit Tool-Aufruf und zwei Ergebnissen aus demselben Schritt. */
const HISTORY: AgentMessage[] = [
    { role: 'user', content: 'Was steht in der Datei?' },
    {
        role: 'assistant',
        content: 'Ich schaue nach.',
        toolCalls: [
            { id: 'c1', name: 'read_file', args: { path: 'a.ts' } },
            { id: 'c2', name: 'read_file', args: { path: 'b.ts' } }
        ]
    },
    { role: 'tool', content: '{"content":"A"}', toolCallId: 'c1', toolName: 'read_file' },
    { role: 'tool', content: '{"content":"B"}', toolCallId: 'c2', toolName: 'read_file' }
];

describe('parseToolArgs', () => {
    it('nimmt JSON-Strings und Objekte', () => {
        assert.deepEqual(parseToolArgs('{"a":1}'), { a: 1 });
        assert.deepEqual(parseToolArgs({ a: 1 }), { a: 1 });
    });

    it('faellt bei Unsinn auf ein leeres Objekt zurueck', () => {
        assert.deepEqual(parseToolArgs('{kaputt'), {});
        assert.deepEqual(parseToolArgs(''), {});
        assert.deepEqual(parseToolArgs(undefined), {});
        assert.deepEqual(parseToolArgs('"nur ein string"'), {});
    });
});

describe('toGeminiContents', () => {
    it('fasst Tool-Ergebnisse eines Schritts in einen user-Turn zusammen', () => {
        const contents = toGeminiContents(HISTORY);
        assert.deepEqual(contents.map((c: any) => c.role), ['user', 'model', 'user']);
        assert.equal(contents[2].parts.length, 2);
        assert.equal(contents[2].parts[0].functionResponse.name, 'read_file');
        assert.deepEqual(contents[2].parts[0].functionResponse.response.result, { content: 'A' });
    });

    it('haengt functionCall-Parts an die model-Nachricht', () => {
        const contents = toGeminiContents(HISTORY);
        assert.equal(contents[1].parts[0].text, 'Ich schaue nach.');
        assert.equal(contents[1].parts[1].functionCall.name, 'read_file');
        assert.deepEqual(contents[1].parts[1].functionCall.args, { path: 'a.ts' });
    });

    it('laesst leere Assistant-Nachrichten weg', () => {
        const contents = toGeminiContents([
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: '   ' }
        ]);
        assert.equal(contents.length, 1);
    });
});

describe('toAnthropicMessages', () => {
    it('buendelt tool_result-Bloecke in einer user-Nachricht', () => {
        const messages = toAnthropicMessages(HISTORY);
        assert.deepEqual(messages.map((m: any) => m.role), ['user', 'assistant', 'user']);
        assert.equal(messages[2].content.length, 2);
        assert.equal(messages[2].content[0].type, 'tool_result');
        assert.equal(messages[2].content[0].tool_use_id, 'c1');
    });

    it('uebersetzt Tool-Aufrufe in tool_use-Bloecke', () => {
        const messages = toAnthropicMessages(HISTORY);
        assert.equal(messages[1].content[0].type, 'text');
        assert.equal(messages[1].content[1].type, 'tool_use');
        assert.equal(messages[1].content[1].id, 'c1');
    });
});

describe('toAnthropicMessages Rollenwechsel', () => {
    it('fasst zwei user-Nachrichten in Folge zusammen', () => {
        // Kann passieren, wenn ein vorheriger Lauf ohne Antwort abgebrochen ist.
        const messages = toAnthropicMessages([
            { role: 'user', content: 'erste Frage' },
            { role: 'user', content: 'zweite Frage' }
        ]);
        assert.equal(messages.length, 1);
        assert.equal(messages[0].role, 'user');
        assert.deepEqual(messages[0].content.map((b: any) => b.text), ['erste Frage', 'zweite Frage']);
    });
});

describe('toOpenAiMessages', () => {
    it('stellt den System-Prompt voran und serialisiert tool_calls', () => {
        const messages = toOpenAiMessages('SYS', HISTORY);
        assert.equal(messages[0].role, 'system');
        assert.equal(messages[0].content, 'SYS');
        assert.equal(messages[2].tool_calls.length, 2);
        assert.equal(messages[2].tool_calls[0].function.arguments, '{"path":"a.ts"}');
        assert.equal(messages[3].role, 'tool');
        assert.equal(messages[3].tool_call_id, 'c1');
    });

    it('laesst tool_call_id fuer Ollama weg', () => {
        const messages = toOpenAiMessages('SYS', HISTORY, false);
        assert.equal(messages[3].tool_call_id, undefined);
        assert.equal(messages[3].role, 'tool');
    });
});

describe('toOpenAiTools', () => {
    it('baut ein gueltiges Function-Schema', () => {
        const tool: ToolDef = {
            name: 'read_file',
            description: 'Liest eine Datei.',
            parameters: { path: { type: 'string', description: 'Pfad' } },
            required: ['path']
        };
        const [converted] = toOpenAiTools([tool]) as any[];
        assert.equal(converted.type, 'function');
        assert.equal(converted.function.name, 'read_file');
        assert.equal(converted.function.parameters.properties.path.type, 'string');
        assert.deepEqual(converted.function.parameters.required, ['path']);
    });
});

describe('resolveModel', () => {
    it('behandelt IDs ohne Praefix als Gemini', () => {
        const resolved = resolveModel('gemini-3.6-flash', { ...EMPTY_CREDS, geminiApiKey: 'k' });
        assert.equal(resolved.providerId, 'gemini');
        assert.equal(resolved.model, 'gemini-3.6-flash');
    });

    it('leitet eine explizite Auswahl nicht auf einen anderen Anbieter um', () => {
        const resolved = resolveModel('groq:openai/gpt-oss-20b', {
            ...EMPTY_CREDS, geminiApiKey: 'gem', groqApiKey: 'gsk'
        });
        assert.equal(resolved.providerId, 'groq');
        assert.equal(resolved.model, 'openai/gpt-oss-20b');
    });

    it('markiert groq/compound als ohne eigene Tools', () => {
        const resolved = resolveModel('groq:groq/compound', { ...EMPTY_CREDS, groqApiKey: 'gsk' });
        assert.equal(resolved.toolsUnsupported, true);
    });

    it('wirft eine klare Meldung, wenn der Key fehlt', () => {
        assert.throws(
            () => resolveModel('claude:claude-sonnet-5-5', EMPTY_CREDS),
            /Anthropic API-Key/
        );
    });

    it('erhaelt Doppelpunkte in lokalen Modellnamen', () => {
        const resolved = resolveModel('local:qwen2.5-coder:7b', { ...EMPTY_CREDS, localEnabled: true });
        assert.equal(resolved.providerId, 'local');
        assert.equal(resolved.model, 'qwen2.5-coder:7b');
    });
});

describe('normalizeOllamaUrl', () => {
    it('entfernt Schraegstriche und ein mitkopiertes /v1', () => {
        assert.equal(normalizeOllamaUrl('http://localhost:11434/'), 'http://localhost:11434');
        assert.equal(normalizeOllamaUrl('http://localhost:11434/v1'), 'http://localhost:11434');
        assert.equal(normalizeOllamaUrl('http://localhost:11434/v1/'), 'http://localhost:11434');
        assert.equal(normalizeOllamaUrl(''), 'http://localhost:11434');
    });
});

describe('isNewerVersion', () => {
    it('vergleicht Versionsnummern numerisch', () => {
        assert.equal(isNewerVersion('2.8.2', '2.9.0'), true);
        assert.equal(isNewerVersion('2.9.0', '2.8.2'), false);
        assert.equal(isNewerVersion('2.9.0', '2.9.0'), false);
        assert.equal(isNewerVersion('2.9.0', '2.10.0'), true);
        assert.equal(isNewerVersion('2.9', '2.9.1'), true);
    });
});

function sseResponse(chunks: string[]): Response {
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of chunks) { controller.enqueue(encoder.encode(chunk)); }
            controller.close();
        }
    });
    return new Response(stream);
}

describe('readSse', () => {
    it('liest Events auch ueber Chunk-Grenzen hinweg', async () => {
        const events: any[] = [];
        // Das zweite Event ist absichtlich mitten im JSON getrennt.
        for await (const event of readSse(sseResponse([
            'data: {"n":1}\n\ndata: {"n":',
            '2}\n\ndata: [DONE]\n\n'
        ]))) {
            events.push(event);
        }
        assert.deepEqual(events, [{ n: 1 }, { n: 2 }]);
    });

    it('ueberspringt unparsbare Payloads statt abzubrechen', async () => {
        const events: any[] = [];
        for await (const event of readSse(sseResponse(['data: {kaputt\n\ndata: {"ok":true}\n\n']))) {
            events.push(event);
        }
        assert.deepEqual(events, [{ ok: true }]);
    });
});

describe('readNdjson', () => {
    it('liest zeilenweise JSON ohne data:-Praefix', async () => {
        const events: any[] = [];
        for await (const event of readNdjson(sseResponse(['{"a":1}\n{"a":', '2}\n']))) {
            events.push(event);
        }
        assert.deepEqual(events, [{ a: 1 }, { a: 2 }]);
    });
});
