import * as path from 'path';
import * as vscode from 'vscode';

import { generateChatTitle, isAbortError, runAgentLoop } from './agent/loop';
import {
    applyTemplatePlaceholders, buildSystemPrompt, expandFileMentions, readEditorContext
} from './agent/prompt';
import { AGENT_TOOLS, ToolContext } from './agent/tools';
import { ChatMessage, PromptDatabaseManager } from './lib/database';
import { getAgentLimits, SettingsStore } from './lib/settings';
import { getWebviewHtml } from './lib/webview';
import { listAllModels, pickCheapModel, resolveModel } from './providers';
import { AgentMessage, ProviderError } from './providers/types';
import { getDynamicModelRecommendations, getLiveStats, getSystemSpecs } from './system/specs';
import { createProject } from './system/projects';
import { checkForGitHubUpdates } from './system/updates';

interface Deps {
    settings: SettingsStore;
    dbManager: PromptDatabaseManager;
}

type MessageTarget = { webview: vscode.Webview };

/** Inhalte der virtuellen Diff-Dokumente. Begrenzt, damit sie nicht ewig wachsen. */
const MAX_DIFF_ENTRIES = 30;
const diffContentStore = new Map<string, string>();

/** Laufende Agent-Durchläufe pro Webview, damit "Stop" gezielt abbrechen kann. */
const activeRuns = new Map<vscode.Webview, AbortController>();

let activeSidebarView: vscode.WebviewView | undefined;

/* ==========================================================
 * AKTIVIERUNG
 * ========================================================== */

export async function activate(context: vscode.ExtensionContext) {
    const settings = new SettingsStore(context);
    await settings.migrateSecrets();

    const dbManager = await PromptDatabaseManager.getInstance(context);
    context.subscriptions.push({ dispose: () => dbManager.dispose() });

    const deps: Deps = { settings, dbManager };

    registerDiffProvider(context);
    await handleDataMigration(context);
    void checkForGitHubUpdates(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('coding-forever.openChatTab', () =>
            CodingForeverPanel.createOrShow(context, deps, 'chat')),

        vscode.commands.registerCommand('coding-forever.openDashboard', () =>
            CodingForeverPanel.createOrShow(context, deps, 'dashboard')),

        vscode.commands.registerCommand('coding-forever.openSettings', () =>
            CodingForeverPanel.createOrShow(context, deps, 'settings')),

        vscode.commands.registerCommand('coding-forever.createProject', () => createProject()),

        vscode.commands.registerCommand('coding-forever.checkUpdates', () =>
            checkForGitHubUpdates(context, true)),

        vscode.commands.registerCommand('codingForever.openHistory', async () => {
            if (activeSidebarView) {
                activeSidebarView.show?.(true);
                activeSidebarView.webview.postMessage({ type: 'toggleHistory' });
            } else {
                await vscode.commands.executeCommand('codingForeverView.focus');
            }
            CodingForeverPanel.currentPanels.forEach(panel =>
                panel.postMessage({ type: 'toggleHistory' }));
        }),

        vscode.commands.registerCommand('coding-forever.stopAgent', () => {
            let stopped = 0;
            for (const controller of activeRuns.values()) {
                controller.abort();
                stopped++;
            }
            vscode.window.showInformationMessage(
                stopped > 0 ? 'Agent abgebrochen.' : 'Es läuft gerade kein Agent.'
            );
        }),

        vscode.commands.registerCommand('coding-forever.sendSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('Kein aktiver Editor geöffnet.');
                return;
            }

            const selected = editor.document.getText(editor.selection);
            const relPath = vscode.workspace.asRelativePath(editor.document.uri);
            const snippet = selected.trim()
                ? `\`\`\`${editor.document.languageId}\n${selected}\n\`\`\``
                : '';
            const value = selected.trim()
                ? `Zu dieser Stelle in ${relPath}:\n\n${snippet}\n\n`
                : `Zu @${relPath}: `;

            await focusChat(value);
        }),

        vscode.commands.registerCommand(
            'coding-forever.fixError',
            async (document: vscode.TextDocument, range: vscode.Range, diagnostic: vscode.Diagnostic) => {
                const snippet = document.getText(range);
                const value = [
                    `Behebe folgenden Fehler in ${vscode.workspace.asRelativePath(document.uri)}:`,
                    '',
                    `Fehler: ${diagnostic.message}`,
                    `Zeile: ${range.start.line + 1}`,
                    '',
                    'Betroffener Code:',
                    `\`\`\`${document.languageId}`,
                    snippet,
                    '```'
                ].join('\n');

                await focusChat(value);
            }
        ),

        vscode.window.registerWebviewViewProvider('codingForeverView', {
            resolveWebviewView: async view => {
                activeSidebarView = view;
                view.webview.options = {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'dist'))]
                };
                view.webview.html = getWebviewHtml(
                    view.webview, context, 'chat', await settings.getPublicSettings()
                );
                view.webview.onDidReceiveMessage(msg => handleWebviewMessage(view, context, deps, msg));
                view.onDidDispose(() => {
                    activeRuns.get(view.webview)?.abort();
                    activeRuns.delete(view.webview);
                    activeSidebarView = undefined;
                });
            }
        }),

        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file' },
            {
                provideCodeActions(document, range, actionContext) {
                    return actionContext.diagnostics.map(diagnostic => {
                        const action = new vscode.CodeAction(
                            `✨ Mit Coding Forever beheben: ${diagnostic.message.slice(0, 40)}...`,
                            vscode.CodeActionKind.QuickFix
                        );
                        action.command = {
                            command: 'coding-forever.fixError',
                            title: 'Mit Coding Forever beheben',
                            arguments: [document, diagnostic.range, diagnostic]
                        };
                        action.isPreferred = true;
                        return action;
                    });
                }
            },
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
        )
    );
}

