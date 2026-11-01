/**
 * Winziger MCP-Server für die Tests: deckt ein nur-lesendes Tool, ein
 * schreibendes mit verschachteltem Schema und einen Fehlerfall ab.
 * Wird von mcp.test.ts per stdio gestartet.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'echo-test-server', version: '1.0.0' });

server.registerTool(
    'echo',
    {
        description: 'Gibt den übergebenen Text zurück.',
        inputSchema: { text: z.string().describe('Der Text.') },
        annotations: { readOnlyHint: true }
    },
    async ({ text }) => ({ content: [{ type: 'text', text: `echo: ${text}` }] })
);

server.registerTool(
    'save_note',
    {
        description: 'Legt eine Notiz mit Metadaten ab.',
        inputSchema: {
            note: z.object({
                title: z.string(),
                tags: z.array(z.string()).optional(),
                priority: z.enum(['low', 'high']).optional()
            }).describe('Die Notiz.')
        }
    },
    async ({ note }) => ({ content: [{ type: 'text', text: `gespeichert: ${note.title}` }] })
);

server.registerTool(
    'always_fails',
    { description: 'Meldet immer einen Fehler.', inputSchema: {} },
    async () => ({ isError: true, content: [{ type: 'text', text: 'absichtlich fehlgeschlagen' }] })
);

await server.connect(new StdioServerTransport());
