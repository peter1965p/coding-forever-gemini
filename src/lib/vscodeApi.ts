// Brücke zum Extension Host. acquireVsCodeApi() darf pro Webview nur EINMAL
// aufgerufen werden — deshalb liegt das Ergebnis hier als Singleton.
declare function acquireVsCodeApi(): {
    postMessage: (message: any) => void;
    getState: () => any;
    setState: (state: any) => void;
};

export const vscode = acquireVsCodeApi();

export interface OllamaInstance {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
}

/** Ergebnis des Statuschecks einer Ollama-Instanz. */
export interface OllamaStatus {
    id: string;
    reachable: boolean;
    latencyMs?: number;
    modelCount?: number;
    version?: string;
    error?: string;
}

export interface PublicSettings {
    ollamaInstances: OllamaInstance[];
    mcpConfig: string;
    userName: string;
    chatFont: string;
    chatFontSize: number;
    hasGeminiKey: boolean;
    hasGroqKey: boolean;
    hasClaudeKey: boolean;
    hasOpenaiKey: boolean;
}

export interface Bootstrap {
    route: string;
    extName: string;
    extVersion: string;
    workspaceName: string;
    osUser: string;
    settings: PublicSettings;
}

const FALLBACK: Bootstrap = {
    route: 'chat',
    extName: 'coding-forever',
    extVersion: '0.0.0',
    workspaceName: 'Global',
    osUser: '',
    settings: {
        ollamaInstances: [],
        mcpConfig: '',
        userName: '',
        chatFont: 'var(--vscode-font-family)',
        chatFontSize: 12,
        hasGeminiKey: false,
        hasGroqKey: false,
        hasClaudeKey: false,
        hasOpenaiKey: false
    }
};

/** Die von der Extension ins HTML gelegten Startwerte. */
export const bootstrap: Bootstrap = {
    ...FALLBACK,
    ...((window as any).CODING_FOREVER ?? {}),
    settings: { ...FALLBACK.settings, ...((window as any).CODING_FOREVER?.settings ?? {}) }
};

export interface ModelInfo {
    id: string;
    label?: string;
    note?: string;
}

export interface ModelGroup {
    providerId: 'gemini' | 'groq' | 'openai' | 'claude' | 'local';
    /** Nur bei Ollama: zu welcher Instanz die Gruppe gehört. */
    instanceId?: string;
    label: string;
    models: ModelInfo[];
    hint?: string;
}

/** Präfix, mit dem eine Modell-ID an die Extension geschickt wird. */
export function qualifyModelId(
    group: Pick<ModelGroup, 'providerId' | 'instanceId'>,
    id: string
): string {
    if (group.providerId === 'gemini') { return id; }
    // Ollama: die Instanz gehört in die ID, sonst weiß die Extension nicht, welcher Rechner gemeint ist.
    if (group.providerId === 'local') { return `ollama:${group.instanceId ?? 'lokal'}:${id}`; }
    return `${group.providerId}:${id}`;
}

/** Eindeutiger React-Schlüssel einer Gruppe — mehrere Ollama-Gruppen teilen sich die providerId. */
export function groupKey(group: Pick<ModelGroup, 'providerId' | 'instanceId'>): string {
    return group.instanceId ? `${group.providerId}:${group.instanceId}` : group.providerId;
}

/** Ob mindestens eine Ollama-Instanz eingeschaltet ist. */
export function hasActiveOllama(settings: PublicSettings): boolean {
    return settings.ollamaInstances.some(instance => instance.enabled);
}
