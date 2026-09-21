import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { PromptDatabaseManager } from './lib/database';

// Promisifizierte Version von exec für asynchrone Nutzung
const execAsync = promisify(exec);

export interface SystemSpecs {
    cpuModel: string;
    cpuCores: number;
    cpuSpeed: number; // in GHz
    ramGB: number; // Gesamt-RAM (Rückwärtskompatibilität)
    hasGpu: boolean;
    gpuName: string;
    osInfo: string;
    ramFreeGB: number;
    ramUsedPercent: number;
    cpuTempC: number | null; // null = auf dieser Plattform nicht auslesbar
    cpuLoadPercent: number | null; // null = auf dieser Plattform nicht zuverlässig auslesbar (z.B. Windows)
}

export interface LiveStats {
    ramGB: number;
    ramFreeGB: number;
    ramUsedPercent: number;
    cpuTempC: number | null;
    cpuLoadPercent: number | null;
}

export interface RecommendedModel {
    name: string;
    desc: string;
    tag: string;
}

// ---------------------------------------------------------------------------
// 1. HARDWARE SCANNER & DYNAMISCHE EMPFEHLUNGEN
// ---------------------------------------------------------------------------

function getRamStats(): { ramGB: number; ramFreeGB: number; ramUsedPercent: number } {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const ramGB = Math.round(totalBytes / (1024 ** 3));
    const ramFreeGB = Math.round((freeBytes / (1024 ** 3)) * 10) / 10;
    const ramUsedPercent = Math.round(((totalBytes - freeBytes) / totalBytes) * 100);
    return { ramGB, ramFreeGB, ramUsedPercent };
}

// Best-effort CPU-Temperatur. Nur Linux hat dafür einen simplen, dependency-freien Weg
// (Thermal-Zones im sysfs); Windows/macOS bräuchten Zusatz-Tools, daher dort null.
async function getCpuTempC(): Promise<number | null> {
    if (process.platform !== 'linux') { return null; }
    try {
        const thermalRoot = '/sys/class/thermal';
        if (!fs.existsSync(thermalRoot)) { return null; }

        const zones = fs.readdirSync(thermalRoot).filter(z => z.startsWith('thermal_zone'));
        for (const zone of zones) {
            const typePath = path.join(thermalRoot, zone, 'type');
            const tempPath = path.join(thermalRoot, zone, 'temp');
            if (!fs.existsSync(tempPath)) { continue; }

            const type = fs.existsSync(typePath) ? fs.readFileSync(typePath, 'utf8').trim().toLowerCase() : '';
            // Bevorzugt eine Zone, die erkennbar die CPU/Package ist; sonst erste verfügbare als Fallback.
            const isCpuZone = type.includes('x86_pkg') || type.includes('cpu') || type.includes('core');

            const raw = parseInt(fs.readFileSync(tempPath, 'utf8').trim(), 10);
            if (isNaN(raw)) { continue; }
            const celsius = Math.round(raw / 1000);

            if (isCpuZone) { return celsius; }
        }

        // Kein eindeutig benanntes CPU-Zone gefunden: erste Zone als Näherungswert nehmen.
        if (zones.length > 0) {
            const fallbackPath = path.join(thermalRoot, zones[0], 'temp');
            if (fs.existsSync(fallbackPath)) {
                const raw = parseInt(fs.readFileSync(fallbackPath, 'utf8').trim(), 10);
                if (!isNaN(raw)) { return Math.round(raw / 1000); }
            }
        }
    } catch (error) {
        console.error('Fehler beim Auslesen der CPU-Temperatur:', error);
    }
    return null;
}

// os.loadavg() liefert auf Windows immer [0,0,0] – dort also lieber null statt Falschangabe.
function getCpuLoadPercent(cores: number): number | null {
    if (process.platform === 'win32') { return null; }
    const load1 = os.loadavg()[0];
    if (!cores) { return null; }
    return Math.min(100, Math.round((load1 / cores) * 100));
}

async function getLiveStats(): Promise<LiveStats> {
    const { ramGB, ramFreeGB, ramUsedPercent } = getRamStats();
    const cpuTempC = await getCpuTempC();
    const cpuLoadPercent = getCpuLoadPercent(os.cpus().length);
    return { ramGB, ramFreeGB, ramUsedPercent, cpuTempC, cpuLoadPercent };
}

async function getSystemSpecs(): Promise<SystemSpecs> {
    const cpuCores = os.cpus().length;
    const cpuModel = os.cpus()[0]?.model || 'Es wurde eine unbekannte CPU erkannt';
    const cpuSpeed = os.cpus()[0]?.speed ? os.cpus()[0].speed / 1000 : 0; // in GHz
    const { ramGB, ramFreeGB, ramUsedPercent } = getRamStats();

    let gpuName = 'Integrierte GPU, keine dedizierte GPU erkannt';
    let hasGpu = false;

    // Auf Linux / CachyOS PCI-Geräte abfragen
    if (process.platform === 'linux') {
        try {
            const { stdout } = await execAsync('lspci -nnk | grep -i vga -A3');
            if (stdout.toLowerCase().includes('nvidia') || stdout.toLowerCase().includes('amd') || stdout.toLowerCase().includes('radeon')) {
                hasGpu = true;
                gpuName = stdout.split('\n')[0] || gpuName;
            }
        } catch (error) {
            console.error('Fehler beim Auslesen der GPU-Informationen:', error);
        }
    }

    const [cpuTempC] = await Promise.all([getCpuTempC()]);
    const cpuLoadPercent = getCpuLoadPercent(cpuCores);

    return {
        cpuModel,
        cpuCores,
        cpuSpeed,
        ramGB,
        hasGpu,
        gpuName,
        osInfo: `${os.type()} ${os.release()}${os.arch()}`,
        ramFreeGB,
        ramUsedPercent,
        cpuTempC,
        cpuLoadPercent
    };
}