export function deactivate() {
    for (const controller of activeRuns.values()) { controller.abort(); }
    activeRuns.clear();
    diffContentStore.clear();
}

/**
 * Sidebar öffnen und den Prompt dort vorbelegen.
 * Nach dem focus-Command dauert es einen Moment, bis resolveWebviewView gelaufen
 * ist — ohne das Warten ging die erste Nachricht nach einem Neustart verloren.
 */
async function focusChat(promptValue: string): Promise<void> {
    await vscode.commands.executeCommand('codingForeverView.focus');

    for (let attempt = 0; attempt < 20 && !activeSidebarView; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 75));
    }

    if (activeSidebarView) {
        activeSidebarView.webview.postMessage({ type: 'setPrompt', value: promptValue });
    } else {
        vscode.window.showWarningMessage('Das Coding-Forever-Chatfenster konnte nicht geöffnet werden.');
    }
}

/* ==========================================================
 * DIFF-ANSICHT
 * ========================================================== */

function registerDiffProvider(context: vscode.ExtensionContext) {
    const provider = new class implements vscode.TextDocumentContentProvider {
        onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
        onDidChange = this.onDidChangeEmitter.event;

        provideTextDocumentContent(uri: vscode.Uri): string {
            return diffContentStore.get(uri.toString()) || '';
        }
    };

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('coding-forever-diff', provider),
        // Alte URIs aus Versionen vor 2.9.0 weiterhin bedienen.
        vscode.workspace.registerTextDocumentContentProvider('gemini-diff', provider)
    );
}

async function showCodeDiff(originalUri: vscode.Uri, modifiedContent: string): Promise<void> {
    const fileName = path.basename(originalUri.fsPath) || 'file';
    const virtualUri = vscode.Uri.parse(
        `coding-forever-diff://proposed/${encodeURIComponent(fileName)}?v=${Date.now()}`
    );

    // Ohne diese Grenze blieb jeder je vorgeschlagene Dateiinhalt bis zum
    // Schließen von VS Code im Speicher liegen.
    if (diffContentStore.size >= MAX_DIFF_ENTRIES) {
        const oldest = diffContentStore.keys().next().value;
        if (oldest) { diffContentStore.delete(oldest); }
    }
    diffContentStore.set(virtualUri.toString(), modifiedContent);

    await vscode.commands.executeCommand(
        'vscode.diff', originalUri, virtualUri, `${fileName} (Original ↔ Vorschlag)`
    );
}

async function confirmAction(message: string): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(
        message, { modal: true }, 'Ja, ausführen', 'Abbrechen'
    );
    return answer === 'Ja, ausführen';
}

