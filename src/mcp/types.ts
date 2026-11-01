/**
 * Konfiguration der MCP-Server.
 *
 * Das Format folgt dem, was Claude Desktop und die übrigen MCP-Clients nutzen,
 * damit sich bestehende Konfigurationen direkt übernehmen lassen:
 *
 * {
 *   "mcpServers": {
 *     "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/pfad"] },
 *     "github":     { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
 *                     "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "..." } }
 *   }
 * }
 */

export interface McpServerConfig {
    /** stdio: ausführbares Programm. */
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    /** HTTP: Endpunkt eines Streamable-HTTP-Servers. */
    url?: string;
    headers?: Record<string, string>;
    /** Server in der Konfiguration lassen, aber nicht starten. */
    disabled?: boolean;
}

export type McpServerState = 'connected' | 'connecting' | 'error' | 'disabled';

export interface McpServerStatus {
    name: string;
    state: McpServerState;
    transport: 'stdio' | 'http' | 'unbekannt';
    toolCount: number;
    toolNames: string[];
    error?: string;
}

export interface ParsedMcpConfig {
    servers: Record<string, McpServerConfig>;
    /** Gesetzt, wenn die Konfiguration nicht lesbar war. */
    error?: string;
}

/**
 * Liest die Konfiguration aus dem Textfeld der AI Engine.
 * Akzeptiert sowohl die übliche `{ "mcpServers": { ... } }`-Form als auch eine
 * nackte Server-Map, weil beides im Umlauf ist.
 */
export function parseMcpConfig(raw: string): ParsedMcpConfig {
    const text = (raw ?? '').trim();
    if (!text) { return { servers: {} }; }

    let data: any;
    try {
        data = JSON.parse(text);
    } catch (e: any) {
        return { servers: {}, error: `MCP-Konfiguration ist kein gültiges JSON: ${e.message}` };
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { servers: {}, error: 'MCP-Konfiguration muss ein JSON-Objekt sein.' };
    }

    const source = (data.mcpServers && typeof data.mcpServers === 'object')
        ? data.mcpServers
        : data;

    const servers: Record<string, McpServerConfig> = {};
    for (const [name, value] of Object.entries(source)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) { continue; }
        const entry = value as McpServerConfig;
        if (!entry.command && !entry.url) { continue; }
        servers[name] = entry;
    }

    if (Object.keys(servers).length === 0) {
        return {
            servers: {},
            error: 'Kein Server mit "command" oder "url" gefunden. Erwartet wird z. B. '
                + '{ "mcpServers": { "filesystem": { "command": "npx", "args": [...] } } }'
        };
    }

    return { servers };
}

/** Transport-Art einer Server-Konfiguration. */
export function transportOf(config: McpServerConfig): 'stdio' | 'http' | 'unbekannt' {
    if (config.command) { return 'stdio'; }
    if (config.url) { return 'http'; }
    return 'unbekannt';
}