function getDynamicModelRecommendations(specs: SystemSpecs): RecommendedModel[] {
    const recommendations: RecommendedModel[] = [];

    if (!specs.hasGpu || specs.ramGB <= 16) {
        recommendations.push({
            name: 'qwen2.5-coder:1.5b',
            desc: `⚡ Sehr schnell für deine ${specs.cpuCores}-Kern CPU & ${specs.ramGB} GB RAM.`,
            tag: 'Optimal'
        });
        recommendations.push({
            name: 'deepseek-coder:1.3b',
            desc: '⚡ Leichtgewichtig für flüssige Autovervollständigung.',
            tag: 'Leicht'
        });

        if (specs.ramGB >= 16) {
            recommendations.push({
                name: 'qwen2.5-coder:7b',
                desc: `🧠 Höhere Präzision für deine ${specs.ramGB} GB RAM (auf CPU etwas langsamer).`,
                tag: 'Präzise'
            });
        }
    } else {
        recommendations.push({
            name: 'qwen2.5-coder:7b',
            desc: '🚀 Optimal für VRAM-beschleunigte Systeme.',
            tag: 'Empfohlen'
        });
        recommendations.push({
            name: 'deepseek-coder:6.7b',
            desc: '🧠 Ausgewogenes Modell für komplexe Logik.',
            tag: 'Präzise'
        });
    }

    return recommendations;
}

// ---------------------------------------------------------------------------
// 1b. GROQ MODELL-LISTE (LIVE VON DER GROQ API GEHOLT)
// ---------------------------------------------------------------------------
export interface GroqModelInfo {
    id: string;
    contextWindow?: number;
    ownedBy?: string;
}

// Fallback-Liste, falls der Live-Abruf fehlschlägt (kein Key, Netzwerkfehler, Rate-Limit).
const GROQ_FALLBACK_MODELS: GroqModelInfo[] = [
    { id: 'llama-3.3-70b-versatile' },
    { id: 'llama-3.1-8b-instant' },
    { id: 'openai/gpt-oss-120b' },
    { id: 'openai/gpt-oss-20b' },
    { id: 'moonshotai/kimi-k2-instruct' },
    { id: 'qwen/qwen3-32b' }
];