/* ==========================================================
 * NACHRICHTEN AUS DEM WEBVIEW
 * ========================================================== */

function getWorkspaceName(): string {
    return vscode.workspace.workspaceFolders?.[0]?.name || 'global';
}

function broadcast(message: any) {
    activeSidebarView?.webview.postMessage(message);
    CodingForeverPanel.currentPanels.forEach(panel => panel.postMessage(message));
}

async function handleWebviewMessage(
    target: MessageTarget,
    context: vscode.ExtensionContext,
    deps: Deps,
    msg: any
): Promise<void> {
    const { settings, dbManager } = deps;
    const post = (payload: any) => target.webview.postMessage(payload);

    try {
        switch (msg.type) {
            /* --- Bootstrap & Modelle --- */
            case 'requestSettings': {
                post({ type: 'settings', settings: await settings.getPublicSettings() });
                return;
            }

            case 'getModels': {
                post({ type: 'modelsLoaded', groups: await listAllModels(await settings.getCredentials()) });
                return;
            }

            case 'getWorkspaceFiles': {
                const files = await vscode.workspace.findFiles(
                    '**/*',
                    '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/*.vsix}',
                    2000
                );
                post({
                    type: 'workspaceFiles',
                    files: files.map(f => vscode.workspace.asRelativePath(f)).sort()
                });
                return;
            }

            /* --- Sessions --- */
            case 'initializeSession':
            case 'newChat': {
                const session = msg.type === 'newChat'
                    ? await dbManager.createSession(`session_${Date.now()}`, 'Neuer Chat', getWorkspaceName())
                    : await dbManager.getOrCreateCurrentSession(getWorkspaceName(), 'Neuer Chat');
                post({ type: 'sessionInitialized', sessionId: session.id, title: session.title });

                // Beim Öffnen der Sidebar die laufende Unterhaltung wieder anzeigen.
                // Vorher begann das Fenster jedes Mal leer, obwohl die Session mit
                // ihrem kompletten Verlauf weiterlief.
                if (msg.type === 'initializeSession') {
                    const { messages } = await dbManager.getSessionWithMessages(session.id);
                    if (messages.length > 0) {
                        post({
                            type: 'sessionLoaded',
                            sessionId: session.id,
                            messages: messages.map(m => ({ sender: m.sender, text: m.text }))
                        });
                    }
                }
                return;
            }

            case 'loadHistory': {
                post({
                    type: 'historyLoaded',
                    sessions: await dbManager.getRecentSessions(getWorkspaceName(), 50)
                });
                return;
            }

            case 'loadSession': {
                const { messages } = await dbManager.getSessionWithMessages(msg.sessionId);
                post({
                    type: 'sessionLoaded',
                    sessionId: msg.sessionId,
                    messages: messages.map(m => ({ sender: m.sender, text: m.text }))
                });
                return;
            }

            case 'deleteSession': {
                await dbManager.deleteSession(msg.sessionId);
                dbManager.flush();
                post({
                    type: 'historyLoaded',
                    sessions: await dbManager.getRecentSessions(getWorkspaceName(), 50)
                });
                return;
            }

            /* --- Chat --- */
            case 'runChat': {
                await handleChat(target, deps, msg);
                return;
            }

            case 'cancelChat': {
                activeRuns.get(target.webview)?.abort();
                return;
            }

            /* --- Editor-Aktionen --- */
            case 'applyCodeToEditor': {
                await applyCodeToActiveEditor(msg.code);
                return;
            }

            case 'showDiff': {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    await showCodeDiff(editor.document.uri, msg.code);
                } else {
                    vscode.window.showErrorMessage('Kein aktiver Editor geöffnet, um ein Diff anzuzeigen.');
                }
                return;
            }

            case 'executeCommand': {
                const terminal = vscode.window.createTerminal({ name: 'Coding Forever' });
                terminal.show();
                terminal.sendText(String(msg.command ?? ''));
                return;
            }

            /* --- Navigation --- */
            case 'openChat':
                return await CodingForeverPanel.createOrShow(context, deps, 'chat');
            case 'openDashboard':
                return await CodingForeverPanel.createOrShow(context, deps, 'dashboard');
            case 'openSettings':
                return await CodingForeverPanel.createOrShow(context, deps, 'settings');
            case 'createProject':
                return await createProject();
            case 'checkUpdates':
                return await checkForGitHubUpdates(context, true);

            case 'openVsCodeSettings': {
                await vscode.commands.executeCommand(
                    'workbench.action.openSettings', 'codingForever'
                );
                return;
            }

            case 'usePrompt': {
                // Prompt-Blöcke wandern in das Chat-Eingabefeld, statt sofort zu
                // laufen: so lässt sich der Platzhalter-Text noch anpassen.
                await focusChat(String(msg.prompt ?? ''));
                return;
            }

            /* --- Einstellungen --- */
            case 'saveAiSettings': {
                // Nur übergebene Keys anfassen: die Seite kennt die gespeicherten
                // Keys nicht mehr, deshalb darf ein leeres Feld nichts löschen.
                const keys = msg.keys ?? {};
                for (const [name, value] of Object.entries(keys)) {
                    if (typeof value === 'string' && value.trim()) {
                        await settings.setKey(name as any, value);
                    }
                }
                for (const name of (msg.clearKeys ?? []) as string[]) {
                    await settings.setKey(name as any, '');
                }
                await settings.updatePreferences(msg.prefs ?? {});

                vscode.window.showInformationMessage('AI-Einstellungen gespeichert.');
                const updated = await settings.getPublicSettings();
                broadcast({ type: 'settings', settings: updated });
                broadcast({ type: 'modelsLoaded', groups: await listAllModels(await settings.getCredentials()) });
                return;
            }

            case 'saveSettings': {
                await settings.updatePreferences(msg.prefs ?? {});
                vscode.window.showInformationMessage('Einstellungen gespeichert.');
                broadcast({ type: 'settings', settings: await settings.getPublicSettings() });
                return;
            }

            /* --- System --- */
            case 'scanSystem': {
                const specs = await getSystemSpecs();
                post({ type: 'systemSpecs', specs, recommended: getDynamicModelRecommendations(specs) });
                return;
            }

            case 'scanLiveStats': {
                post({ type: 'liveStats', stats: await getLiveStats() });
                return;
            }

            /* --- Prompt-Bibliothek --- */
            case 'getPrompts': {
                post({ type: 'loadPrompts', data: await dbManager.getPrompts(getWorkspaceName()) });
                return;
            }

            case 'addPrompt': {
                const workspaceName = getWorkspaceName();
                await dbManager.addPrompt({
                    ...msg.data,
                    workspace: msg.data.scope === 'workspace' ? (msg.data.workspace ?? workspaceName) : null
                });
                dbManager.flush();
                post({ type: 'loadPrompts', data: await dbManager.getPrompts(workspaceName) });
                vscode.window.showInformationMessage(`Prompt-Block "${msg.data.label}" gespeichert.`);
                return;
            }

            case 'deletePrompt': {
                await dbManager.deletePrompt(msg.id);
                dbManager.flush();
                post({ type: 'loadPrompts', data: await dbManager.getPrompts(getWorkspaceName()) });
                return;
            }

            default:
                return;
        }
    } catch (error: any) {
        // Vorher endete jeder Fehler hier in einem console.error — das Webview
        // wartete dann endlos auf eine Antwort, die nie kam.
        console.error('Coding Forever: Fehler im Message-Handler:', error);
        post({ type: 'error', text: `Interner Fehler (${msg?.type}): ${error.message}` });
        post({ type: 'chatDone' });
    }
}

