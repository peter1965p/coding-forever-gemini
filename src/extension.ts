import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { getDashHtml } from './pages/dash';
import { getSettingsHtml } from './pages/settings'; // Passe den Pfad an, falls nötig

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

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('codingForeverView', {
            resolveWebviewView(view) {
                const pkg = context.extension.packageJSON;
                view.webview.html = getChatHtml(context, pkg.name, pkg.version);
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
                        } else if (msg.type === 'openSettings') {
                            SettingsPanel.createOrShow(context);
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
        // Frische Installation – prüfen ob es ältere Configs/GlobalStates gab
        console.log('Coding Forever: Keine vorherige Version gefunden. Frische Einrichtung.');
        await context.globalState.update('codingForeverVersion', currentVersion);
    } else if (storedVersion !== currentVersion) {
        // Update-Fall: Alte Version war da. Deine Einstellungen in vscode.workspace.getConfiguration 
        // und context.globalState / secrets bleiben ohnehin erhalten. 
        console.log(`Coding Forever: Upgrade von v${storedVersion} auf v${currentVersion}. Alte Daten wurden übernommen.`);
        
        // Hier könntest du bei Bedarf Daten aus der alten Version transformieren
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

                // Versionsvergleich
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
            }
        });
    }).on('error', (err) => {
        console.error('Update-Check fehlgeschlagen:', err);
    });
}

function isNewerVersion(current: string, latest: string): boolean {
    const currParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);
    for (let i = 0; i < Math.max(currParts.length, latestParts.length); i++) {
        const c = currParts[i] || 0;
        const l = latestParts[i] || 0;
        if (l > c) {
            return true;
        }
        if (l < c) {
            return false;
        }
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

function getChatHtml(context: vscode.ExtensionContext): string {
    return `<!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: var(--vscode-font-family); background: #0b0f19; color: #f9fafb; margin: 0; padding: 10px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
            #chatHistory { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
            .message { padding: 8px; border-radius: 4px; background: #111827; border: 1px solid #1f2937; word-break: break-word; white-space: pre-wrap; font-size: 12px; }
            .user-message { border-color: #3b82f6; }
            .ai-message { border-color: #1f2937; }
            .controls-container { display: flex; flex-direction: column; gap: 6px; }
            .toggles { display: flex; gap: 12px; font-size: 11px; color: #9ca3af; align-items: center; }
            .toggles label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
            select { background: #1f2937; border: 1px solid #374151; color: #fff; padding: 6px; border-radius: 4px; font-size: 11px; width: 100%; box-sizing: border-box; }
            .input-row { display: flex; gap: 6px; align-items: stretch; }
            .textarea-wrapper { position: relative; flex: 1; display: flex; }
            textarea { width: 100%; height: 55px; resize: none; box-sizing: border-box; background: #1f2937; border: 1px solid #374151; color: #fff; padding: 6px; border-radius: 4px; font-size: 11px; padding-right: 45px; }
            textarea:focus { outline: none; border-color: #06b6d4; }
            #imagePreview {
                display: none;
                max-height: 40px;
                max-width: 40px;
                border: 1px solid #374151;
                border-radius: 4px;
                position: absolute;
                right: 6px;
                top: 6px;
                object-fit: contain;
                cursor: pointer;
                background: #111827;
            }
            #imagePreview:hover { border-color: #ef4444; opacity: 0.8; }
            button { background: #06b6d4; color: #0b0f19; border: none; padding: 0 14px; font-weight: bold; border-radius: 4px; cursor: pointer; font-size: 12px; }
            button:hover { opacity: 0.9; }
        </style>
    </head>
    <body>
        <div id="chatHistory">
            <div class="message ai-message">Moin Peter! Coding Forever (Agentic-Mode) bereit. 🚀</div>
        </div>
        
        <div class="controls-container">
            <div class="toggles">
                <label><input type="checkbox" id="bypassToggle"> Bypass [on]</label>
                <label><input type="checkbox" id="autoAcceptToggle"> Auto Accept</label>
            </div>
            
            <select id="cModel">
                <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                <option value="gemini-3.5-flash-lite" selected>gemini-3.5-flash-lite</option>
            </select>
            
            <div class="input-row">
                <div class="textarea-wrapper">
                    <textarea id="cInput" placeholder="Was soll gebaut werden? (Ctrl+V für Bild)..."></textarea>
                    <img id="imagePreview" alt="Vorschau" title="Klicken zum Entfernen">
                </div>
                <button id="sendBtn">Senden</button>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const sendBtn = document.getElementById('sendBtn');
            const cInput = document.getElementById('cInput');
            const cModel = document.getElementById('cModel');
            const bypassToggle = document.getElementById('bypassToggle');
            const autoAcceptToggle = document.getElementById('autoAcceptToggle');
            const history = document.getElementById('chatHistory');
            const imagePreview = document.getElementById('imagePreview');
            
            let currentImageData = null;

            cInput.addEventListener('paste', (e) => {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (let index in items) {
                    const item = items[index];
                    if (item.kind === 'file') {
                        const blob = item.getAsFile();
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            currentImageData = event.target.result;
                            imagePreview.src = currentImageData;
                            imagePreview.style.display = 'block';
                        };
                        reader.readAsDataURL(blob);
                    }
                }
            });

            imagePreview.addEventListener('click', () => {
                currentImageData = null;
                imagePreview.style.display = 'none';
                imagePreview.src = '';
            });

            function send() {
                const text = cInput.value.trim();
                const model = cModel.value;
                const bypass = bypassToggle.checked;
                const autoAccept = autoAcceptToggle.checked;
                
                if (!text && !currentImageData) return;

                const userDiv = document.createElement('div');
                userDiv.className = 'message user-message';
                let displayText = 'Du: ' + text;
                if (currentImageData) {
                    displayText += '<br><img src="' + currentImageData + '" style="max-width: 100px; margin-top: 5px; border-radius: 4px;">';
                }
                userDiv.innerHTML = displayText;
                history.appendChild(userDiv);
                
                cInput.value = '';
                imagePreview.style.display = 'none';
                imagePreview.src = '';
                history.scrollTop = history.scrollHeight;

                vscode.postMessage({ 
                    type: 'runChat', 
                    prompt: text, 
                    model: model, 
                    bypass: bypass, 
                    autoAccept: autoAccept,
                    imageData: currentImageData 
                });
                
                currentImageData = null;
            }

            sendBtn.addEventListener('click', send);
            cInput.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                }
            });

            window.addEventListener('message', e => {
                const data = e.data;
                if (data && data.type === 'response') {
                    const aiDiv = document.createElement('div');
                    aiDiv.className = 'message ai-message';
                    aiDiv.innerText = 'AI: ' + data.text;
                    history.appendChild(aiDiv);
                    history.scrollTop = history.scrollHeight;
                }
            });
        </script>
    </body>
    </html>`;
}

// Panel-Klasse für den Chat
class CodingForeverPanel {
    public static currentPanel: CodingForeverPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, private readonly context: vscode.ExtensionContext) {
        this._panel = panel;
        this._panel.webview.options = { enableScripts: true };
        this._panel.webview.html = getChatHtml(context);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(context: vscode.ExtensionContext) {
        const panel = vscode.window.createWebviewPanel('codingForeverPanel', 'Coding Forever Chat', vscode.ViewColumn.One, { enableScripts: true });
        CodingForeverPanel.currentPanel = new CodingForeverPanel(panel, context);
    }

    public dispose() {
        CodingForeverPanel.currentPanel = undefined;
        this._panel.dispose();
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