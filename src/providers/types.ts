/**
 * Provider-neutrale Typen für den Agent-Loop.
 *
 * Vorher hatte jeder Anbieter (Gemini/Groq/Ollama) seine eigene, fast identische
 * Turn-Schleife in extension.ts — inklusive eigener Fehlerbehandlung, die genau
 * deshalb auseinanderlief. Jetzt kennt der Loop nur noch dieses Interface, und
 * jeder Provider übersetzt intern in sein eigenes Wire-Format.
 */

export type AgentRole = 'user' | 'assistant' | 'tool';

export interface ToolCall {
    id: string;
    name: string;
    args: Record<string, any>;
}

export interface AgentMessage {
    role: AgentRole;
    /** Freitext; bei role === 'tool' das JSON-serialisierte Tool-Ergebnis. */
    content: string;
    /** Nur bei role === 'assistant': vom Modell angeforderte Tool-Aufrufe. */
    toolCalls?: ToolCall[];
    /** Nur bei role === 'tool': auf welchen Aufruf sich das Ergebnis bezieht. */
    toolCallId?: string;
    /** Nur bei role === 'tool': Tool-Name (Gemini braucht ihn, OpenAI nicht). */
    toolName?: string;
}

export type ToolParamType = 'string' | 'number' | 'boolean';

export interface ToolParam {
    type: ToolParamType;
    description: string;
}

/** Ein Tool in anbieter-neutraler Form; die Provider mappen auf ihr Schema. */
export interface ToolDef {
    name: string;
    description: string;
    /** Flache Parameter — reicht für die eingebauten Tools. */
    parameters: Record<string, ToolParam>;
    required: string[];
    /**
     * Vollständiges JSON Schema, das `parameters` ersetzt. MCP-Server liefern
     * beliebig verschachtelte Schemata, die sich nicht flach abbilden lassen.
     */
    inputSchema?: Record<string, any>;
    /** Gesetzt bei Tools, die von einem MCP-Server stammen. */
    source?: { kind: 'mcp'; server: string; remoteName: string; readOnly: boolean };
}

export interface ChatRequest {
    model: string;
    system: string;
    messages: AgentMessage[];
    tools: ToolDef[] | null;
    signal: AbortSignal;
    /** Wird pro gestreamtem Text-Fragment aufgerufen. */
    onDelta?: (text: string) => void;
}

export interface ChatResult {
    text: string;
    toolCalls: ToolCall[];
}

export interface ModelInfo {
    id: string;
    label?: string;
    note?: string;
}

export interface LlmProvider {
    /** Anzeigename für Status-Meldungen im Chat. */
    readonly label: string;
    /** Führt genau einen Turn aus und streamt Text über req.onDelta. */
    chat(req: ChatRequest): Promise<ChatResult>;
}

/** Fehler, der dem Nutzer wörtlich angezeigt werden darf. */
export class ProviderError extends Error {}

/**
 * Das Modell existiert, lehnt aber extern definiertes Function-Calling ab
 * (z.B. groq/compound, das nur seine eingebauten Tools akzeptiert).
 * Der Loop wiederholt den Turn dann einmalig ohne Tools.
 */
export class ToolsUnsupportedError extends ProviderError {}

/** Tool-Argumente kommen je nach Anbieter als JSON-String oder als Objekt. */
export function parseToolArgs(raw: unknown): Record<string, any> {
    if (raw && typeof raw === 'object') { return raw as Record<string, any>; }
    if (typeof raw !== 'string' || !raw.trim()) { return {}; }
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}