async function fetchGroqModels(groqApiKey: string): Promise<GroqModelInfo[]> {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${groqApiKey}` }
    });

    if (!res.ok) {
        throw new Error(`Groq Models-Endpoint antwortete mit ${res.status}`);
    }

    const data: any = await res.json();
    const rawModels: any[] = Array.isArray(data.data) ? data.data : [];

    // Nur Chat-taugliche Modelle anzeigen: Whisper (Audio) und Guard/Moderation-Modelle rausfiltern
    const filtered = rawModels.filter(m => {
        const id = String(m.id || '').toLowerCase();
        // Audio/TTS/Voice- und reine Moderations-Modelle raus – das sind keine Chat-/Coding-Modelle
        const nonChatMarkers = ['whisper', 'tts', 'guard', 'orpheus', 'canopylabs', 'playai'];
        return !nonChatMarkers.some(marker => id.includes(marker));
    });

    const models: GroqModelInfo[] = filtered.map(m => ({
        id: m.id,
        contextWindow: m.context_window,
        ownedBy: m.owned_by
    }));

    models.sort((a, b) => a.id.localeCompare(b.id));
    return models.length > 0 ? models : GROQ_FALLBACK_MODELS;
}

// Globaler In-Memory Store für den vorab generierten Code im Diff-Fenster
const diffContentStore = new Map<string, string>();

// Reference auf die aktive Sidebar View
let activeSidebarView: vscode.WebviewView | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Extension "coding-forever" ist aktiv mit Agentic-Power, React-Frontend, Groq-Support & SQLite.');

    // --- 0. DIFF CONTENT PROVIDER REGISTRIEREN ---
    registerDiffProvider(context);

    // --- 1. DATEN-ÜBERNAHME & MIGRATION BEI INSTALLATION/UPDATE ---
    await handleDataMigration(context);

    // --- 2. AUTOMATISCHER GITHUB UPDATE-CHECK ---
    checkForGitHubUpdates(context);

    // --- 3. SQLITE DATENBANK MANAGER INITIALISIEREN ---
    const dbManager = await PromptDatabaseManager.getInstance(context);

    // Commands registrieren
    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.openChatTab', async () => {
            await CodingForeverPanel.createOrShow(context, 'chat');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.openDashboard', async () => {
            await CodingForeverPanel.createOrShow(context, 'dashboard');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.openSettings', async () => {
            await CodingForeverPanel.createOrShow(context, 'settings');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.createProject', async () => {
            await createProject();
        })
    );

    // Header-Action: Chat History umschalten
    context.subscriptions.push(
        vscode.commands.registerCommand('codingForever.openHistory', async () => {
            if (activeSidebarView) {
                activeSidebarView.show?.(true);
                activeSidebarView.webview.postMessage({ type: 'toggleHistory' });
            } else {
                await vscode.commands.executeCommand('codingForeverView.focus');
            }

            CodingForeverPanel.currentPanels.forEach(panel => {
                panel.postMessage({ type: 'toggleHistory' });
            });
        })
    );

    // Webview View Provider (Sidebar)
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('codingForeverView', {
            async resolveWebviewView(view) {
                activeSidebarView = view;

                view.webview.options = {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'dist'))]
                };

                view.webview.html = getReactWebviewContent(view.webview, context, 'chat');

                view.webview.onDidReceiveMessage(async msg => {
                    await handleWebviewMessage(view, context, dbManager, msg);
                });

                view.onDidDispose(() => {
                    activeSidebarView = undefined;
                });
            }
        })
    );

    // Command Quick Fix
    const fixErrorCommand = vscode.commands.registerCommand(
        'coding-forever.fixError',
        async (document: vscode.TextDocument, range: vscode.Range, diagnostic: vscode.Diagnostic) => {
            await vscode.commands.executeCommand('codingForeverView.focus');

            const codeSnippet = document.getText(range);
            const prompt = `Behebe folgenden Fehler in der Datei ${path.basename(document.fileName)}:\n\n` +
                `Fehler: ${diagnostic.message}\n` +
                `Zeile: ${range.start.line + 1}\n\n` +
                `Betroffener Code:\n\`\`\`${document.languageId}\n${codeSnippet}\n\`\`\``;

            if (activeSidebarView) {
                activeSidebarView.webview.postMessage({
                    type: 'setPrompt',
                    value: prompt
                });
            }
        }
    );

    // Quick Fix Provider
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
        { scheme: 'file' },
        {
            provideCodeActions(document, range, context) {
                if (context.diagnostics.length === 0) {
                    return [];
                }

                const actions: vscode.CodeAction[] = [];

                for (const diagnostic of context.diagnostics) {
                    const action = new vscode.CodeAction(
                        `✨ Mit Coding Forever beheben: ${diagnostic.message.substring(0, 40)}...`,
                        vscode.CodeActionKind.QuickFix
                    );

                    action.command = {
                        command: 'coding-forever.fixError',
                        title: 'Mit Coding Forever beheben',
                        arguments: [document, diagnostic.range, diagnostic]
                    };

                    action.isPreferred = true;
                    actions.push(action);
                }

                return actions;
            }
        },
        {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        }
    );

    context.subscriptions.push(fixErrorCommand, codeActionProvider);
}

// --- VISUELLE DIFF-STEUERUNG (VIRTUAL DOCUMENT PROVIDER) ---

function registerDiffProvider(context: vscode.ExtensionContext) {
    const provider = new class implements vscode.TextDocumentContentProvider {
        onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
        onDidChange = this.onDidChangeEmitter.event;

        provideTextDocumentContent(uri: vscode.Uri): string {
            return diffContentStore.get(uri.toString()) || '';
        }
    };

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('gemini-diff', provider)
    );
}

async function showCodeDiff(originalUri: vscode.Uri, modifiedContent: string) {
    const fileName = originalUri.fsPath.split('/').pop() || 'file';
    const virtualUri = vscode.Uri.parse(`gemini-diff://proposed/${fileName}`);
    diffContentStore.set(virtualUri.toString(), modifiedContent);

    const title = `${fileName} (Original ↔ Gemini Vorschlag)`;
    await vscode.commands.executeCommand('vscode.diff', originalUri, virtualUri, title);
}

function getCurrentWorkspaceName(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.name;
}

// Globale Session-ID Store
let currentSessionId: string | null = null;

