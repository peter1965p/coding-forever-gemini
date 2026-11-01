// Brücke zum Extension Host. acquireVsCodeApi() darf pro Webview nur EINMAL
// aufgerufen werden — deshalb liegt das Ergebnis hier als Singleton.
declare function acquireVsCodeApi(): {
    postMessage: (message: any) => void;
    getState: () => any;
    setState: (state: any) => void;
};

export const vscode = acquireVsCodeApi();

export interface PublicSettings {
    localEnabled: boolean;
    baseUrl: string;
    modelName: string;
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
        localEnabled: false,
        baseUrl: 'http://localhost:11434',
        modelName: 'llama3.2',
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
    label: string;
    models: ModelInfo[];
    hint?: string;
}

/** Präfix, mit dem eine Modell-ID an die Extension geschickt wird. */
export function qualifyModelId(providerId: ModelGroup['providerId'], id: string): string {
    return providerId === 'gemini' ? id : `${providerId}:${id}`;
}
