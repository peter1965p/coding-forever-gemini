import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { after, before, describe, it } from 'node:test';

import { McpManager, normalizeToolResult } from '../../mcp/manager';
import { parseMcpConfig, transportOf } from '../../mcp/types';
import { toGeminiSchema, toJsonSchema, sanitizeToolName } from '../../providers/schema';

const FIXTURE = path.resolve(process.cwd(), 'src/test/fixtures/echoServer.mjs');

describe('parseMcpConfig', () => {
    it('liest das uebliche mcpServers-Format', () => {
        const { servers, error } = parseMcpConfig(JSON.stringify({
            mcpServers: { fs: { command: 'npx', args: ['-y', 'server-filesystem'] } }
        }));
        assert.equal(error, undefined);
        assert.deepEqual(Object.keys(servers), ['fs']);
        assert.equal(servers.fs.command, 'npx');
    });

    it('akzeptiert auch eine nackte Server-Map', () => {
        const { servers } = parseMcpConfig(JSON.stringify({ fs: { command: 'npx' } }));
        assert.deepEqual(Object.keys(servers), ['fs']);
    });

    it('behandelt leere Eingaben als "nichts konfiguriert"', () => {
        assert.deepEqual(parseMcpConfig('').servers, {});
        assert.equal(parseMcpConfig('   ').error, undefined);
    });

    it('meldet kaputtes JSON mit klarer Ursache', () => {
        const { error } = parseMcpConfig('{ "mcpServers": ');
        assert.ok(error && /kein gültiges JSON/.test(error));
    });

    it('ueberspringt Eintraege ohne command oder url', () => {
        const { servers, error } = parseMcpConfig(JSON.stringify({ mcpServers: { leer: { args: [] } } }));
        assert.deepEqual(servers, {});
        assert.ok(error && /command/.test(error));
    });

    it('erkennt den Transport', () => {
        assert.equal(transportOf({ command: 'npx' }), 'stdio');
        assert.equal(transportOf({ url: 'https://example.com/mcp' }), 'http');
        assert.equal(transportOf({}), 'unbekannt');
    });
});

describe('sanitizeToolName', () => {
    it('macht aus beliebigen Namen gueltige Function-Namen', () => {
        assert.equal(sanitizeToolName('read file!'), 'read_file');
        assert.equal(sanitizeToolName('a/b:c'), 'a_b_c');
        assert.equal(sanitizeToolName('...'), 'tool');
        assert.equal(sanitizeToolName('x'.repeat(80), 20).length, 20);
    });
});

describe('toGeminiSchema', () => {
    it('setzt Typen in Grossbuchstaben und laeuft rekursiv', () => {
        const schema = toGeminiSchema({
            type: 'object',
            properties: {
                note: {
                    type: 'object',
                    properties: {
                        title: { type: 'string' },
                        tags: { type: 'array', items: { type: 'string' } }
                    },
                    required: ['title']
                }
            },
            required: ['note']
        });
        assert.equal(schema.type, 'OBJECT');
        assert.equal(schema.properties.note.type, 'OBJECT');
        assert.equal(schema.properties.note.properties.tags.type, 'ARRAY');
        assert.equal(schema.properties.note.properties.tags.items.type, 'STRING');
        assert.deepEqual(schema.properties.note.required, ['title']);
    });

    it('wirft Keywords raus, die Gemini nicht kennt', () => {
        const schema = toGeminiSchema({
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            additionalProperties: false,
            properties: { a: { type: 'string', pattern: '^x', default: 'x' } }
        });
        assert.equal(schema.$schema, undefined);
        assert.equal(schema.additionalProperties, undefined);
        assert.equal(schema.properties.a.pattern, undefined);
        assert.equal(schema.properties.a.default, undefined);
    });

    it('uebersetzt type-Arrays in nullable', () => {
        const schema = toGeminiSchema({ type: ['string', 'null'] });
        assert.equal(schema.type, 'STRING');
        assert.equal(schema.nullable, true);
    });

    it('macht aus enum immer STRING mit Werten', () => {
        const schema = toGeminiSchema({ type: 'string', enum: ['low', 'high'] });
        assert.deepEqual(schema.enum, ['low', 'high']);
        assert.equal(schema.type, 'STRING');
    });

    it('bricht bei zu tiefer Verschachtelung kontrolliert ab', () => {
        let deep: any = { type: 'string' };
        for (let i = 0; i < 30; i++) { deep = { type: 'object', properties: { next: deep } }; }
        assert.doesNotThrow(() => toGeminiSchema(deep));
    });
});

describe('toJsonSchema', () => {
    it('baut aus flachen Parametern ein Schema', () => {
        const schema = toJsonSchema({
            name: 't', description: 'd',
            parameters: { p: { type: 'string', description: 'x' } },
            required: ['p']
        });
        assert.equal(schema.type, 'object');
        assert.equal(schema.properties.p.type, 'string');
    });

    it('reicht ein mitgeliefertes inputSchema durch und ergaenzt fehlendes type', () => {
        const schema = toJsonSchema({
            name: 't', description: 'd', parameters: {}, required: [],
            inputSchema: { properties: { a: { type: 'number' } } }
        });
        assert.equal(schema.type, 'object');
        assert.equal(schema.properties.a.type, 'number');
    });
});

describe('normalizeToolResult', () => {
    it('fasst Text-Bloecke zusammen', () => {
        const out = normalizeToolResult({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] });
        assert.equal(out.content, 'a\nb');
    });

    it('macht aus isError ein error-Feld', () => {
        const out = normalizeToolResult({ isError: true, content: [{ type: 'text', text: 'kaputt' }] });
        assert.equal(out.error, 'kaputt');
    });

    it('vermerkt nicht darstellbare Inhalte', () => {
        const out = normalizeToolResult({ content: [{ type: 'image', data: 'xx' }] });
        assert.ok(out.note.includes('image'));
    });
});