/* ==========================================================
 * CHAT-ORCHESTRIERUNG
 * ========================================================== */

/** Gespeicherte Nachrichten in den Verlauf für das Modell übersetzen. */
function toAgentMessages(stored: ChatMessage[], maxChars = 40_000): AgentMessage[] {
    const messages: AgentMessage[] = [];
    let budget = maxChars;

    // Von hinten auffüllen, damit bei knappem Budget die jüngsten Nachrichten bleiben.
    for (let i = stored.length - 1; i >= 0; i--) {
        const entry = stored[i];
        if (entry.sender !== 'user' && entry.sender !== 'assistant') { continue; }
        const text = entry.text ?? '';
        if (!text.trim()) { continue; }
        if (text.length > budget) { break; }
        budget -= text.length;
        messages.unshift({ role: entry.sender === 'user' ? 'user' : 'assistant', content: text });
    }

    // Ein Verlauf, der mit einer Assistant-Nachricht beginnt, irritiert manche
    // Anbieter (Anthropic lehnt ihn sogar ab).
    while (messages.length > 0 && messages[0].role === 'assistant') { messages.shift(); }
    return messages;
}

const PROVIDER_ICONS: Record<string, string> = {
    gemini: '🤖', groq: '⚡', claude: '🧠', openai: '🌐', local: '🖥️'
};

