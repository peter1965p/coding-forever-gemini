import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { getChatHtml } from './pages/chat';
import { getDashHtml } from './pages/dash';
import { getSettingsHtml } from './pages/settings';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Extension "coding-forever" ist aktiv mit Agentic-Power.');

    // --- 1. DATEN-ÜBERNAHME & MIGRATION BEI INSTALLATION/UPDATE ---
    await handleDataMigration(context);

    // --- 2. AUTOMATISCHER GITHUB UPDATE-CHECK ---
    checkForGitHubUpdates(context);

    // 1. Chat Tab öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.openChatTab', () => {
            CodingForeverPanel.createOrShow(context);
        })
    );

    // 2. Dashboard öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.openDashboard', () => {
            DashboardPanel.createOrShow(context);
        })
    );

    // 3. Settings öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.openSettings', () => {
            SettingsPanel.createOrShow(context);
        })
    );

    // Webview View Provider (Sidebar)
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('codingForeverView', {
            resolveWebviewView(view) {
                const pkg = context.extension.packageJSON;
                view.webview.options = { enableScripts: true };
                view.webview.html = getChatHtml(context, pkg.name, pkg.version);

                view.webview.onDidReceiveMessage(async msg => {
                    try {
                        if (msg.type === 'runChat') {
                            await handleAgent(view, context, msg.prompt, msg.model, msg.bypass, msg.autoAccept);
                        } else if (msg.type === 'applyCodeToEditor') {
                            await applyCodeToActiveEditor(msg.code);
                        } else if (msg.type === 'executeCommand') {
                            await runTerminalCommand(msg.command);
                        } else if (msg.type === 'openChat') {
                            CodingForeverPanel.createOrShow(context);
                        } else if (msg.type === 'openDashboard') {
                            DashboardPanel.createOrShow(context);
                        } else if (msg.type === 'openSettings') {
                            SettingsPanel.createOrShow(context);
                        } else if (msg.type === 'checkUpdates') {
                            checkForGitHubUpdates(context, true);
                        }
                    } catch (e: any) {
                        console.error("Fehler im Message Handler:", e);
                    }
                });
            }
        })
    );
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
                const latestVersion = release.tag_name.replace('v', '');

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
        if (l > c) { return true;  }
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

async function handleAgent(
    target: vscode.WebviewView | vscode.WebviewPanel,
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

    target.webview.postMessage({ type: 'response', text: '🤖 Agent analysiert Workspace & bereitet Aktionen vor...' });

    const fileList = await listWorkspaceFiles();
    const editor = vscode.window.activeTextEditor;
    const activeCode = editor ? editor.document.getText() : '';
    const activeFileName = editor ? editor.document.fileName : 'Keine Datei offen';

    const payloadText = `Du bist ein autonomer Fullstack-Entwickler-Agent.
Projekt-Dateien:
${fileList}

Aktive Datei: ${activeFileName}
Code:
\`\`\`
${activeCode}
\`\`\`

Modus: Bypass=${bypass}, AutoAccept=${autoAccept}

Aufgabe: ${prompt}

Antworte im Klartext, aber wenn du Code-Dateien erstellen/ändern willst oder NPM-Befehle ausführen musst, nutze strukturierte Blöcke:
Für Dateien:
FILE: pfad/zur/datei.ts
\`\`\`typescript
// code hier
\`\`\`

Für Terminal-Befehle (nur wenn AutoAccept aktiv ist):
CMD: npm install ...`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: payloadText }] }]
            })
        });

        const data: any = await res.json();
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Keine Antwort erhalten.';
        
        if (bypass || autoAccept) {
            await processAutonomousActions(answer, autoAccept);
        }

        target.webview.postMessage({ type: 'response', text: answer });
    } catch (e: any) {
        target.webview.postMessage({ type: 'response', text: `Netzwerkfehler: ${e.message}` });
    }
}

