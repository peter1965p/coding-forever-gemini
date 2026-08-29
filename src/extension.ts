import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { PromptDatabaseManager } from './lib/database';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Extension "coding-forever" ist aktiv mit Agentic-Power, React-Frontend und SQLite Support.');

    // --- 1. DATEN-ÜBERNAHME & MIGRATION BEI INSTALLATION/UPDATE ---
    await handleDataMigration(context);

    // --- 2. AUTOMATISCHER GITHUB UPDATE-CHECK ---
    checkForGitHubUpdates(context);

    // --- 3. SQLITE DATENBANK MANAGER INITIALISIEREN ---
    const dbManager = await PromptDatabaseManager.getInstance(context);

    // 1. Chat Tab öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.openChatTab', async () => {
            await CodingForeverPanel.createOrShow(context, 'chat');
        })
    );

    // 2. Dashboard öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.openDashboard', async () => {
            await CodingForeverPanel.createOrShow(context, 'dashboard');
        })
    );

    // 3. Settings öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.openSettings', async () => {
            await CodingForeverPanel.createOrShow(context, 'settings');
        })
    );

    // Webview View Provider (Sidebar)
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('codingForeverView', {
            async resolveWebviewView(view) {
                view.webview.options = {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'dist'))]
                };

                view.webview.html = getReactWebviewContent(view.webview, context, 'chat');

                view.webview.onDidReceiveMessage(async msg => {
                    await handleWebviewMessage(view, context, dbManager, msg);
                });
            }
        })
    );
}

// Aktuellen Workspace-Namen ermitteln (für projektbezogene Prompts)
function getCurrentWorkspaceName(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.name;
}

// Zentraler Message Handler für Panels & Webview Views
async function handleWebviewMessage(
    target: { webview: vscode.Webview },
    context: vscode.ExtensionContext,
    dbManager: PromptDatabaseManager,
    msg: any
) {
    try {
        if (msg.type === 'runChat') {
            await handleAgent(target, context, msg.prompt, msg.model, msg.bypass, msg.autoAccept);
        } else if (msg.type === 'suggestNext') {
            await handleSuggestNext(target, context);
        } else if (msg.type === 'applyCodeToEditor') {
            await applyCodeToActiveEditor(msg.code);
        } else if (msg.type === 'executeCommand') {
            await runTerminalCommand(msg.command);
        } else if (msg.type === 'openChat') {
            await CodingForeverPanel.createOrShow(context, 'chat');
        } else if (msg.type === 'openDashboard') {
            await CodingForeverPanel.createOrShow(context, 'dashboard');
        } else if (msg.type === 'openSettings') {
            await CodingForeverPanel.createOrShow(context, 'settings');
        } else if (msg.type === 'checkUpdates') {
            checkForGitHubUpdates(context, true);
        } else if (msg.type === 'saveSettings') {
            if (msg.apikey !== undefined) {
                await context.globalState.update('geminiApiKey', msg.apikey);
            }
            if (msg.chatFont !== undefined) {
                await context.globalState.update('chatFont', msg.chatFont);
            }
            vscode.window.showInformationMessage('Einstellungen erfolgreich gespeichert!');
        }
        // --- PROMPT DATABASE HANDLER ---
        else if (msg.type === 'getPrompts' || msg.command === 'getPrompts') {
            const workspaceName = getCurrentWorkspaceName();
            const prompts = await dbManager.getPrompts(workspaceName);
            target.webview.postMessage({ command: 'loadPrompts', data: prompts, type: 'loadPrompts' });
        } else if (msg.type === 'addPrompt' || msg.command === 'addPrompt') {
            const workspaceName = getCurrentWorkspaceName();
            const payload = {
                ...msg.data,
                workspace: msg.data.scope === 'workspace' ? (msg.data.workspace ?? workspaceName ?? null) : null
            };
            await dbManager.addPrompt(payload);
            const updatedPrompts = await dbManager.getPrompts(workspaceName);
            target.webview.postMessage({ command: 'loadPrompts', data: updatedPrompts, type: 'loadPrompts' });
            vscode.window.showInformationMessage(`Prompt-Block "${msg.data.label}" gespeichert!`);
        } else if (msg.type === 'deletePrompt' || msg.command === 'deletePrompt') {
            await dbManager.deletePrompt(msg.id);
            const workspaceName = getCurrentWorkspaceName();
            const updatedPrompts = await dbManager.getPrompts(workspaceName);
            target.webview.postMessage({ command: 'loadPrompts', data: updatedPrompts, type: 'loadPrompts' });
            vscode.window.showInformationMessage('Prompt-Block gelöscht.');
        } else if (msg.type === 'executePrompt' || msg.command === 'executePrompt') {
            await handleExecutePrompt(target, context, msg.prompt);
        }
    } catch (e: any) {
        console.error("Fehler im Message Handler:", e);
    }
}

