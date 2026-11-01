import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { sanitizeToolName } from '../providers/schema';
import { ToolDef } from '../providers/types';
import { McpServerConfig, McpServerStatus, parseMcpConfig, transportOf } from './types';

const CLIENT_INFO = { name: 'coding-forever', version: '3.0.0' };
const TOOL_PREFIX = 'mcp__';
const CONNECT_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 120_000;
const MAX_RESULT_CHARS = 24_000;

interface Connection {
    name: string;
    /** JSON der Konfiguration — damit sync() erkennt, was sich geändert hat. */
    fingerprint: string;
    client?: Client;
    status: McpServerStatus;
    /** Von diesem Server bereitgestellte Tools, bereits umbenannt. */
    tools: ToolDef[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            error => { clearTimeout(timer); reject(error); }
        );
    });
}

/**
 * Hält die Verbindungen zu den konfigurierten MCP-Servern und stellt deren
 * Tools so bereit, dass der Agent-Loop sie nicht von den eingebauten
 * unterscheiden muss.
 */
export class McpManager {
    private connections = new Map<string, Connection>();
    /** Exponierter Tool-Name → Server und ursprünglicher Name. */
    private routes = new Map<string, { server: string; remoteName: string; readOnly: boolean }>();
    private log: (message: string) => void;

    constructor(log: (message: string) => void = () => undefined) {
        this.log = log;
    }

    /** Alle Tools aller verbundenen Server, für den Agent-Loop. */
    getTools(): ToolDef[] {
        return [...this.connections.values()].flatMap(connection => connection.tools);
    }