async function handleWebviewMessage(
    target: { webview: vscode.Webview },
    context: vscode.ExtensionContext,
    dbManager: PromptDatabaseManager,
    msg: any
) {
    try {
        // Session Management
        if (msg.type === 'initializeSession') {
            const workspaceName = getCurrentWorkspaceName() || 'global';
            const session = await dbManager.getOrCreateCurrentSession(workspaceName, 'New Chat');
            currentSessionId = session.id;
            target.webview.postMessage({ type: 'sessionInitialized', sessionId: session.id });
        } else if (msg.type === 'saveMessage') {
            if (msg.sessionId) {
                await dbManager.addMessage(msg.sessionId, msg.sender, msg.text);
            }
        } else if (msg.type === 'loadHistory') {
            const workspaceName = getCurrentWorkspaceName() || 'global';
            const sessions = await dbManager.getRecentSessions(workspaceName, 50);
            target.webview.postMessage({ type: 'historyLoaded', sessions });
        } else if (msg.type === 'loadSession') {
            const { session, messages } = await dbManager.getSessionWithMessages(msg.sessionId);
            currentSessionId = msg.sessionId;
            target.webview.postMessage({ 
                type: 'sessionLoaded', 
                messages: messages.map(m => ({ 
                    sender: m.sender, 
                    text: m.text 
                })) 
            });
        } else if (msg.type === 'deleteSession') {
            await dbManager.deleteSession(msg.sessionId);
            const workspaceName = getCurrentWorkspaceName() || 'global';
            const sessions = await dbManager.getRecentSessions(workspaceName, 50);
            target.webview.postMessage({ type: 'historyLoaded', sessions });
        } else if (msg.type === 'newChat') {
            const workspaceName = getCurrentWorkspaceName() || 'global';
            const session = await dbManager.getOrCreateCurrentSession(workspaceName, 'New Chat');
            currentSessionId = session.id;
            target.webview.postMessage({ type: 'sessionInitialized', sessionId: session.id });
        }
        // End Session Management
        else if (msg.type === 'runChat') {
            // Automatischer Fallback auf Groq, falls Modell nicht gesetzt aber Key vorhanden
            let selectedModel = msg.model;
            const groqApiKey = context.globalState.get<string>('groqApiKey');
            if ((!selectedModel || selectedModel.includes('gemini')) && groqApiKey) {
                selectedModel = 'groq:llama-3.3-70b-versatile';
            }
            await handleAgent(target, context, msg.prompt, selectedModel || 'gemini-3.6-flash', msg.bypass, msg.autoAccept, msg.agentMode !== false);
        } else if (msg.type === 'suggestNext') {
            await handleSuggestNext(target, context);
        } else if (msg.type === 'applyCodeToEditor') {
            await applyCodeToActiveEditor(msg.code);
        } else if (msg.type === 'showDiff') {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await showCodeDiff(editor.document.uri, msg.code);
            } else {
                vscode.window.showErrorMessage('Kein aktiver Editor geöffnet, um ein Diff anzuzeigen.');
            }
        } else if (msg.type === 'executeCommand') {
            await runTerminalCommand(msg.command);
        } else if (msg.type === 'openChat') {
            await CodingForeverPanel.createOrShow(context, 'chat');
        } else if (msg.type === 'openDashboard') {
            await CodingForeverPanel.createOrShow(context, 'dashboard');
        } else if (msg.type === 'openSettings') {
            await CodingForeverPanel.createOrShow(context, 'settings');
        } else if (msg.type === 'createProject') {
            await createProject();
        } else if (msg.type === 'SAVE_AI_SETTINGS') {
            const config = msg.payload || {};
            await context.globalState.update('geminiApiKey', config.geminiApiKey || '');
            await context.globalState.update('groqApiKey', config.groqApiKey || '');
            await context.globalState.update('claudeApiKey', config.claudeApiKey || '');
            await context.globalState.update('openaiApiKey', config.openaiApiKey || '');
            await context.globalState.update('localEnabled', config.localEnabled ?? false);
            await context.globalState.update('baseUrl', config.baseUrl || 'http://localhost:11434');
            await context.globalState.update('modelName', config.modelName || 'llama3.2');
            await context.globalState.update('mcpConfig', config.mcpConfig || '');
            await context.globalState.update('userName', config.userName || '');

            vscode.window.showInformationMessage('AI-Einstellungen erfolgreich gespeichert!');

            // Benachrichtige alle aktiven Webviews über die neuen AI Settings für dynamisches Dropdown
            const updatedAiSettings = getAiSettings(context);
            if (activeSidebarView) {
                activeSidebarView.webview.postMessage({ type: 'aiSettingsUpdated', settings: updatedAiSettings });
            }
            CodingForeverPanel.currentPanels.forEach(panel => {
                panel.postMessage({ type: 'aiSettingsUpdated', settings: updatedAiSettings });
            });

            // Nach dem Speichern eines (neuen) Groq-Keys direkt die Modell-Liste neu laden
            if (config.groqApiKey) {
                await sendGroqModels(target, config.groqApiKey);
            }
        } else if (msg.type === 'getGroqModels') {
            const groqApiKey = context.globalState.get<string>('groqApiKey');
            await sendGroqModels(target, groqApiKey);
        } else if (msg.type === 'SCAN_SYSTEM') {
            const specs = await getSystemSpecs();
            const recommended = getDynamicModelRecommendations(specs);
            
            target.webview.postMessage({
                type: 'SYSTEM_SPECS_SCANNED',
                specs,
                recommended
            });
        } else if (msg.type === 'SCAN_LIVE_STATS') {
            // Schlanker als SCAN_SYSTEM: kein lspci-Aufruf, nur RAM/Temperatur/Load – geeignet fürs Polling.
            const liveStats = await getLiveStats();
            target.webview.postMessage({
                type: 'LIVE_STATS_SCANNED',
                stats: liveStats
            });
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
        } else if (msg.type === 'getPrompts' || msg.command === 'getPrompts') {
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

/**
 * Holt die verfügbaren Groq-Modelle (live von der API, mit Fallback-Liste)
 * und schickt sie ans Webview.
 */
async function sendGroqModels(target: { webview: vscode.Webview }, groqApiKey: string | undefined) {
    if (!groqApiKey) {
        target.webview.postMessage({ type: 'groqModelsLoaded', models: [], error: 'no-key' });
        return;
    }

    try {
        const models = await fetchGroqModels(groqApiKey);
        target.webview.postMessage({ type: 'groqModelsLoaded', models });
    } catch (e: any) {
        console.error('Groq Modelle konnten nicht geladen werden, nutze Fallback-Liste:', e.message);
        target.webview.postMessage({ type: 'groqModelsLoaded', models: GROQ_FALLBACK_MODELS, error: 'fetch-failed' });
    }
}

function getAiSettings(context: vscode.ExtensionContext) {
    return {
        geminiApiKey: context.globalState.get<string>('geminiApiKey') || '',
        groqApiKey: context.globalState.get<string>('groqApiKey') || '',
        claudeApiKey: context.globalState.get<string>('claudeApiKey') || '',
        openaiApiKey: context.globalState.get<string>('openaiApiKey') || '',
        localEnabled: context.globalState.get<boolean>('localEnabled') || false,
        baseUrl: context.globalState.get<string>('baseUrl') || 'http://localhost:11434',
        modelName: context.globalState.get<string>('modelName') || 'llama3.2',
        mcpConfig: context.globalState.get<string>('mcpConfig') || '',
        userName: context.globalState.get<string>('userName') || ''
    };
}

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
    const aiSettings = getAiSettings(context);

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
            window.INITIAL_AI_SETTINGS = ${JSON.stringify(aiSettings)};
        </script>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0b0f19;">
        <div id="root"></div>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
}

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

    const groqApiKey = context.globalState.get<string>('groqApiKey');
    const defaultModel = groqApiKey ? 'groq:llama-3.3-70b-versatile' : 'gemini-3.6-flash';
    await handleAgent(target, context, processedPrompt, defaultModel, false, false);
}

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

    // Build-Artefakte, Abhängigkeiten und Binär-/Release-Müll rausfiltern – die blähen
    // list_files sonst unnötig auf und sprengen bei kleinen Modellen die Token-Limits.
    const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/coverage/**,**/.vscode-test/**,**/media/**,**/releases/**,**/*.vsix,**/*.vsix.map,**/package-lock.json}';
    const files = await vscode.workspace.findFiles('**/*', excludePattern);
    const relativePaths = files.map(f => vscode.workspace.asRelativePath(f));

    // Auch bei gefilterten Projekten hart deckeln, damit ein einzelner list_files-Call
    // nicht allein schon ein kleines Modell-Kontingent sprengt.
    const MAX_FILES = 300;
    if (relativePaths.length > MAX_FILES) {
        const shown = relativePaths.slice(0, MAX_FILES);
        return `${shown.join('\n')}\n\n... und ${relativePaths.length - MAX_FILES} weitere Dateien (gekürzt). Nutze read_file gezielt auf Unterordner/Dateien statt alles auf einmal zu scannen.`;
    }

    return relativePaths.join('\n');
}

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

