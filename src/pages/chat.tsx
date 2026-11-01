import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Check, CircleQuestionMark, Copy, Download, FileDiff, History, LayoutDashboard,
    Settings as SettingsIcon, SquarePen, SquareStop, Trash2, Wand2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';

import {
    bootstrap, groupKey, hasActiveOllama, ModelGroup, PublicSettings, qualifyModelId, vscode
} from '../lib/vscodeApi';
import { isLightTheme, THEME_CSS } from '../lib/theme';

SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('markup', markup);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('rust', rust);

/** Lockere Sprachnamen aus ```-Fences auf registrierte Prism-Keys mappen. */
const LANG_ALIAS: Record<string, string> = {
    ts: 'typescript', js: 'javascript', py: 'python', sh: 'bash', shell: 'bash',
    zsh: 'bash', console: 'bash', yml: 'yaml', rs: 'rust', htm: 'markup',
    text: 'text', txt: 'text', plaintext: 'text'
};

const LANG_EXT: Record<string, string> = {
    typescript: 'ts', tsx: 'tsx', javascript: 'js', jsx: 'jsx', python: 'py',
    json: 'json', markup: 'html', html: 'html', css: 'css', bash: 'sh',
    sql: 'sql', yaml: 'yml', rust: 'rs', text: 'txt'
};

function resolveLang(lang: string): string {
    const key = (lang || 'text').toLowerCase();
    return LANG_ALIAS[key] || key;
}

type Sender = 'user' | 'assistant' | 'status' | 'error';

interface MessageItem {
    id: string;
    sender: Sender;
    text: string;
    streaming?: boolean;
}

interface ChatSessionItem {
    id: string;
    title: string;
    updated_at?: string;
}

interface PromptBlock {
    id: string;
    label: string;
    category: string;
    description: string;
    prompt: string;
}

interface ChatProps {
    extName?: string;
    userName?: string;
}

const post = (payload: any) => vscode.postMessage(payload);

/* ==========================================================
 * CODE-BLOCK
 * ========================================================== */

const CodeBlock: React.FC<{ code: string; lang: string }> = ({ code, lang }) => {
    const [copied, setCopied] = useState(false);
    const resolved = resolveLang(lang);
    const light = useMemo(() => isLightTheme(), []);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }).catch(() => { /* Clipboard kann im Webview blockiert sein */ });
    };

    const handleDownload = () => {
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `snippet.${LANG_EXT[resolved] || 'txt'}`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="cf-code">
            <div className="cf-code-head">
                <span className="cf-code-lang">{resolved}</span>
                <div style={{ display: 'flex', gap: '2px' }}>
                    <button className="cf-icon-flat" title="Diff gegen aktive Datei"
                        onClick={() => post({ type: 'showDiff', code })}>
                        <FileDiff size={12} />
                    </button>
                    <button className="cf-icon-flat" title="In aktiven Editor übernehmen"
                        onClick={() => post({ type: 'applyCodeToEditor', code })}>
                        <Wand2 size={12} />
                    </button>
                    <button className="cf-icon-flat" title="Herunterladen" onClick={handleDownload}>
                        <Download size={12} />
                    </button>
                    <button className="cf-icon-flat" title="Kopieren" onClick={handleCopy}>
                        {copied ? <Check size={12} color="var(--cf-success)" /> : <Copy size={12} />}
                    </button>
                </div>
            </div>
            <SyntaxHighlighter
                language={resolved}
                style={light ? vs : vscDarkPlus}
                customStyle={{
                    margin: 0, padding: '10px', fontSize: '11.5px',
                    background: 'transparent', maxHeight: '420px', overflowX: 'auto'
                }}
                codeTagProps={{ style: { fontFamily: 'var(--vscode-editor-font-family, monospace)' } }}
            >
                {code}
            </SyntaxHighlighter>
        </div>
    );
};

/* ==========================================================
 * MARKDOWN
 * ========================================================== */

/**
 * Vorher lief das über einen handgeschriebenen Zeilen-Parser, der Tabellen,
 * verschachtelte Listen, Inline-Code und Links nicht kannte.
 */