async function processAutonomousActions(aiResponse: string, autoAccept: boolean) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const rootPath = workspaceFolders[0].uri.fsPath;

    const fileRegex = /FILE:\s*([^\n]+)\s*```[a-zA-Z]*\n([\s\S]*?)```/g;
    let match;
    while ((match = fileRegex.exec(aiResponse)) !== null) {
        const relativeFilePath = match[1].trim();
        const fileContent = match[2];
        const absolutePath = path.join(rootPath, relativeFilePath);

        if (autoAccept || await confirmAction(`Soll die Datei ${relativeFilePath} überschrieben/erstellt werden?`)) {
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(absolutePath, fileContent, 'utf8');
            vscode.window.showInformationMessage(`Agent hat Datei geschrieben: ${relativeFilePath}`);
        }
    }

    if (autoAccept) {
        const cmdRegex = /CMD:\s*([^\n]+)/g;
        let cmdMatch;
        while ((cmdMatch = cmdRegex.exec(aiResponse)) !== null) {
            const command = cmdMatch[1].trim();
            await runTerminalCommand(command);
        }
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

async function applyCodeToActiveEditor(code: string) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        await editor.edit(editBuilder => {
            editBuilder.replace(editor.selection, code);
        });
        vscode.window.showInformationMessage('Code in Editor übernommen!');
    }
}

// Panel-Klasse für den Chat (Editor Tab)
class CodingForeverPanel {
    public static currentPanel: CodingForeverPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, private readonly context: vscode.ExtensionContext) {
        this._panel = panel;
        this._panel.webview.options = { enableScripts: true };
        const pkg = context.extension.packageJSON;
        this._panel.webview.html = getChatHtml(context, pkg.name, pkg.version);

        this._panel.webview.onDidReceiveMessage(async msg => {
            try {
                if (msg.type === 'runChat') {
                    await handleAgent(this._panel, context, msg.prompt, msg.model, msg.bypass, msg.autoAccept);
                } else if (msg.type === 'applyCodeToEditor') {
                    await applyCodeToActiveEditor(msg.code);
                } else if (msg.type === 'executeCommand') {
                    await runTerminalCommand(msg.command);
                } else if (msg.type === 'openDashboard') {
                    DashboardPanel.createOrShow(context);
                } else if (msg.type === 'openSettings') {
                    SettingsPanel.createOrShow(context);
                } else if (msg.type === 'checkUpdates') {
                    checkForGitHubUpdates(context, true);
                }
            } catch (e: any) {
                console.error("Fehler im Panel Message Handler:", e);
            }
        }, null, this._disposables);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (CodingForeverPanel.currentPanel) {
            CodingForeverPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel('codingForeverPanel', 'Coding Forever Chat', column || vscode.ViewColumn.One, { enableScripts: true });
        CodingForeverPanel.currentPanel = new CodingForeverPanel(panel, context);
    }

    public dispose() {
        CodingForeverPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

// Panel-Klasse für das Dashboard
class DashboardPanel {
    public static createOrShow(context: vscode.ExtensionContext) {
        const panel = vscode.window.createWebviewPanel('codingForeverDashboard', 'Dashboard', vscode.ViewColumn.One, { enableScripts: true });
        const chatFont = context.globalState.get<string>('chatFont') || 'var(--vscode-font-family)';
        panel.webview.html = getDashHtml(chatFont);

        panel.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'openChat') {
                CodingForeverPanel.createOrShow(context);
            } else if (msg.type === 'openSettings') {
                SettingsPanel.createOrShow(context);
            }
        });
    }
}

// Panel-Klasse für die Settings
class SettingsPanel {
    public static createOrShow(context: vscode.ExtensionContext) {
        const panel = vscode.window.createWebviewPanel('codingForeverSettings', 'Einstellungen', vscode.ViewColumn.One, { enableScripts: true });
        const apiKey = context.globalState.get<string>('geminiApiKey') || '';
        const chatFont = context.globalState.get<string>('chatFont') || 'var(--vscode-font-family)';
        
        panel.webview.html = getSettingsHtml(apiKey, true, false, chatFont);

        panel.webview.onDidReceiveMessage(async msg => {
            if (msg.type === 'saveSettings') {
                await context.globalState.update('geminiApiKey', msg.apikey);
                await context.globalState.update('chatFont', msg.chatFont);
                vscode.window.showInformationMessage('Einstellungen erfolgreich gespeichert!');
            }
        });
    }
}

export function deactivate() {}