// Gleiche vier Tools, aber im OpenAI-kompatiblen Schema (tools/tool_calls) für Groq.
const OPENAI_AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'list_files',
            description: 'Listet alle Dateien im aktuellen Workspace auf (ohne node_modules).',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Liest den Inhalt einer Datei relativ zum Workspace-Root.',
            parameters: {
                type: 'object',
                properties: { path: { type: 'string', description: 'Relativer Pfad zur Datei' } },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Erstellt oder überschreibt eine Datei relativ zum Workspace-Root.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relativer Pfad zur Datei' },
                    content: { type: 'string', description: 'Kompletter neuer Dateiinhalt' }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_command',
            description: 'Führt einen Terminal-Befehl im Workspace-Root aus (z.B. npm install). Nur nutzen wenn wirklich nötig.',
            parameters: {
                type: 'object',
                properties: { command: { type: 'string' } },
                required: ['command']
            }
        }
    }
];

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
            const filePath = path.join(rootPath, args.path);
            const fileUri = vscode.Uri.file(filePath);

            if (fs.existsSync(filePath)) {
                await showCodeDiff(fileUri, args.content);
            }

            if (!autoAccept && !(await confirmAction(`Soll die Datei "${args.path}" nach deiner visuellen Prüfung geschrieben werden?`))) {
                return { error: 'Vom Nutzer im Diff-Schritt abgelehnt.' };
            }

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
    autoAccept: boolean,
    agentMode: boolean = true
) {
    const groqApiKey = context.globalState.get<string>('groqApiKey');
    const geminiApiKey = context.globalState.get<string>('geminiApiKey');

    const editor = vscode.window.activeTextEditor;
    const activeFileName = editor ? vscode.workspace.asRelativePath(editor.document.uri) : 'keine';

    // Ohne Agent-Modus hat das Modell keine Tools, um selbst nachzufragen/nachzusehen —
    // ohne diesen Kontext fängt es an, nach Pfaden zu fragen oder Dinge zu erfinden.
    // Deshalb den Inhalt der aktuell offenen Datei direkt mitgeben (gekürzt, spart Tokens).
    const MAX_ACTIVE_FILE_CHARS = 4000;
    let activeFileContent = '';
    if (editor) {
        const rawContent = editor.document.getText();
        activeFileContent = rawContent.length > MAX_ACTIVE_FILE_CHARS
            ? `${rawContent.slice(0, MAX_ACTIVE_FILE_CHARS)}\n... (gekürzt, Datei ist länger)`
            : rawContent;
    }

    // Bei ausgeschaltetem Agent-Modus: knapper Prompt, keine Tools, kein Datei-/Terminal-Zugriff.
    // Spart massiv Tokens (wichtig bei knappen TPM-Limits wie z.B. bei gpt-oss-20b auf Groq Free-Tier).
    const systemInstruction = agentMode
        ? `Du bist "Coding Forever", ein autonomer Fullstack-Entwickler-Agent direkt in VS Code.
Arbeite iterativ und diszipliniert:
1. Verschaff dir zuerst Überblick (list_files, ggf. read_file für relevante Dateien) bevor du etwas änderst.
2. Ändere NUR was für die Aufgabe nötig ist. Erfinde keine Dateien/APIs, die du nicht gesehen hast.
3. Nutze ausschließlich die bereitgestellten Tools für Datei-/Terminal-Aktionen, keine Code-Blöcke im Fließtext.
4. Fasse am Ende kurz zusammen, was du getan hast.

Aktive Datei im Editor: ${activeFileName}
Modus: Bypass=${bypass}, AutoAccept=${autoAccept}`
        : `Du bist "Coding Forever", ein hilfreicher Coding-Assistent direkt in VS Code. Du hast in diesem Modus KEINEN Datei- oder Terminal-Zugriff und kannst nicht selbst nachsehen oder nachfragen — antworte direkt mit dem, was du unten siehst.
Frag NIEMALS nach einem Dateipfad oder Projektverzeichnis. Wenn eine Anfrage mehr braucht als die untenstehende Datei (z.B. "scanne das ganze Projekt"), sag kurz und direkt, dass dafür der Agent-Modus eingeschaltet werden muss, statt Rückfragen zu stellen.

Aktive Datei im Editor: ${activeFileName}
${activeFileContent ? `Inhalt:\n\`\`\`\n${activeFileContent}\n\`\`\`` : '(keine Datei geöffnet)'}`;

    // ---------------------------------------------------------------------------
    // PFAD A: GROQ CLOUD ENGINE
    // ---------------------------------------------------------------------------
    if (model.startsWith('groq:')) {
        if (!groqApiKey) {
            target.webview.postMessage({ type: 'response', text: 'Fehler: Kein Groq API-Key hinterlegt! Bitte unter AI Engine eintragen.' });
            return;
        }

        const selectedGroqModel = model.replace('groq:', '') || 'llama-3.3-70b-versatile';
        target.webview.postMessage({ type: 'status', text: `⚡ Sende Anfrage an Groq LPU Cloud (${selectedGroqModel})...` });

        // groq/compound & groq/compound-mini akzeptieren nur ihre eigenen server-seitigen
        // Built-in-Tools (Websuche etc.), kein extern definiertes tools/tool_calls-Array.
        let useLocalTools = agentMode && !selectedGroqModel.startsWith('groq/compound');
        if (agentMode && !useLocalTools) {
            target.webview.postMessage({ type: 'status', text: `ℹ️ ${selectedGroqModel} unterstützt nur eingebaute Groq-Tools, kein eigenes Function-Calling – läuft ohne Datei-/Terminal-Tools.` });
        }

        // Agentic Loop, analog zu Pfad C (Gemini), aber im OpenAI-kompatiblen tools/tool_calls-Schema.
        const groqMessages: any[] = [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
        ];
        const maxGroqTurns = 10;

        try {
            for (let turn = 0; turn < maxGroqTurns; turn++) {
                const requestBody: any = {
                    model: selectedGroqModel,
                    messages: groqMessages,
                    temperature: 0.2
                };
                if (useLocalTools) {
                    requestBody.tools = OPENAI_AGENT_TOOLS;
                    requestBody.tool_choice = 'auto';
                }

                let res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${groqApiKey}`
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!res.ok) {
                    const errData: any = await res.json().catch(() => ({}));
                    const errMsg: string = errData.error?.message || res.statusText;

                    // Generischer Fallback: falls Groq für DIESES Modell (jetzt oder in Zukunft)
                    // Tool-Calling ablehnt, einmalig ohne Tools erneut versuchen statt hart abzubrechen.
                    if (useLocalTools && /tool/i.test(errMsg) && /(not support|not enabled|unsupported)/i.test(errMsg)) {
                        target.webview.postMessage({ type: 'status', text: `ℹ️ ${selectedGroqModel} lehnt Tool-Calling ab – wiederhole ohne Tools...` });
                        useLocalTools = false;
                        delete requestBody.tools;
                        delete requestBody.tool_choice;
                        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${groqApiKey}`
                            },
                            body: JSON.stringify(requestBody)
                        });
                    }

                    if (!res.ok) {
                        const retryErrData: any = await res.json().catch(() => ({}));
                        target.webview.postMessage({ type: 'response', text: `Groq Fehler: ${retryErrData.error?.message || errMsg}` });
                        return;
                    }
                }

                const data: any = await res.json();
                const message = data.choices?.[0]?.message;

                if (!message) {
                    target.webview.postMessage({ type: 'response', text: 'Keine Antwort von Groq erhalten.' });
                    return;
                }

                const toolCalls: any[] = message.tool_calls || [];

                if (toolCalls.length === 0) {
                    target.webview.postMessage({ type: 'response', text: message.content || 'Keine Antwort von Groq erhalten.' });
                    return;
                }

                // Assistant-Nachricht mit den angeforderten Tool-Calls in den Verlauf übernehmen
                groqMessages.push(message);

                for (const call of toolCalls) {
                    const toolName = call.function?.name;
                    let toolArgs: any = {};
                    try {
                        toolArgs = JSON.parse(call.function?.arguments || '{}');
                    } catch {
                        toolArgs = {};
                    }

                    target.webview.postMessage({ type: 'status', text: toolStatusLabel(toolName, toolArgs) });
                    const result = await executeTool(toolName, toolArgs, autoAccept);

                    groqMessages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: JSON.stringify(result)
                    });
                }
            }

            target.webview.postMessage({ type: 'response', text: '⚠️ Maximale Anzahl an Schritten (10) erreicht, ohne abzuschließen.' });
            return;

        } catch (e: any) {
            target.webview.postMessage({ type: 'response', text: `Verbindungsfehler zu Groq: ${e.message}` });
            return;
        }
    }

    // ---------------------------------------------------------------------------
    // PFAD B: LOKALE OLLAMA ENGINE
    // ---------------------------------------------------------------------------
    // Vorher: fixiert auf den globalen "Lokale Modelle"-Schalter, ignorierte die
    // tatsächliche Dropdown-Auswahl komplett (jede Nicht-Groq-Anfrage landete bei
    // Ollama, sobald der Schalter an war). Jetzt wie bei Groq: explizit über das
    // model-Präfix ausgewählt, plus echtes Tool-Calling über Ollamas /api/chat.
    if (model.startsWith('local:')) {
        const baseUrl = context.globalState.get<string>('baseUrl') || 'http://localhost:11434';
        const localModel = model.replace('local:', '') || context.globalState.get<string>('modelName') || 'llama3.2';
        const cleanUrl = baseUrl.replace(/\/v1\/?$/, '');
        target.webview.postMessage({ type: 'status', text: `🖥️ Sende Anfrage an Ollama (${localModel})...` });

        const localMessages: any[] = [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
        ];
        const maxLocalTurns = 10;

        try {
            for (let turn = 0; turn < maxLocalTurns; turn++) {
                const requestBody: any = {
                    model: localModel,
                    messages: localMessages,
                    stream: false
                };
                // Nicht jedes lokale Modell unterstützt Tool-Calling; nicht-unterstützende
                // Modelle ignorieren "tools" bei Ollama einfach und antworten normal in Text.
                if (agentMode) {
                    requestBody.tools = OPENAI_AGENT_TOOLS;
                }

                const res = await fetch(`${cleanUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!res.ok) {
                    target.webview.postMessage({ type: 'response', text: `Ollama Fehler: ${res.statusText}` });
                    return;
                }

                const data: any = await res.json();
                const message = data.message;

                if (!message) {
                    target.webview.postMessage({ type: 'response', text: 'Keine Antwort von Ollama erhalten.' });
                    return;
                }

                const toolCalls: any[] = message.tool_calls || [];

                if (toolCalls.length === 0) {
                    target.webview.postMessage({ type: 'response', text: message.content || 'Keine Antwort von Ollama erhalten.' });
                    return;
                }

                localMessages.push(message);

                for (const call of toolCalls) {
                    const toolName = call.function?.name;
                    // Ollama liefert Function-Argumente meist schon als Objekt, Groq/OpenAI als JSON-String – beides abfangen.
                    let toolArgs: any = {};
                    try {
                        toolArgs = typeof call.function?.arguments === 'string'
                            ? JSON.parse(call.function.arguments || '{}')
                            : (call.function?.arguments || {});
                    } catch {
                        toolArgs = {};
                    }

                    target.webview.postMessage({ type: 'status', text: toolStatusLabel(toolName, toolArgs) });
                    const result = await executeTool(toolName, toolArgs, autoAccept);

                    localMessages.push({
                        role: 'tool',
                        content: JSON.stringify(result)
                    });
                }
            }

            target.webview.postMessage({ type: 'response', text: '⚠️ Maximale Anzahl an Schritten (10) erreicht, ohne abzuschließen.' });
            return;

        } catch (e: any) {
            target.webview.postMessage({ type: 'response', text: `Verbindungsfehler zu Ollama (${baseUrl}): ${e.message}` });
            return;
        }
    }

    // ---------------------------------------------------------------------------
    // PFAD C: GEMINI CLOUD ENGINE (Mit Tool-Support)
    // ---------------------------------------------------------------------------
    if (!geminiApiKey) {
        target.webview.postMessage({ type: 'response', text: 'Fehler: Kein Gemini API-Key hinterlegt!' });
        return;
    }

    let contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];
    target.webview.postMessage({ type: 'status', text: '🤖 Plane Vorgehen...' });

    const selectedModel = model || 'gemini-3.6-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${geminiApiKey}`;
    const maxTurns = 10;

    try {
        for (let turn = 0; turn < maxTurns; turn++) {
            const geminiBody: any = {
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents
            };
            if (agentMode) {
                geminiBody.tools = AGENT_TOOLS;
            }

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiBody)
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
    const code = editor.document.getText().slice(0, 4000);

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

type ProjectTemplate = {
    label: string;
    description: string;
    command: string;
    args: string[];
};

const projectTemplates: ProjectTemplate[] = [
    {
        label: 'Node.js',
        description: 'Leeres npm-Projekt mit package.json',
        command: 'npm',
        args: ['init', '-y']
    },
    {
        label: 'Node.js + TypeScript',
        description: 'npm-Projekt mit TypeScript und tsconfig.json',
        command: 'npm',
        args: ['init', '-y']
    },
    {
        label: 'React + Vite',
        description: 'Modernes React-Projekt mit TypeScript',
        command: 'npx',
        args: ['--yes', 'create-vite@latest', '.', '--template', 'react-ts']
    },
    {
        label: 'Next.js',
        description: 'Next.js-Projekt mit TypeScript und App Router',
        command: 'npx',
        args: ['--yes', 'create-next-app@latest', '.', '--ts', '--eslint', '--app', '--use-npm', '--no-tailwind']
    }
];

async function createProject(): Promise<void> {
    if (!(await isCommandAvailable('npm'))) {
        vscode.window.showErrorMessage(
            `Node.js mit npm wurde auf ${getPlatformName()} nicht gefunden. Bitte Node.js installieren und VS Code neu starten.`
        );
        return;
    }

    const template = await vscode.window.showQuickPick(
        projectTemplates.map(item => ({ label: item.label, description: item.description, item })),
        { placeHolder: 'Welche Projektform soll erstellt werden?' }
    );
    if (!template) { return; }

    if (template.item.command === 'npx' && !(await isCommandAvailable('npx'))) {
        vscode.window.showErrorMessage(
            `npx wurde auf ${getPlatformName()} nicht gefunden. Bitte Node.js aktualisieren und VS Code neu starten.`
        );
        return;
    }

    const configuredRoot = vscode.workspace.getConfiguration('codingForever').get<string>('projectsDirectory');
    const defaultRoot = detectProjectsDirectory(configuredRoot);
    const rootUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(defaultRoot),
        openLabel: 'Projektbasis verwenden'
    });
    if (!rootUri?.[0]) { return; }

    const projectName = await vscode.window.showInputBox({
        prompt: 'Name des neuen Projektordners',
        placeHolder: 'mein-node-projekt',
        validateInput: value => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
            ? undefined
            : 'Nur Buchstaben, Zahlen, Punkt, Bindestrich und Unterstrich verwenden.'
    });
    if (!projectName) { return; }

    const projectPath = path.join(rootUri[0].fsPath, projectName);
    if (fs.existsSync(projectPath)) {
        vscode.window.showErrorMessage(`Der Projektordner existiert bereits: ${projectPath}`);
        return;
    }

    fs.mkdirSync(projectPath, { recursive: true });
    const executable = getNodePackageExecutable(template.item.command);

    try {
        await runProjectProcess(executable, template.item.args, projectPath);

        if (template.item.label === 'Node.js + TypeScript') {
            await runProjectProcess(
                getNodePackageExecutable('npm'),
                ['install', '--save-dev', 'typescript', 'tsx', '@types/node'],
                projectPath
            );
            await runProjectProcess(
                getNodePackageExecutable('npx'),
                ['tsc', '--init'],
                projectPath
            );
        }

        const opened = await vscode.commands.executeCommand<boolean>(
            'vscode.openFolder',
            vscode.Uri.file(projectPath),
            false
        );
        if (opened !== false) {
            vscode.window.showInformationMessage(`Projekt erstellt: ${projectName}`);
        }
    } catch (error: any) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        vscode.window.showErrorMessage(`Projekt konnte nicht erstellt werden: ${error.message}`);
    }
}