const MARKDOWN_COMPONENTS: any = {
    pre: ({ children }: any) => <>{children}</>,
    code: ({ className, children }: any) => {
        const raw = String(children ?? '').replace(/\n$/, '');
        const match = /language-([\w-]+)/.exec(className || '');
        if (!match && !raw.includes('\n')) {
            return <code className="cf-inline-code">{raw}</code>;
        }
        return <CodeBlock code={raw} lang={match?.[1] || 'text'} />;
    },
    a: ({ href, children }: any) => (
        <a href={href} target="_blank" rel="noreferrer" className="cf-link">{children}</a>
    ),
    table: ({ children }: any) => <div className="cf-table-wrap"><table>{children}</table></div>,
    h1: ({ children }: any) => <h1 className="cf-h cf-h1">{children}</h1>,
    h2: ({ children }: any) => <h2 className="cf-h cf-h2">{children}</h2>,
    h3: ({ children }: any) => <h3 className="cf-h cf-h3">{children}</h3>
};

const Markdown: React.FC<{ text: string }> = ({ text }) => (
    <div className="cf-md">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {text}
        </ReactMarkdown>
    </div>
);

/* ==========================================================
 * CHAT
 * ========================================================== */

export const Chat: React.FC<ChatProps> = ({ extName = 'Coding Forever', userName }) => {
    const [settings, setSettings] = useState<PublicSettings>(bootstrap.settings);
    const greetName = (userName || settings.userName || bootstrap.osUser || '').trim();

    const [agentMode, setAgentMode] = useState(true);
    const [autoAccept, setAutoAccept] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-3.6-flash');
    const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
    const [inputText, setInputText] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [messages, setMessages] = useState<MessageItem[]>([{
        id: 'greeting',
        sender: 'assistant',
        text: `Moin${greetName ? ` ${greetName}` : ''}! **${extName}** ist bereit. Was soll gebaut werden?`
    }]);
    const [prompts, setPrompts] = useState<PromptBlock[]>([]);
    const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
    const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
    const [slashQuery, setSlashQuery] = useState<string | null>(null);
    const [atQuery, setAtQuery] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const pinnedToBottom = useRef(true);

    /* --- Auto-Scroll, aber nur wenn der Nutzer unten steht --- */
    const handleScroll = () => {
        const element = scrollRef.current;
        if (!element) { return; }
        pinnedToBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    };

    useEffect(() => {
        if (pinnedToBottom.current) {
            endRef.current?.scrollIntoView({ block: 'end' });
        }
    }, [messages]);

    /* --- Eingehende Nachrichten --- */
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            switch (message.type) {
                case 'settings':
                    setSettings(message.settings);
                    break;

                case 'modelsLoaded':
                    setModelGroups(message.groups || []);
                    break;

                case 'toggleHistory':
                    setShowHistory(prev => !prev);
                    break;

                case 'setPrompt':
                    setInputText(message.value);
                    textareaRef.current?.focus();
                    break;

                case 'loadPrompts':
                    setPrompts(message.data || []);
                    break;

                case 'workspaceFiles':
                    setWorkspaceFiles(message.files || []);
                    break;

                case 'sessionInitialized':
                    setSessionId(message.sessionId);
                    break;

                case 'historyLoaded':
                    setSessions(message.sessions || []);
                    break;

                case 'sessionLoaded':
                    setSessionId(message.sessionId);
                    setMessages(
                        (message.messages || []).map((m: any, index: number) => ({
                            id: `loaded_${index}`,
                            sender: m.sender === 'user' ? 'user' : 'assistant',
                            text: m.text
                        }))
                    );
                    break;

                case 'assistantStart':
                    setMessages(prev => [
                        ...prev,
                        { id: message.id, sender: 'assistant', text: '', streaming: true }
                    ]);
                    break;

                case 'assistantDelta':
                    setMessages(prev => prev.map(item =>
                        item.id === message.id ? { ...item, text: item.text + message.text } : item
                    ));
                    break;

                case 'assistantEnd':
                    // Turns, die nur Tools aufgerufen haben, liefern keinen Text —
                    // deren leere Blase fliegt wieder raus.
                    setMessages(prev => prev
                        .map(item => item.id === message.id
                            ? { ...item, text: message.text ?? item.text, streaming: false }
                            : item)
                        .filter(item => item.id !== message.id || item.text.trim().length > 0)
                    );
                    break;

                case 'status':
                    setMessages(prev => [
                        ...prev,
                        { id: `s_${Date.now()}_${prev.length}`, sender: 'status', text: message.text }
                    ]);
                    break;

                case 'error':
                    setMessages(prev => [
                        ...prev,
                        { id: `e_${Date.now()}_${prev.length}`, sender: 'error', text: message.text }
                    ]);
                    break;

                case 'chatDone':
                    setIsRunning(false);
                    break;

                default:
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    /* --- Initialisierung --- */
    useEffect(() => {
        post({ type: 'initializeSession' });
        post({ type: 'getPrompts' });
        post({ type: 'loadHistory' });
        post({ type: 'getModels' });
        post({ type: 'getWorkspaceFiles' });
    }, []);

    /* --- Modell-Vorauswahl, sobald die Listen da sind --- */
    useEffect(() => {
        if (modelGroups.length === 0) { return; }
        const available = modelGroups.flatMap(group =>
            group.models.map(model => qualifyModelId(group, model.id))
        );
        if (available.length === 0 || available.includes(selectedModel)) { return; }
        setSelectedModel(available[0]);
    }, [modelGroups, selectedModel]);

    /* --- Senden --- */
    const sendPrompt = useCallback((text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isRunning) { return; }

        setMessages(prev => [
            ...prev,
            { id: `u_${Date.now()}`, sender: 'user', text: trimmed }
        ]);
        setInputText('');
        setSlashQuery(null);
        setAtQuery(null);
        setIsRunning(true);
        pinnedToBottom.current = true;

        post({
            type: 'runChat',
            prompt: trimmed,
            model: selectedModel,
            agentMode,
            autoAccept,
            sessionId
        });
    }, [agentMode, autoAccept, isRunning, selectedModel, sessionId]);

    const handleStop = () => {
        post({ type: 'cancelChat' });
        setIsRunning(false);
    };

    /* --- Eingabe: / für Prompts, @ für Dateien --- */
    const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = event.target.value;
        setInputText(value);

        const slash = value.match(/(?:^|\s)\/(\S*)$/);
        setSlashQuery(slash ? slash[1] : null);

        const at = value.match(/(?:^|\s)@(\S*)$/);
        setAtQuery(at ? at[1] : null);

        const element = event.target;
        element.style.height = 'auto';
        element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
    };

    const filteredPrompts = useMemo(() => {
        if (slashQuery === null) { return []; }
        const needle = slashQuery.toLowerCase();
        return prompts
            .filter(p => [p.label, p.category, p.description].some(
                field => field?.toLowerCase().includes(needle)
            ))
            .slice(0, 8);
    }, [prompts, slashQuery]);

    const filteredFiles = useMemo(() => {
        if (atQuery === null) { return []; }
        const needle = atQuery.toLowerCase();
        return workspaceFiles.filter(file => file.toLowerCase().includes(needle)).slice(0, 8);
    }, [atQuery, workspaceFiles]);

    const pickPrompt = (block: PromptBlock) => {
        setInputText(current => current.replace(/(?:^|\s)\/\S*$/, match =>
            `${match.startsWith(' ') ? ' ' : ''}${block.prompt}`
        ));
        setSlashQuery(null);
        textareaRef.current?.focus();
    };

    const pickFile = (file: string) => {
        setInputText(current => current.replace(/(?:^|\s)@\S*$/, match =>
            `${match.startsWith(' ') ? ' ' : ''}@${file} `
        ));
        setAtQuery(null);
        textareaRef.current?.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Escape') {
            setSlashQuery(null);
            setAtQuery(null);
            return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (slashQuery !== null && filteredPrompts.length > 0) {
                pickPrompt(filteredPrompts[0]);
                return;
            }
            if (atQuery !== null && filteredFiles.length > 0) {
                pickFile(filteredFiles[0]);
                return;
            }
            sendPrompt(inputText);
        }
    };

    const handleNewChat = () => {
        setMessages([{
            id: 'greeting',
            sender: 'assistant',
            text: 'Neuer Chat. Was soll gebaut werden?'
        }]);
        setSessionId(null);
        post({ type: 'newChat' });
    };

    const formatDate = (value?: string) => {
        if (!value) { return 'gerade'; }
        // SQLite liefert "YYYY-MM-DD HH:MM:SS" in UTC ohne Zeitzonen-Marker.
        const parsed = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
        if (Number.isNaN(parsed.getTime())) { return 'gerade'; }

        const minutes = Math.floor((Date.now() - parsed.getTime()) / 60_000);
        if (minutes < 1) { return 'gerade'; }
        if (minutes < 60) { return `vor ${minutes} min`; }
        if (minutes < 1440) { return `vor ${Math.floor(minutes / 60)} h`; }
        if (minutes < 10_080) { return `vor ${Math.floor(minutes / 1440)} d`; }
        return parsed.toLocaleDateString('de-DE');
    };

    const hasAnyModel = modelGroups.some(group => group.models.length > 0);

    // Ohne Anbieter läuft gar nichts — dann lieber einen Weg nach vorn zeigen
    // als den Nutzer gegen eine Fehlermeldung laufen lassen.
    const hasAnyProvider = settings.hasGeminiKey || settings.hasGroqKey
        || settings.hasClaudeKey || settings.hasOpenaiKey || hasActiveOllama(settings);

    return (
        <div
            className="cf-root"
            style={{
                fontFamily: settings.chatFont || 'var(--vscode-font-family)',
                ['--cf-fs' as any]: `${settings.chatFontSize || 12}px`
            }}
        >
            <style>{THEME_CSS}{CHAT_CSS}</style>

            {showHistory && (
                <aside className="cf-drawer">
                    <div className="cf-drawer-head">
                        <span>Chat-Verlauf</span>
                        <button className="cf-icon-flat" onClick={() => setShowHistory(false)}>✕</button>
                    </div>
                    {sessions.length > 0 ? sessions.map(session => (
                        <div key={session.id} className="cf-history-item"
                            onClick={() => {
                                post({ type: 'loadSession', sessionId: session.id });
                                setShowHistory(false);
                            }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="cf-history-title">{session.title}</div>
                                <div className="cf-history-date">{formatDate(session.updated_at)}</div>
                            </div>
                            <button className="cf-icon-flat" title="Löschen"
                                onClick={event => {
                                    event.stopPropagation();
                                    setSessions(prev => prev.filter(s => s.id !== session.id));
                                    post({ type: 'deleteSession', sessionId: session.id });
                                }}>
                                <Trash2 size={13} color="var(--cf-danger)" />
                            </button>
                        </div>
                    )) : (
                        <div className="cf-empty">Noch kein Verlauf vorhanden</div>
                    )}
                </aside>
            )}

            <header className="cf-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button className="cf-icon" onClick={handleNewChat} title="Neuer Chat">
                        <SquarePen size={15} />
                    </button>
                    <button className="cf-icon" onClick={() => post({ type: 'openDashboard' })} title="Dashboard">
                        <LayoutDashboard size={15} />
                    </button>
                    <button className="cf-icon" onClick={() => post({ type: 'openSettings' })} title="Einstellungen">
                        <SettingsIcon size={15} />
                    </button>
                    <button className="cf-icon" onClick={() => setShowHistory(prev => !prev)} title="Verlauf">
                        <History size={15} />
                    </button>
                    <button className="cf-icon" onClick={() => post({ type: 'openHelp' })} title="Hilfe">
                        <CircleQuestionMark size={15} />
                    </button>
                    <span className="cf-brand">Agentic Chat</span>
                </div>
                <div className="cf-flags">
                    <span className={agentMode ? 'on' : 'off'}>Agent</span>
                    <span className={autoAccept ? 'on' : 'off'}>Accept</span>
                </div>
            </header>

            {!hasAnyProvider && (
                <div className="cf-onboarding">
                    <strong>Noch kein Anbieter eingerichtet.</strong>
                    <span>
                        Trage unter <em>AI Engine</em> einen API-Key ein — Gemini und Groq sind
                        kostenlos — oder schalte lokale Modelle über Ollama frei.
                    </span>
                    <div className="cf-onboarding-actions">
                        <button onClick={() => post({ type: 'openSettings' })}>AI Engine öffnen</button>
                        <button onClick={() => post({ type: 'openHelp' })}>Hilfe</button>
                    </div>
                </div>
            )}

            <div className="cf-messages" ref={scrollRef} onScroll={handleScroll}>
                {messages.map(message => {
                    if (message.sender === 'status') {
                        return <div key={message.id} className="cf-status">{message.text}</div>;
                    }
                    if (message.sender === 'error') {
                        return <div key={message.id} className="cf-error">⚠️ {message.text}</div>;
                    }
                    return (
                        <div key={message.id}
                            className={`cf-bubble ${message.sender === 'user' ? 'user' : 'ai'}`}>
                            <Markdown text={message.text} />
                            {message.streaming && <span className="cf-caret" />}
                        </div>
                    );
                })}
                <div ref={endRef} />
            </div>

            <div className="cf-input-area">
                {slashQuery !== null && filteredPrompts.length > 0 && (
                    <div className="cf-popover">
                        {filteredPrompts.map(block => (
                            <div key={block.id || block.label} className="cf-popover-item"
                                onClick={() => pickPrompt(block)}>
                                <strong>{block.label}</strong>
                                <span>{block.category} — {block.description}</span>
                            </div>
                        ))}
                    </div>
                )}

                {atQuery !== null && filteredFiles.length > 0 && (
                    <div className="cf-popover">
                        {filteredFiles.map(file => (
                            <div key={file} className="cf-popover-item" onClick={() => pickFile(file)}>
                                <strong>{file.split('/').pop()}</strong>
                                <span>{file}</span>
                            </div>
                        ))}
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    placeholder="Was soll gebaut werden?  '/' für Prompts, '@' für Dateien, Enter sendet, Shift+Enter neue Zeile"
                    className="cf-textarea"
                />

                <div className="cf-controls">
                    <select className="cf-select" value={selectedModel}
                        onChange={event => setSelectedModel(event.target.value)}>
                        {!hasAnyModel && <option value="gemini-3.6-flash">Lade Modelle...</option>}
                        {modelGroups.map(group => (
                            <optgroup key={groupKey(group)}
                                label={group.hint ? `${group.label} — ${group.hint}` : group.label}>
                                {group.models.map(model => (
                                    <option key={`${groupKey(group)}:${model.id}`}
                                        value={qualifyModelId(group, model.id)}>
                                        {model.id}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>

                    <div className="cf-toggles">
                        <label className="cf-toggle" title="Datei- und Terminal-Zugriff für das Modell">
                            <input type="checkbox" checked={agentMode}
                                onChange={event => setAgentMode(event.target.checked)} />
                            <span className="cf-slider" />
                            <span>Agent</span>
                        </label>
                        <label className="cf-toggle" title="Änderungen ohne Rückfrage schreiben">
                            <input type="checkbox" checked={autoAccept}
                                onChange={event => setAutoAccept(event.target.checked)} />
                            <span className="cf-slider" />
                            <span>Accept All</span>
                        </label>
                    </div>

                    {isRunning ? (
                        <button className="cf-send stop" onClick={handleStop}>
                            <SquareStop size={13} /> Stop
                        </button>
                    ) : (
                        <button className="cf-send" onClick={() => sendPrompt(inputText)}
                            disabled={!inputText.trim()}>
                            Senden
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const CHAT_CSS = `
.cf-root {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    box-sizing: border-box;
    background: var(--cf-bg);
    color: var(--cf-fg);
    /* Eine Basisgroesse, alle Kindelemente rechnen in em dagegen —
       damit die Einstellung "Schriftgroesse" wirklich alles skaliert. */
    font-size: var(--cf-fs, 12px);
}
.cf-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 7px 10px; flex-shrink: 0;
    background: var(--cf-bg-elev); border-bottom: 1px solid var(--cf-border);
}
.cf-brand {
    margin-left: 6px; font-weight: 700; text-transform: uppercase; font-size: 0.92em;
    background-image: linear-gradient(to bottom, #fed7aa, var(--cf-accent), #431407);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.cf-flags { display: flex; gap: 8px; font-size: 0.84em; }
.cf-flags .on { color: var(--cf-success); }
.cf-flags .off { color: var(--cf-fg-muted); }
.cf-icon, .cf-icon-flat {
    background: transparent; border: 1px solid transparent; color: var(--cf-fg-muted);
    border-radius: 4px; cursor: pointer; padding: 4px;
    display: flex; align-items: center; justify-content: center;
}
.cf-icon { border-color: var(--cf-border); }
.cf-icon:hover, .cf-icon-flat:hover { background: var(--cf-bg-hover); color: var(--cf-accent); }
.cf-onboarding {
    flex-shrink: 0; margin: 0.85em 1em 0; padding: 0.85em 1em; border-radius: 6px;
    display: flex; flex-direction: column; gap: 0.5em; font-size: 0.95em; line-height: 1.5;
    background: var(--cf-bg-elev); border: 1px solid var(--cf-accent);
}
.cf-onboarding span { color: var(--cf-fg-muted); }
.cf-onboarding-actions { display: flex; gap: 0.5em; }
.cf-onboarding-actions button {
    padding: 0.35em 0.9em; border-radius: 4px; cursor: pointer; font-size: 0.92em;
    font-family: inherit; background: transparent; color: var(--cf-fg);
    border: 1px solid var(--cf-border);
}
.cf-onboarding-actions button:first-child {
    background: var(--cf-accent); color: #fff; border-color: var(--cf-accent); font-weight: 600;
}
.cf-messages {
    flex: 1; overflow-y: auto; padding: 1em;
    display: flex; flex-direction: column; gap: 0.85em;
}
.cf-bubble {
    padding: 0.8em 1em; border-radius: 8px; max-width: 88%;
    word-break: break-word; overflow-wrap: anywhere;
    border: 1px solid var(--cf-border);
}
.cf-bubble.user { align-self: flex-end; background: var(--cf-bubble-user); }
.cf-bubble.ai { align-self: flex-start; background: var(--cf-bubble-ai); }
.cf-status { font-size: 0.92em; color: var(--cf-fg-muted); font-style: italic; align-self: flex-start; }
.cf-error {
    font-size: 0.95em; align-self: flex-start; max-width: 88%;
    color: var(--cf-danger); border: 1px solid var(--cf-danger);
    border-radius: 6px; padding: 8px 10px; background: color-mix(in srgb, var(--cf-danger) 10%, transparent);
}
.cf-caret {
    display: inline-block; width: 6px; height: 12px; margin-left: 2px;
    background: var(--cf-accent); animation: cf-blink 1s steps(2) infinite; vertical-align: text-bottom;
}
@keyframes cf-blink { 50% { opacity: 0; } }

/* --- Markdown --- */
.cf-md > *:first-child { margin-top: 0; }
.cf-md > *:last-child { margin-bottom: 0; }
.cf-md p { margin: 0 0 8px; line-height: 1.55; }
.cf-md ul, .cf-md ol { margin: 0 0 8px; padding-left: 20px; line-height: 1.55; }
.cf-md li { margin-bottom: 3px; }
.cf-md blockquote {
    margin: 0 0 8px; padding: 2px 10px;
    border-left: 3px solid var(--cf-accent); color: var(--cf-fg-muted);
}
.cf-md hr { border: none; border-top: 1px solid var(--cf-border); margin: 10px 0; }
.cf-h { margin: 10px 0 6px; line-height: 1.3; }
.cf-h1 { font-size: 1.25em; color: var(--cf-accent); }
.cf-h2 { font-size: 1.15em; }
.cf-h3 { font-size: 1.08em; }
.cf-inline-code {
    background: var(--cf-code-bg); border: 1px solid var(--cf-border);
    border-radius: 3px; padding: 1px 4px; font-size: 0.92em;
    font-family: var(--vscode-editor-font-family, monospace);
}
.cf-link { color: var(--cf-accent); text-decoration: none; }
.cf-link:hover { text-decoration: underline; }
.cf-table-wrap { overflow-x: auto; margin-bottom: 8px; }
.cf-table-wrap table { border-collapse: collapse; font-size: 0.92em; }
.cf-table-wrap th, .cf-table-wrap td {
    border: 1px solid var(--cf-border); padding: 4px 8px; text-align: left;
}
.cf-table-wrap th { background: var(--cf-bg-elev); font-weight: 600; }

/* --- Code --- */
.cf-code {
    background: var(--cf-code-bg); border: 1px solid var(--cf-border);
    border-radius: 7px; overflow: hidden; margin: 0 0 8px;
}
.cf-code-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 4px 6px 4px 10px; border-bottom: 1px solid var(--cf-border);
}
.cf-code-lang {
    font-size: 0.84em; color: var(--cf-fg-muted);
    font-family: var(--vscode-editor-font-family, monospace);
}

/* --- Verlauf --- */
.cf-drawer {
    position: absolute; top: 0; right: 0; width: 272px; height: 100%; z-index: 100;
    background: var(--cf-bg-elev); border-left: 1px solid var(--cf-border);
    padding: 12px; box-sizing: border-box; overflow-y: auto;
    box-shadow: -4px 0 15px rgba(0,0,0,0.35);
}
.cf-drawer-head {
    display: flex; justify-content: space-between; align-items: center;
    font-weight: 600; font-size: 1em; margin-bottom: 12px;
}
.cf-history-item {
    display: flex; align-items: flex-start; gap: 6px;
    padding: 8px; margin-bottom: 6px; cursor: pointer;
    background: var(--cf-bg); border: 1px solid var(--cf-border); border-radius: 6px;
}
.cf-history-item:hover { border-color: var(--cf-accent); background: var(--cf-bg-hover); }
.cf-history-title {
    font-size: 0.95em; font-weight: 500; margin-bottom: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cf-history-date { font-size: 0.84em; color: var(--cf-fg-muted); }
.cf-empty { font-size: 0.95em; color: var(--cf-fg-muted); text-align: center; margin-top: 20px; }

/* --- Eingabe --- */
.cf-input-area {
    position: relative; flex-shrink: 0; padding: 8px 10px;
    display: flex; flex-direction: column; gap: 7px;
    background: var(--cf-bg-elev); border-top: 1px solid var(--cf-border);
}
.cf-textarea {
    width: 100%; box-sizing: border-box; resize: none; min-height: 46px; max-height: 180px;
    padding: 7px 9px; border-radius: 6px; font-size: 1em; font-family: inherit;
    background: var(--cf-bg-input); color: var(--cf-fg); border: 1px solid var(--cf-border);
}
.cf-textarea:focus { outline: none; border-color: var(--cf-accent); }
.cf-popover {
    position: absolute; bottom: 100%; left: 10px; right: 10px; margin-bottom: 4px; z-index: 10;
    background: var(--cf-bg-elev); border: 1px solid var(--cf-accent); border-radius: 6px;
    max-height: 220px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.cf-popover-item {
    padding: 7px 10px; cursor: pointer; font-size: 0.92em;
    border-bottom: 1px solid var(--cf-border);
}
.cf-popover-item:last-child { border-bottom: none; }
.cf-popover-item:hover { background: var(--cf-bg-hover); }
.cf-popover-item strong { color: var(--cf-accent); display: block; }
.cf-popover-item span { color: var(--cf-fg-muted); font-size: 0.84em; }
.cf-controls {
    display: flex; justify-content: space-between; align-items: center;
    gap: 8px; flex-wrap: wrap;
}
.cf-select {
    background: var(--cf-bg-input); color: var(--cf-fg); font-size: 0.92em;
    border: 1px solid var(--cf-border); border-radius: 4px; padding: 3px 5px;
    max-width: 46%;
}
.cf-toggles { display: flex; align-items: center; gap: 10px; }
.cf-toggle {
    display: flex; align-items: center; gap: 5px;
    font-size: 0.92em; color: var(--cf-fg-muted); cursor: pointer;
}
.cf-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.cf-slider {
    position: relative; display: inline-block; width: 30px; height: 16px;
    background: var(--cf-border-strong); border-radius: 16px; transition: background .2s;
    flex-shrink: 0;
}
.cf-slider::before {
    content: ''; position: absolute; width: 11px; height: 11px; left: 3px; top: 2.5px;
    background: #fff; border-radius: 50%; transition: transform .2s;
}
.cf-toggle input:checked + .cf-slider { background: var(--cf-accent); }
.cf-toggle input:checked + .cf-slider::before { transform: translateX(13px); }
.cf-toggle input:focus-visible + .cf-slider { outline: 1px solid var(--cf-accent); outline-offset: 2px; }
.cf-send {
    display: flex; align-items: center; gap: 4px;
    background: var(--cf-accent); color: #fff; border: none; cursor: pointer;
    padding: 6px 14px; border-radius: 4px; font-size: 0.92em; font-weight: 700;
}
.cf-send:hover:not(:disabled) { background: var(--cf-accent-hover); }
.cf-send:disabled { opacity: 0.45; cursor: default; }
.cf-send.stop { background: var(--cf-danger); }
`;