describe('McpManager gegen einen echten Server', () => {
    const manager = new McpManager();
    after(() => manager.disposeAll());

    const config = JSON.stringify({
        mcpServers: { echo: { command: process.execPath, args: [FIXTURE] } }
    });

    it('verbindet sich und liest die Tool-Liste', async () => {
        const statuses = await manager.sync(config);
        assert.equal(statuses.length, 1);
        assert.equal(statuses[0].state, 'connected', statuses[0].error);
        assert.equal(statuses[0].transport, 'stdio');
        assert.equal(statuses[0].toolCount, 3);
    });

    it('benennt die Tools eindeutig um', () => {
        const names = manager.getTools().map(t => t.name).sort();
        assert.deepEqual(names, ['mcp__echo__always_fails', 'mcp__echo__echo', 'mcp__echo__save_note']);
        assert.ok(manager.isMcpTool('mcp__echo__echo'));
        assert.ok(!manager.isMcpTool('read_file'));
    });

    it('uebernimmt readOnlyHint vom Server', () => {
        assert.equal(manager.isReadOnly('mcp__echo__echo'), true);
        assert.equal(manager.isReadOnly('mcp__echo__save_note'), false);
    });

    it('liefert ein Schema, das alle vier Anbieter verarbeiten koennen', () => {
        const tool = manager.getTools().find(t => t.name === 'mcp__echo__save_note')!;
        const json = toJsonSchema(tool);
        assert.equal(json.type, 'object');
        assert.equal(json.properties.note.type, 'object');

        const gemini = toGeminiSchema(json);
        assert.equal(gemini.type, 'OBJECT');
        assert.equal(gemini.properties.note.type, 'OBJECT');
        assert.equal(gemini.properties.note.properties.title.type, 'STRING');
        assert.equal(gemini.$schema, undefined);
    });

    it('ruft ein Tool auf und liefert das Ergebnis zurueck', async () => {
        const result = await manager.callTool('mcp__echo__echo', { text: 'Moin' });
        assert.equal(result.content, 'echo: Moin');
    });

    it('kommt mit verschachtelten Argumenten klar', async () => {
        const result = await manager.callTool('mcp__echo__save_note', {
            note: { title: 'Testnotiz', tags: ['a', 'b'], priority: 'high' }
        });
        assert.equal(result.content, 'gespeichert: Testnotiz');
    });

    it('reicht Server-Fehler als error durch, ohne zu werfen', async () => {
        const result = await manager.callTool('mcp__echo__always_fails', {});
        assert.ok(result.error.includes('absichtlich fehlgeschlagen'));
    });

    it('meldet unbekannte Tools statt zu werfen', async () => {
        const result = await manager.callTool('mcp__echo__gibtsnicht', {});
        assert.ok(result.error.includes('Unbekanntes MCP-Tool'));
    });

    it('laesst unveraenderte Server bei sync() weiterlaufen', async () => {
        const before = manager.getStatuses();
        await manager.sync(config);
        const after = manager.getStatuses();
        assert.deepEqual(before, after);
    });

    it('beendet entfernte Server', async () => {
        await manager.sync('');
        assert.deepEqual(manager.getStatuses(), []);
        assert.deepEqual(manager.getTools(), []);
    });

    it('ueberlebt einen Server, der gar nicht startet', async () => {
        const statuses = await manager.sync(JSON.stringify({
            mcpServers: { kaputt: { command: 'gibt-es-definitiv-nicht-xyz' } }
        }));
        assert.equal(statuses[0].state, 'error');
        assert.ok(statuses[0].error);
        assert.deepEqual(manager.getTools(), []);
    });
});

describe('McpManager ueber Streamable HTTP', () => {
    const HTTP_FIXTURE = path.resolve(process.cwd(), 'src/test/fixtures/httpServer.mjs');
    const PORT = 38000 + Math.floor(Math.random() * 1000);
    const manager = new McpManager();
    let server: ChildProcess;

    before(async () => {
        server = spawn(process.execPath, [HTTP_FIXTURE, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('HTTP-Server startete nicht')), 10_000);
            server.stdout!.on('data', chunk => {
                if (String(chunk).includes('READY')) { clearTimeout(timer); resolve(); }
            });
            server.on('error', reject);
        });
    });

    after(async () => {
        await manager.disposeAll();
        server.kill();
    });

    it('verbindet sich per URL und liest die Tools', async () => {
        const statuses = await manager.sync(JSON.stringify({
            mcpServers: { web: { url: `http://127.0.0.1:${PORT}/mcp` } }
        }));
        assert.equal(statuses[0].state, 'connected', statuses[0].error);
        assert.equal(statuses[0].transport, 'http');
        assert.deepEqual(manager.getTools().map(t => t.name), ['mcp__web__ping']);
    });

    it('ruft ein Tool ueber HTTP auf', async () => {
        const result = await manager.callTool('mcp__web__ping', { name: 'Peter' });
        assert.equal(result.content, 'pong Peter');
    });

    it('meldet einen nicht erreichbaren HTTP-Server als Fehler statt zu haengen', async () => {
        const statuses = await manager.sync(JSON.stringify({
            mcpServers: { tot: { url: 'http://127.0.0.1:1/mcp' } }
        }));
        assert.equal(statuses[0].state, 'error');
        assert.ok(statuses[0].error);
    });
});