function getNodePackageExecutable(command: string): string {
    if (process.platform !== 'win32') {
        return command;
    }
    return command === 'npm' ? 'npm.cmd' : command === 'npx' ? 'npx.cmd' : command;
}

function getPlatformName(): string {
    switch (process.platform) {
        case 'win32': return 'Windows';
        case 'darwin': return 'macOS';
        case 'linux': return 'Linux';
        default: return process.platform;
    }
}

function detectProjectsDirectory(configuredRoot: string | undefined): string {
    if (configuredRoot?.trim()) {
        return configuredRoot.trim();
    }

    const candidates = [
        path.join(os.homedir(), 'Dev'),
        path.join(os.homedir(), 'Documents', 'Dev'),
        vscode.workspace.workspaceFolders?.[0]
            ? path.dirname(vscode.workspace.workspaceFolders[0].uri.fsPath)
            : undefined,
        os.homedir()
    ].filter((candidate): candidate is string => Boolean(candidate));

    return candidates.find(candidate => fs.existsSync(candidate)) || os.homedir();
}

function isCommandAvailable(command: string): Promise<boolean> {
    return new Promise(resolve => {
        const child = spawn(getNodePackageExecutable(command), ['--version'], {
            stdio: 'ignore',
            shell: false
        });
        child.on('error', () => resolve(false));
        child.on('close', code => resolve(code === 0));
    });
}

function runProjectProcess(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
        let errorOutput = '';
        child.stderr?.on('data', chunk => { errorOutput += chunk.toString(); });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(errorOutput.trim() || `${command} wurde mit Code ${code} beendet.`));
            }
        });
    });
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

    public postMessage(message: any) {
        this._panel.webview.postMessage(message);
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