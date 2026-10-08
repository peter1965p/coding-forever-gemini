/**
 * Minimaler vscode-Ersatz für die Unit-Tests. Die echte API steht nur im
 * Extension Host zur Verfügung; esbuild ersetzt das Modul beim Test-Build
 * über --alias:vscode.
 */
export const testState = {
    workspaceRoot: '/tmp/cf-workspace' as string | undefined,
    config: {} as Record<string, unknown>,
    diagnostics: [] as Array<[any, any[]]>,
    files: [] as string[]
};

export const Uri = {
    file: (fsPath: string) => ({ fsPath, scheme: 'file', toString: () => `file://${fsPath}` }),
    parse: (value: string) => ({ fsPath: value, scheme: 'stub', toString: () => value })
};

export const workspace = {
    get workspaceFolders() {
        return testState.workspaceRoot
            ? [{ name: 'cf-workspace', uri: Uri.file(testState.workspaceRoot) }]
            : undefined;
    },
    getConfiguration: () => ({
        get: (key: string, fallback?: unknown) =>
            key in testState.config ? testState.config[key] : fallback
    }),
    asRelativePath: (value: any) => {
        const fsPath = typeof value === 'string' ? value : value.fsPath;
        const root = testState.workspaceRoot ?? '';
        return fsPath.startsWith(root) ? fsPath.slice(root.length + 1) : fsPath;
    },
    findFiles: async () => testState.files.map(file => Uri.file(file)),
    registerTextDocumentContentProvider: () => ({ dispose: () => undefined })
};

export const window = {
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    createTerminal: () => ({ show: () => undefined, sendText: () => undefined })
};

export const languages = {
    getDiagnostics: (uri?: any) => (uri ? [] : testState.diagnostics)
};

export enum DiagnosticSeverity { Error = 0, Warning = 1, Information = 2, Hint = 3 }

export const env = { openExternal: async () => true };
export const commands = { executeCommand: async () => undefined };
export class EventEmitter<T> {
    event = (_listener: (value: T) => void) => ({ dispose: () => undefined });
    fire(_value: T) { /* no-op */ }
}
export const ProgressLocation = { Notification: 15 };