    getStatuses(): McpServerStatus[] {
        return [...this.connections.values()]
            .map(connection => connection.status)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    isMcpTool(toolName: string): boolean {
        return this.routes.has(toolName);
    }

    /** Ob ein Tool laut Server nur liest — dann ist keine Rückfrage nötig. */
    isReadOnly(toolName: string): boolean {
        return this.routes.get(toolName)?.readOnly === true;
    }

    describe(toolName: string): string {
        const route = this.routes.get(toolName);
        return route ? `${route.server}: ${route.remoteName}` : toolName;
    }

    /**
     * Bringt die Verbindungen mit der Konfiguration in Deckung: Neues wird
     * gestartet, Geändertes neu verbunden, Entferntes beendet. Unveränderte
     * Server laufen weiter, damit das Speichern der Einstellungen nicht jedes
     * Mal alle Prozesse durchstartet.
     */
    async sync(rawConfig: string): Promise<McpServerStatus[]> {
        const parsed = parseMcpConfig(rawConfig);

        if (parsed.error) {
            await this.disposeAll();
            this.connections.set('__config__', {
                name: 'Konfiguration',
                fingerprint: '',
                status: {
                    name: 'Konfiguration',
                    state: 'error',
                    transport: 'unbekannt',
                    toolCount: 0,
                    toolNames: [],
                    error: parsed.error
                },
                tools: []
            });
            return this.getStatuses();
        }

        this.connections.delete('__config__');
        const wanted = parsed.servers;

        // Verschwundene oder geänderte Server abräumen.
        for (const [name, connection] of [...this.connections.entries()]) {
            const config = wanted[name];
            if (!config || JSON.stringify(config) !== connection.fingerprint) {
                await this.closeConnection(name);
            }
        }

        // Neue und geänderte Server aufbauen — parallel, ein Ausfall darf die
        // anderen nicht blockieren.
        await Promise.all(
            Object.entries(wanted)
                .filter(([name]) => !this.connections.has(name))
                .map(([name, config]) => this.connect(name, config))
        );

        this.rebuildRoutes();
        return this.getStatuses();
    }

    private rebuildRoutes(): void {
        this.routes.clear();
        for (const connection of this.connections.values()) {
            for (const tool of connection.tools) {
                if (tool.source?.kind === 'mcp') {
                    this.routes.set(tool.name, {
                        server: tool.source.server,
                        remoteName: tool.source.remoteName,
                        readOnly: tool.source.readOnly
                    });
                }
            }
        }
    }

    private async connect(name: string, config: McpServerConfig): Promise<void> {
        const fingerprint = JSON.stringify(config);
        const transport = transportOf(config);

        const status: McpServerStatus = {
            name,
            state: config.disabled ? 'disabled' : 'connecting',
            transport,
            toolCount: 0,
            toolNames: []
        };
        this.connections.set(name, { name, fingerprint, status, tools: [] });

        if (config.disabled) { return; }

        let client: Client | undefined;
        try {
            client = new Client(CLIENT_INFO, { capabilities: {} });

            const clientTransport = config.command
                ? new StdioClientTransport({
                    command: config.command,
                    args: config.args ?? [],
                    cwd: config.cwd,
                    // Ohne das Default-Environment fehlen PATH und HOME, und
                    // schon ein simples "npx ..." findet sich selbst nicht.
                    env: { ...getDefaultEnvironment(), ...(config.env ?? {}) },
                    stderr: 'pipe'
                })
                : new StreamableHTTPClientTransport(new URL(config.url!), {
                    requestInit: { headers: config.headers }
                });

            await withTimeout(
                client.connect(clientTransport),
                CONNECT_TIMEOUT_MS,
                `Verbindung nach ${CONNECT_TIMEOUT_MS / 1000}s abgelaufen`
            );

            const listed = await withTimeout(
                client.listTools(),
                CONNECT_TIMEOUT_MS,
                'Server hat die Tool-Liste nicht geliefert'
            );

            const tools = (listed.tools ?? []).map(tool => this.toToolDef(name, tool));

            this.connections.set(name, {
                name,
                fingerprint,
                client,
                tools,
                status: {
                    name,
                    state: 'connected',
                    transport,
                    toolCount: tools.length,
                    toolNames: tools.map(tool => tool.source!.remoteName)
                }
            });
            this.log(`MCP "${name}" verbunden (${tools.length} Tools).`);
        } catch (error: any) {
            const message = String(error?.message ?? error);
            this.log(`MCP "${name}" fehlgeschlagen: ${message}`);
            try { await client?.close(); } catch { /* schon tot */ }

            this.connections.set(name, {
                name,
                fingerprint,
                tools: [],
                status: { name, state: 'error', transport, toolCount: 0, toolNames: [], error: message }
            });
        }
    }

    /**
     * Benennt ein Server-Tool eindeutig um. Zwei Server können dasselbe Tool
     * anbieten ("search"), und die Modelle brauchen eindeutige Function-Namen.
     */
    private toToolDef(server: string, tool: any): ToolDef {
        const remoteName = String(tool.name ?? 'tool');
        const serverSlug = sanitizeToolName(server, 20);
        const toolSlug = sanitizeToolName(remoteName, 34);

        const annotations = tool.annotations ?? {};
        const readOnly = annotations.readOnlyHint === true;

        return {
            name: `${TOOL_PREFIX}${serverSlug}__${toolSlug}`,
            description: [
                tool.title || tool.description || `Tool "${remoteName}" vom MCP-Server "${server}".`,
                tool.title && tool.description ? tool.description : ''
            ].filter(Boolean).join(' — ').slice(0, 1024),
            parameters: {},
            required: [],
            inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
            source: { kind: 'mcp', server, remoteName, readOnly }
        };
    }

    /** Ruft ein Tool auf dem zuständigen Server auf. */
    async callTool(toolName: string, args: Record<string, any>, signal?: AbortSignal): Promise<any> {
        const route = this.routes.get(toolName);
        if (!route) { return { error: `Unbekanntes MCP-Tool: ${toolName}` }; }

        const connection = this.connections.get(route.server);
        if (!connection?.client) {
            return { error: `MCP-Server "${route.server}" ist nicht verbunden.` };
        }

        try {
            const result: any = await connection.client.callTool(
                { name: route.remoteName, arguments: args ?? {} },
                undefined,
                { timeout: CALL_TIMEOUT_MS, signal }
            );
            return normalizeToolResult(result);
        } catch (error: any) {
            if (error?.name === 'AbortError') { throw error; }
            return { error: `MCP "${route.server}/${route.remoteName}": ${error?.message ?? error}` };
        }
    }

    private async closeConnection(name: string): Promise<void> {
        const connection = this.connections.get(name);
        this.connections.delete(name);
        if (!connection?.client) { return; }
        try {
            await withTimeout(connection.client.close(), 5000, 'Timeout beim Beenden');
        } catch (error: any) {
            this.log(`MCP "${name}" ließ sich nicht sauber beenden: ${error.message}`);
        }
    }

    async disposeAll(): Promise<void> {
        await Promise.all([...this.connections.keys()].map(name => this.closeConnection(name)));
        this.connections.clear();
        this.routes.clear();
    }
}

/**
 * Das MCP-Ergebnisformat (Liste von Content-Blöcken) auf etwas eindampfen,
 * das ein Modell gut verarbeiten kann.
 */
export function normalizeToolResult(result: any): any {
    if (!result || typeof result !== 'object') { return { result }; }

    const blocks: any[] = Array.isArray(result.content) ? result.content : [];
    const texts: string[] = [];
    const extras: string[] = [];

    for (const block of blocks) {
        if (block?.type === 'text' && typeof block.text === 'string') {
            texts.push(block.text);
        } else if (block?.type === 'resource' && block.resource?.text) {
            texts.push(String(block.resource.text));
        } else if (block?.type) {
            // Bilder und Audio kann der Agent-Loop nicht weiterreichen.
            extras.push(block.type);
        }
    }

    let text = texts.join('\n');
    let truncated = false;
    if (text.length > MAX_RESULT_CHARS) {
        text = `${text.slice(0, MAX_RESULT_CHARS)}\n... (gekürzt)`;
        truncated = true;
    }

    const out: any = {};
    if (text) { out.content = text; }
    if (result.structuredContent !== undefined) { out.structuredContent = result.structuredContent; }
    if (extras.length > 0) { out.note = `Nicht darstellbare Inhalte übersprungen: ${extras.join(', ')}.`; }
    if (truncated) { out.truncated = true; }

    if (result.isError) {
        return { error: text || 'Der MCP-Server meldet einen Fehler.', ...(out.structuredContent ? { structuredContent: out.structuredContent } : {}) };
    }

    return Object.keys(out).length > 0 ? out : { success: true };
}

export const MCP_TOOL_PREFIX = TOOL_PREFIX;