// React HTML Loader
function getReactWebviewContent(
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
    initialRoute: string
): string {
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'dist', 'bundle.js'))
    );

    const osUsername = process.env.USER || process.env.USERNAME || '';
    const apiKey = context.globalState.get<string>('geminiApiKey') || '';
    const chatFont = context.globalState.get<string>('chatFont') || 'var(--vscode-font-family)';
    const workspaceName = getCurrentWorkspaceName() || 'Global';
    const pkg = context.extension.packageJSON;

    return `<!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; script-src 'unsafe-inline' ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; connect-src https: http://localhost:*;">
        <title>Coding Forever</title>
        <script>
            window.INITIAL_ROUTE = "${initialRoute}";
            window.VSCODE_USER_NAME = "${osUsername}";
            window.INITIAL_API_KEY = "${apiKey}";
            window.INITIAL_CHAT_FONT = "${chatFont}";
            window.EXT_NAME = "${pkg.name}";
            window.EXT_VERSION = "${pkg.version}";
            window.WORKSPACE_NAME = "${workspaceName}";
        </script>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0b0f19;">
        <div id="root"></div>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
}

// Helper zum Verarbeiten dynamischer Prompt-Vorlagen ({selection}, {file})
async function handleExecutePrompt(
    target: { webview: vscode.Webview },
    context: vscode.ExtensionContext,
    templatePrompt: string
) {
    const editor = vscode.window.activeTextEditor;
    let activeCode = '';
    let fileName = 'Keine Datei offen';

    if (editor) {
        fileName = editor.document.fileName;
        activeCode = editor.document.getText(editor.selection) || editor.document.getText();
    }

    const processedPrompt = templatePrompt
        .replace(/\{selection\}/g, activeCode)
        .replace(/\{file\}/g, fileName);

    const defaultModel = 'gemini-1.5-flash';
    await handleAgent(target, context, processedPrompt, defaultModel, false, false);
}

// Funktion 1: Prüft auf alte Versionen/Daten und übernimmt sie
async function handleDataMigration(context: vscode.ExtensionContext) {
    const currentVersion = context.extension.packageJSON.version;
    const storedVersion = context.globalState.get<string>('codingForeverVersion');

    if (!storedVersion) {
        console.log('Coding Forever: Keine vorherige Version gefunden. Frische Einrichtung.');
        await context.globalState.update('codingForeverVersion', currentVersion);
    } else if (storedVersion !== currentVersion) {
        console.log(`Coding Forever: Upgrade von v${storedVersion} auf v${currentVersion}. Alte Daten wurden übernommen.`);
        await context.globalState.update('codingForeverVersion', currentVersion);
    }
}

// Funktion 2: Zieht Updates direkt von deinem GitHub-Repo
function checkForGitHubUpdates(context: vscode.ExtensionContext, manual: boolean = false) {
    const currentVersion = context.extension.packageJSON.version;

    const options = {
        hostname: 'api.github.com',
        path: '/repos/peter1965p/coding-forever-gemini/releases/latest',
        headers: { 'User-Agent': 'Coding-Forever-Extension' }
    };

    https.get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', async () => {
            try {
                if (res.statusCode !== 200) {
                    if (manual) {
                        vscode.window.showInformationMessage('Kein GitHub-Release gefunden oder Verbindung fehlgeschlagen.');
                    }
                    return;
                }

                const release = JSON.parse(data);
                const latestVersion = release.tag_name.replace(/^v/, '');

                if (isNewerVersion(currentVersion, latestVersion)) {
                    const action = await vscode.window.showInformationMessage(
                        `🚀 Ein neues Update für Coding Forever ist verfügbar (v${latestVersion}).`,
                        'GitHub Releases öffnen', 'Später'
                    );
                    if (action === 'GitHub Releases öffnen') {
                        vscode.env.openExternal(vscode.Uri.parse(release.html_url));
                    }
                } else if (manual) {
                    vscode.window.showInformationMessage(`Coding Forever ist auf dem neuesten Stand (v${currentVersion}).`);
                }
            } catch (e) {
                console.error('Fehler beim Parsen der GitHub Updates:', e);
                if (manual) {
                    vscode.window.showErrorMessage('Fehler beim Verarbeiten der Update-Daten.');
                }
            }
        });
    }).on('error', (err) => {
        console.error('Update-Check fehlgeschlagen:', err);
        if (manual) {
            vscode.window.showErrorMessage('Netzwerkfehler beim Prüfen auf Updates.');
        }
    });
}

function isNewerVersion(current: string, latest: string): boolean {
    const currParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);
    for (let i = 0; i < Math.max(currParts.length, latestParts.length); i++) {
        const c = currParts[i] || 0;
        const l = latestParts[i] || 0;
        if (l > c) { return true; }
        if (l < c) { return false; }
    }
    return false;
}

async function listWorkspaceFiles(): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return 'Kein Workspace geöffnet.'; }

    const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
    return files.map(f => vscode.workspace.asRelativePath(f)).join('\n');
}

// --- AGENTIC TOOL-CALLING (ersetzt das alte Regex-Parsing) ---

const AGENT_TOOLS = [{
    functionDeclarations: [
        {
            name: 'list_files',
            description: 'Listet alle Dateien im aktuellen Workspace auf (ohne node_modules).',
            parameters: { type: 'OBJECT', properties: {} }
        },
        {
            name: 'read_file',
            description: 'Liest den Inhalt einer Datei relativ zum Workspace-Root.',
            parameters: {
                type: 'OBJECT',
                properties: { path: { type: 'STRING', description: 'Relativer Pfad zur Datei' } },
                required: ['path']
            }
        },
        {
            name: 'write_file',
            description: 'Erstellt oder überschreibt eine Datei relativ zum Workspace-Root.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    path: { type: 'STRING', description: 'Relativer Pfad zur Datei' },
                    content: { type: 'STRING', description: 'Kompletter neuer Dateiinhalt' }
                },
                required: ['path', 'content']
            }
        },
        {
            name: 'run_command',
            description: 'Führt einen Terminal-Befehl im Workspace-Root aus (z.B. npm install). Nur nutzen wenn wirklich nötig.',
            parameters: {
                type: 'OBJECT',
                properties: { command: { type: 'STRING' } },
                required: ['command']
            }
        }
    ]
}];

function toolStatusLabel(name: string, args: any): string {
    switch (name) {
        case 'list_files': return '📂 Scanne Projektstruktur...';
        case 'read_file': return `📖 Lese ${args.path}...`;
        case 'write_file': return `✍️ Schreibe ${args.path}...`;
        case 'run_command': return `⚡ Führe aus: ${args.command}`;
        default: return `🔧 ${name}...`;
    }
}

async function executeTool(name: string, args: any, autoAccept: boolean): Promise<any> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const rootPath = workspaceFolders?.[0]?.uri.fsPath;

    switch (name) {
        case 'list_files':
            return { files: await listWorkspaceFiles() };

        case 'read_file': {
            if (!rootPath) { return { error: 'Kein Workspace geöffnet.' }; }
            const filePath = path.join(rootPath, args.path);
            if (!fs.existsSync(filePath)) { return { error: `Datei nicht gefunden: ${args.path}` }; }
            return { content: fs.readFileSync(filePath, 'utf8') };
        }

        case 'write_file': {
            if (!rootPath) { return { error: 'Kein Workspace geöffnet.' }; }
            if (!autoAccept && !(await confirmAction(`Soll die Datei "${args.path}" geschrieben werden?`))) {
                return { error: 'Vom Nutzer abgelehnt.' };
            }
            const filePath = path.join(rootPath, args.path);
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
            fs.writeFileSync(filePath, args.content, 'utf8');
            return { success: true };
        }

        case 'run_command': {
            if (!autoAccept) { return { error: 'AutoAccept ist deaktiviert, Befehl wurde nicht ausgeführt.' }; }
            await runTerminalCommand(args.command);
            return { success: true, note: 'Befehl wurde im Terminal gestartet.' };
        }

        default:
            return { error: `Unbekanntes Tool: ${name}` };
    }
}

async function handleAgent(
    target: { webview: vscode.Webview },
    context: vscode.ExtensionContext,
    prompt: string,
    model: string,
    bypass: boolean,
    autoAccept: boolean
) {
    const apiKey = context.globalState.get<string>('geminiApiKey');
    if (!apiKey) {
        target.webview.postMessage({ type: 'response', text: 'Fehler: Kein API-Key hinterlegt!' });
        return;
    }

    const editor = vscode.window.activeTextEditor;
    const activeFileName = editor ? vscode.workspace.asRelativePath(editor.document.uri) : 'keine';

    const systemInstruction = `Du bist "Coding Forever", ein autonomer Fullstack-Entwickler-Agent direkt in VS Code.