async function handleChat(target: MessageTarget, deps: Deps, msg: any): Promise<void> {
    const { settings, dbManager } = deps;
    const post = (payload: any) => target.webview.postMessage(payload);

    const rawPrompt = String(msg.prompt ?? '').trim();
    if (!rawPrompt) { return; }

    // Ein neuer Lauf bricht einen noch laufenden ab, statt parallel zu antworten.
    activeRuns.get(target.webview)?.abort();
    const controller = new AbortController();
    activeRuns.set(target.webview, controller);

    try {
        const workspaceName = getWorkspaceName();
        let sessionId: string = msg.sessionId;
        if (!sessionId) {
            const session = await dbManager.getOrCreateCurrentSession(workspaceName, 'Neuer Chat');
            sessionId = session.id;
            post({ type: 'sessionInitialized', sessionId, title: session.title });
        }

        const limits = getAgentLimits();
        // Verlauf VOR dem Speichern der aktuellen Frage laden, sonst steht sie doppelt drin.
        const history = toAgentMessages(await dbManager.getRecentMessages(sessionId, limits.historyDepth));

        const editorContext = readEditorContext();
        const filledPrompt = applyTemplatePlaceholders(rawPrompt, editorContext);
        await dbManager.addMessage(sessionId, 'user', filledPrompt);

        const { prompt, attached } = expandFileMentions(filledPrompt);
        if (attached.length > 0) {
            post({ type: 'status', text: `📎 Kontext angehängt: ${attached.join(', ')}` });
        }

        const resolved = resolveModel(msg.model, await settings.getCredentials());
        const agentMode = msg.agentMode !== false;
        const autoAccept = msg.autoAccept === true;

        let tools = agentMode ? AGENT_TOOLS : null;
        if (tools && resolved.toolsUnsupported) {
            tools = null;
            post({
                type: 'status',
                text: `ℹ️ ${resolved.model} unterstützt nur eingebaute Tools – läuft ohne Datei-/Terminal-Zugriff.`
            });
        }

        post({
            type: 'status',
            text: `${PROVIDER_ICONS[resolved.providerId] ?? '🤖'} ${resolved.provider.label} · ${resolved.model}`
                + `${tools ? ' · Agent' : ''}`
        });

        const toolContext: ToolContext = {
            autoAccept,
            onStatus: text => post({ type: 'status', text }),
            confirm: confirmAction,
            showDiff: showCodeDiff
        };

        let blockId = '';
        const result = await runAgentLoop({
            provider: resolved.provider,
            model: resolved.model,
            system: buildSystemPrompt({ agentMode, editor: editorContext, workspaceName, autoAccept }),
            history,
            prompt,
            tools,
            maxTurns: limits.maxTurns,
            signal: controller.signal,
            toolContext,
            onTurnStart: () => {
                blockId = `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                post({ type: 'assistantStart', id: blockId });
            },
            onDelta: text => post({ type: 'assistantDelta', id: blockId, text }),
            onTurnEnd: text => {
                post({ type: 'assistantEnd', id: blockId, text });
                if (text.trim()) {
                    void dbManager.addMessage(sessionId, 'assistant', text);
                }
            },
            onStatus: text => post({ type: 'status', text })
        });

        if (result.aborted) {
            post({ type: 'status', text: '⏹️ Abgebrochen.' });
        }

        await maybeGenerateTitle(target, deps, sessionId, filledPrompt, result.text, resolved);
    } catch (error: any) {
        if (isAbortError(error)) {
            post({ type: 'status', text: '⏹️ Abgebrochen.' });
        } else if (error instanceof ProviderError) {
            post({ type: 'error', text: error.message });
        } else {
            console.error('Coding Forever: Chat fehlgeschlagen:', error);
            post({ type: 'error', text: `Unerwarteter Fehler: ${error.message}` });
        }
    } finally {
        if (activeRuns.get(target.webview) === controller) {
            activeRuns.delete(target.webview);
        }
        post({ type: 'chatDone' });
        dbManager.flush();
    }
}

/**
 * Benennt eine frische Session nach dem ersten Austausch.
 * Vorher hieß jeder Verlaufseintrag "New Chat".
 */
async function maybeGenerateTitle(
    target: MessageTarget,
    deps: Deps,
    sessionId: string,
    userPrompt: string,
    answer: string,
    resolved: ReturnType<typeof resolveModel>
): Promise<void> {
    if (!answer.trim()) { return; }

    const session = await deps.dbManager.getSession(sessionId);
    if (!session) { return; }
    if (session.title && !/^(neuer chat|new chat)$/i.test(session.title)) { return; }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
        const title = await generateChatTitle(
            resolved.provider,
            pickCheapModel(resolved.providerId, resolved.model),
            userPrompt,
            answer,
            controller.signal
        );
        await deps.dbManager.updateSessionTitle(sessionId, title);
        deps.dbManager.flush();
        target.webview.postMessage({ type: 'sessionTitle', sessionId, title });
        target.webview.postMessage({
            type: 'historyLoaded',
            sessions: await deps.dbManager.getRecentSessions(getWorkspaceName(), 50)
        });
    } catch {
        // Ein fehlgeschlagener Titel ist belanglos — der Chat selbst ist fertig.
    } finally {
        clearTimeout(timeout);
    }
}

async function applyCodeToActiveEditor(rawCode: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('Kein aktiver Editor geöffnet.');
        return;
    }

    const cleanCode = String(rawCode ?? '')
        .replace(/^```[a-zA-Z]*\r?\n/, '')
        .replace(/\r?\n```\s*$/, '');

    await editor.edit(editBuilder => {
        if (!editor.selection.isEmpty) {
            editBuilder.replace(editor.selection, cleanCode);
        } else {
            const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
            editBuilder.replace(
                new vscode.Range(new vscode.Position(0, 0), lastLine.range.end),
                cleanCode
            );
        }
    });

    vscode.window.showInformationMessage('Code in den Editor übernommen.');
}

async function handleDataMigration(context: vscode.ExtensionContext): Promise<void> {
    const currentVersion = context.extension.packageJSON.version;
    const storedVersion = context.globalState.get<string>('codingForeverVersion');
    if (storedVersion !== currentVersion) {
        await context.globalState.update('codingForeverVersion', currentVersion);
    }
}

/* ==========================================================
 * PANEL
 * ========================================================== */

class CodingForeverPanel {
    public static currentPanels = new Map<string, CodingForeverPanel>();
    private readonly disposables: vscode.Disposable[] = [];

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly route: string
    ) {}

    public postMessage(message: any) {
        this.panel.webview.postMessage(message);
    }

    public static async createOrShow(
        context: vscode.ExtensionContext,
        deps: Deps,
        route: string
    ): Promise<void> {
        const column = vscode.window.activeTextEditor?.viewColumn;

        const existing = CodingForeverPanel.currentPanels.get(route);
        if (existing) {
            existing.panel.reveal(column);
            return;
        }

        const titles: Record<string, string> = {
            chat: 'Coding Forever Chat',
            dashboard: 'Coding Forever Dashboard',
            settings: 'Coding Forever Einstellungen'
        };

        const panel = vscode.window.createWebviewPanel(
            `codingForeverPanel_${route}`,
            titles[route] || 'Coding Forever',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'dist'))]
            }
        );

        const instance = new CodingForeverPanel(panel, route);
        panel.webview.html = getWebviewHtml(
            panel.webview, context, route, await deps.settings.getPublicSettings()
        );
        panel.webview.onDidReceiveMessage(
            msg => handleWebviewMessage(panel, context, deps, msg),
            null,
            instance.disposables
        );
        panel.onDidDispose(() => instance.dispose(), null, instance.disposables);

        CodingForeverPanel.currentPanels.set(route, instance);
    }

    private dispose() {
        CodingForeverPanel.currentPanels.delete(this.route);
        activeRuns.get(this.panel.webview)?.abort();
        activeRuns.delete(this.panel.webview);
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }
}
