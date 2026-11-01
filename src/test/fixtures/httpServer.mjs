/**
 * MCP-Server über Streamable HTTP (stateless) für den Transport-Test.
 * Start: node httpServer.mjs <port> — meldet "READY" auf stdout, sobald er lauscht.
 */
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

function buildServer() {
    const server = new McpServer({ name: 'http-test-server', version: '1.0.0' });
    server.registerTool(
        'ping',
        {
            description: 'Antwortet mit pong und dem übergebenen Namen.',
            inputSchema: { name: z.string() },
            annotations: { readOnlyHint: true }
        },
        async ({ name }) => ({ content: [{ type: 'text', text: `pong ${name}` }] })
    );
    return server;
}

const port = Number(process.argv[2]);
const httpServer = http.createServer(async (req, res) => {
    if (req.url !== '/mcp' || req.method !== 'POST') {
        res.writeHead(405).end();
        return;
    }
    const chunks = [];
    for await (const chunk of req) { chunks.push(chunk); }
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');

    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
});

httpServer.listen(port, '127.0.0.1', () => console.log('READY'));