Arbeite iterativ und diszipliniert:
1. Verschaff dir zuerst Überblick (list_files, ggf. read_file für relevante Dateien) bevor du etwas änderst.
2. Ändere NUR was für die Aufgabe nötig ist. Erfinde keine Dateien/APIs, die du nicht gesehen hast.
3. Nutze ausschließlich die bereitgestellten Tools für Datei-/Terminal-Aktionen, keine Code-Blöcke im Fließtext.
4. Fasse am Ende kurz zusammen, was du getan hast.

Aktive Datei im Editor: ${activeFileName}
Modus: Bypass=${bypass}, AutoAccept=${autoAccept}`;

    let contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];
    target.webview.postMessage({ type: 'status', text: '🤖 Plane Vorgehen...' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const maxTurns = 10;

    try {
        for (let turn = 0; turn < maxTurns; turn++) {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemInstruction }] },
                    contents,
                    tools: AGENT_TOOLS
                })
            });

            const data: any = await res.json();
            const candidate = data.candidates?.[0];
            const parts: any[] = candidate?.content?.parts ?? [];

            const functionCalls = parts.filter(p => p.functionCall);
            const textParts = parts.filter(p => p.text).map(p => p.text).join('\n').trim();

            if (functionCalls.length === 0) {
                target.webview.postMessage({ type: 'response', text: textParts || 'Keine Antwort erhalten.' });
                return;
            }

            contents.push({ role: 'model', parts });

            const functionResponses: any[] = [];
            for (const fc of functionCalls) {
                const { name, args } = fc.functionCall;
                target.webview.postMessage({ type: 'status', text: toolStatusLabel(name, args) });
                const result = await executeTool(name, args, autoAccept);
                functionResponses.push({ functionResponse: { name, response: { result } } });
            }
            contents.push({ role: 'user', parts: functionResponses });
        }

        target.webview.postMessage({ type: 'response', text: '⚠️ Maximale Anzahl an Schritten (10) erreicht, ohne abzuschließen.' });
    } catch (e: any) {
        target.webview.postMessage({ type: 'response', text: `Netzwerkfehler: ${e.message}` });
    }
}

// Kontextbezogene Vorschläge (Chips im Chat) auf Basis der aktiven Datei
async function handleSuggestNext(
    target: { webview: vscode.Webview },
    context: vscode.ExtensionContext
) {
    const apiKey = context.globalState.get<string>('geminiApiKey');
    if (!apiKey) { return; }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        target.webview.postMessage({ type: 'suggestions', data: [] });
        return;
    }

    const fileName = vscode.workspace.asRelativePath(editor.document.uri);
    const code = editor.document.getText().slice(0, 4000); // kurz halten, kostet sonst unnötig Tokens

    const payload = `Gib mir GENAU 3 kurze, konkrete Vorschläge (je max. 8 Wörter), was als nächstes sinnvoll wäre für diese Datei "${fileName}":

\`\`\`
${code}
\`\`\`

Antworte NUR als JSON-Array von Strings, ohne Erklärung. Beispiel: ["Tests hinzufügen", "Fehlerbehandlung verbessern", "Types präzisieren"]`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: payload }] }] })
        });
        const data: any = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const cleaned = raw.replace(/```json|```/g, '').trim();
        const suggestions = JSON.parse(cleaned);
        target.webview.postMessage({ type: 'suggestions', data: Array.isArray(suggestions) ? suggestions : [] });
    } catch {
        target.webview.postMessage({ type: 'suggestions', data: [] });
    }
}

async function runTerminalCommand(command: string) {
    const terminal = vscode.window.createTerminal({ name: 'Coding Forever Agent' });
    terminal.show();
    terminal.sendText(command);
    vscode.window.showInformationMessage(`Agent führt Befehl aus: ${command}`);
}

async function confirmAction(message: string): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(message, { modal: true }, 'Ja, ausführen', 'Abbrechen');
    return answer === 'Ja, ausführen';
}

async function applyCodeToActiveEditor(rawCode: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('Kein aktiver Editor geöffnet!');
        return;
    }

    let cleanCode = rawCode.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
    const selection = editor.selection;

    await editor.edit(editBuilder => {
        if (!selection.isEmpty) {
            editBuilder.replace(selection, cleanCode);
        } else {
            const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                lastLine.range.end
            );
            editBuilder.replace(fullRange, cleanCode);
        }
    });

    vscode.window.showInformationMessage('Code erfolgreich in den Editor übernommen!');
}

// Panel-Klasse für Webview-Tabs (Chat, Dashboard, Settings)
class CodingForeverPanel {
    public static currentPanels: Map<string, CodingForeverPanel> = new Map();
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly context: vscode.ExtensionContext,
        dbManager: PromptDatabaseManager,
        private readonly route: string
    ) {
        this._panel = panel;
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'dist'))]
        };

        this._panel.webview.html = getReactWebviewContent(this._panel.webview, context, route);

        this._panel.webview.onDidReceiveMessage(async msg => {
            await handleWebviewMessage(this._panel, context, dbManager, msg);
        }, null, this._disposables);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static async createOrShow(context: vscode.ExtensionContext, route: string = 'chat') {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        const existingPanel = CodingForeverPanel.currentPanels.get(route);
        if (existingPanel) {
            existingPanel._panel.reveal(column);
            return;
        }

        const titleMap: Record<string, string> = {
            chat: 'Coding Forever Chat',
            dashboard: 'Coding Forever Dashboard',
            settings: 'Coding Forever Einstellungen'
        };

        const dbManager = await PromptDatabaseManager.getInstance(context);
        const panel = vscode.window.createWebviewPanel(
            `codingForeverPanel_${route}`,
            titleMap[route] || 'Coding Forever',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'dist'))]
            }
        );

        const newPanel = new CodingForeverPanel(panel, context, dbManager, route);
        CodingForeverPanel.currentPanels.set(route, newPanel);
    }

    public dispose() {
        CodingForeverPanel.currentPanels.delete(this.route);
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

export function deactivate() {}