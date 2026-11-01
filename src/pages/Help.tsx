import React, { useEffect, useMemo, useState } from 'react';
import { bootstrap, ModelGroup, PublicSettings, vscode } from '../lib/vscodeApi';
import { PAGE_CSS } from './Settings';
import { HelpBlock, HelpTopic, searchHelp } from './helpContent';

interface McpServerStatus {
    name: string;
    state: 'connected' | 'connecting' | 'error' | 'disabled';
    toolCount: number;
    error?: string;
}

type CheckLevel = 'ok' | 'warn' | 'error';

interface Check {
    level: CheckLevel;
    label: string;
    detail: string;
    /** Direkt ausführbarer nächster Schritt. */
    action?: { label: string; message: any };
}

/** Fettdruck und `Code` in den Hilfetexten, ohne dafür Markdown zu laden. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
        const key = `${keyPrefix}-${index}`;
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={key}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={key} className="help-code">{part.slice(1, -1)}</code>;
        }
        return <React.Fragment key={key}>{part}</React.Fragment>;
    });
}

const Block: React.FC<{ block: HelpBlock; id: string }> = ({ block, id }) => {
    const [copied, setCopied] = useState(false);

    switch (block.kind) {
        case 'text':
            return <p className="help-p">{renderInline(block.text, id)}</p>;

        case 'list':
            return (
                <ul className="help-list">
                    {block.items.map((item, index) => (
                        <li key={`${id}-${index}`}>{renderInline(item, `${id}-${index}`)}</li>
                    ))}
                </ul>
            );

        case 'table':
            return (
                <div className="help-table-wrap">
                    <table className="help-table">
                        <thead>
                            <tr>{block.head.map(cell => <th key={cell}>{cell}</th>)}</tr>
                        </thead>
                        <tbody>
                            {block.rows.map((row, rowIndex) => (
                                <tr key={`${id}-${rowIndex}`}>
                                    {row.map((cell, cellIndex) => (
                                        <td key={cellIndex}>{renderInline(cell, `${id}-${rowIndex}-${cellIndex}`)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );

        case 'code':
            return (
                <div className="help-pre-wrap">
                    <button
                        className="cf-btn-secondary help-copy"
                        onClick={() => {
                            navigator.clipboard.writeText(block.code)
                                .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
                                .catch(() => undefined);
                        }}
                    >
                        {copied ? '✓ Kopiert' : 'Kopieren'}
                    </button>
                    <pre className="help-pre">{block.code}</pre>
                </div>
            );

        case 'note':
            return (
                <div className={`help-note ${block.tone}`}>
                    {renderInline(block.text, id)}
                </div>
            );

        default:
            return null;
    }
};

const Topic: React.FC<{ topic: HelpTopic; open: boolean; onToggle: () => void }> = ({
    topic, open, onToggle
}) => (
    <section className={`help-topic${open ? ' open' : ''}`}>
        <button className="help-topic-head" onClick={onToggle} aria-expanded={open}>
            <span className="help-icon">{topic.icon}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
                <span className="help-topic-title">{topic.title}</span>
                <span className="help-topic-summary">{topic.summary}</span>
            </span>
            <span className="help-chevron">{open ? '▾' : '▸'}</span>
        </button>
        {open && (
            <div className="help-topic-body">
                {topic.body.map((block, index) => (
                    <Block key={`${topic.id}-${index}`} block={block} id={`${topic.id}-${index}`} />
                ))}
            </div>
        )}
    </section>
);

export const Help: React.FC = () => {
    const [settings, setSettings] = useState<PublicSettings>(bootstrap.settings);
    const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
    const [mcpServers, setMcpServers] = useState<McpServerStatus[]>([]);
    const [query, setQuery] = useState('');
    const [openId, setOpenId] = useState<string | null>('schnellstart');

    useEffect(() => {
        vscode.postMessage({ type: 'requestSettings' });
        vscode.postMessage({ type: 'getModels' });
        vscode.postMessage({ type: 'getMcpStatus' });

        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'settings') { setSettings(message.settings); }
            else if (message.type === 'modelsLoaded') { setModelGroups(message.groups || []); }
            else if (message.type === 'mcpStatus') { setMcpServers(message.servers || []); }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const results = useMemo(() => searchHelp(query), [query]);

    /**
     * Die Diagnose ist der eigentliche Grund für diese Seite: statt nur zu
     * erklären, wie es gehen sollte, zeigt sie, was bei dir gerade fehlt.
     */
    const checks = useMemo<Check[]>(() => {
        const list: Check[] = [];

        const providers = [
            ['Gemini', settings.hasGeminiKey],
            ['Groq', settings.hasGroqKey],
            ['Claude', settings.hasClaudeKey],
            ['OpenAI', settings.hasOpenaiKey]
        ].filter(([, has]) => has).map(([name]) => name as string);
        if (settings.localEnabled) { providers.push('Ollama'); }

        const modelCount = modelGroups.reduce((sum, group) => sum + group.models.length, 0);

        if (providers.length === 0) {
            list.push({
                level: 'error',
                label: 'Kein Anbieter konfiguriert',
                detail: 'Ohne API-Key oder lokale Modelle kann nichts gesendet werden.',
                action: { label: 'AI Engine öffnen', message: { type: 'openSettings' } }
            });
        } else {
            list.push({
                level: 'ok',
                label: `${providers.length} Anbieter bereit`,
                detail: providers.join(', ')
            });
        }

        if (providers.length > 0 && modelCount === 0) {
            list.push({
                level: 'warn',
                label: 'Keine Modelle geladen',
                detail: 'Key falsch, kein Netz — oder bei Ollama läuft "ollama serve" nicht.',
                action: { label: 'Neu laden', message: { type: 'getModels' } }
            });
        } else if (modelCount > 0) {
            list.push({ level: 'ok', label: `${modelCount} Modelle verfügbar`, detail: 'Live beim Anbieter abgefragt.' });
        }

        const failed = mcpServers.filter(server => server.state === 'error');
        const connected = mcpServers.filter(server => server.state === 'connected');
        if (failed.length > 0) {
            list.push({
                level: 'warn',
                label: `${failed.length} MCP-Server ohne Verbindung`,
                detail: failed.map(server => `${server.name}: ${server.error ?? 'unbekannt'}`).join(' · '),
                action: { label: 'Protokoll', message: { type: 'showLog' } }
            });
        } else if (connected.length > 0) {
            list.push({
                level: 'ok',
                label: `${connected.length} MCP-Server verbunden`,
                detail: `${connected.reduce((sum, server) => sum + server.toolCount, 0)} zusätzliche Werkzeuge.`
            });
        }

        if (bootstrap.workspaceName === 'Global') {
            list.push({
                level: 'warn',
                label: 'Kein Projekt geöffnet',
                detail: 'Der Agent braucht einen Ordner, um Dateien lesen und schreiben zu können.'
            });
        }

        return list;
    }, [settings, modelGroups, mcpServers]);

    const worst: CheckLevel = checks.some(c => c.level === 'error')
        ? 'error'
        : checks.some(c => c.level === 'warn') ? 'warn' : 'ok';

    return (
        <div className="cf-page" style={{ maxWidth: '720px' }}>
            <style>{PAGE_CSS}{HELP_CSS}</style>

            <h2 className="cf-title">Hilfe</h2>
            <p className="cf-lead">
                Coding Forever v{bootstrap.extVersion} · Projekt: {bootstrap.workspaceName}
            </p>

            <section className={`cf-card help-status ${worst}`}>
                <div className="cf-card-title">
                    Statuscheck
                    <span className="cf-hint" style={{ margin: 0 }}>
                        {worst === 'ok' ? 'Alles bereit' : worst === 'warn' ? 'Läuft, mit Einschränkungen' : 'Handlungsbedarf'}
                    </span>
                </div>
                {checks.map((check, index) => (
                    <div key={index} className="help-check">
                        <span className={`help-dot ${check.level}`} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="help-check-label">{check.label}</div>
                            <div className="cf-hint" style={{ margin: 0 }}>{check.detail}</div>
                        </div>
                        {check.action && (
                            <button className="cf-btn-secondary"
                                onClick={() => vscode.postMessage(check.action!.message)}>
                                {check.action.label}
                            </button>
                        )}
                    </div>
                ))}
            </section>

            <input
                className="cf-input help-search"
                type="search"
                value={query}
                placeholder="Hilfe durchsuchen — z. B. „mcp“, „accept all“, „quota“"
                onChange={e => setQuery(e.target.value)}
            />

            {results.length === 0 ? (
                <div className="cf-hint" style={{ textAlign: 'center', margin: '20px 0' }}>
                    Nichts zu „{query}“ gefunden.{' '}
                    <a className="cf-key-link"
                        href="https://github.com/peter1965p/coding-forever-gemini/issues">
                        Frag auf GitHub ↗
                    </a>
                </div>
            ) : (
                results.map(topic => (
                    <Topic
                        key={topic.id}
                        topic={topic}
                        // Bei aktiver Suche alles aufklappen, sonst sieht man die Treffer nicht.
                        open={query.trim().length > 0 || openId === topic.id}
                        onToggle={() => setOpenId(openId === topic.id ? null : topic.id)}
                    />
                ))
            )}

            <section className="cf-card" style={{ marginTop: '14px' }}>
                <div className="cf-card-title">Weiter</div>
                <div className="cf-row" style={{ flexWrap: 'wrap' }}>
                    <button className="cf-btn-secondary"
                        onClick={() => vscode.postMessage({ type: 'openChat' })}>Chat öffnen</button>
                    <button className="cf-btn-secondary"
                        onClick={() => vscode.postMessage({ type: 'showLog' })}>Protokoll</button>
                    <button className="cf-btn-secondary"
                        onClick={() => vscode.postMessage({ type: 'checkUpdates' })}>Nach Updates suchen</button>
                    <a className="cf-btn-secondary" style={{ textDecoration: 'none' }}
                        href="https://github.com/peter1965p/coding-forever-gemini/blob/master/CHANGELOG.md"
                        target="_blank" rel="noreferrer">Changelog ↗</a>
                    <a className="cf-btn-secondary" style={{ textDecoration: 'none' }}
                        href="https://github.com/peter1965p/coding-forever-gemini/issues"
                        target="_blank" rel="noreferrer">Problem melden ↗</a>
                </div>
            </section>
        </div>
    );
};

const HELP_CSS = `
.help-status { border-left: 3px solid var(--cf-success); }
.help-status.warn { border-left-color: #f59e0b; }
.help-status.error { border-left-color: var(--cf-danger); }
.help-check {
    display: flex; align-items: flex-start; gap: 8px; padding: 7px 0;
    border-top: 1px solid var(--cf-border);
}
.help-check:first-of-type { border-top: none; }
.help-check-label { font-size: 12px; font-weight: 600; }
.help-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px;
    background: var(--cf-success);
}
.help-dot.warn { background: #f59e0b; }
.help-dot.error { background: var(--cf-danger); }
.help-search { margin-bottom: 14px; }
.help-topic {
    border: 1px solid var(--cf-border); border-radius: 6px;
    background: var(--cf-bg-elev); margin-bottom: 8px; overflow: hidden;
}
.help-topic.open { border-color: var(--cf-accent); }
.help-topic-head {
    display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    padding: 10px 12px; cursor: pointer; background: transparent; border: none;
    color: var(--cf-fg); font-family: inherit;
}
.help-topic-head:hover { background: var(--cf-bg-hover); }
.help-icon { font-size: 16px; flex-shrink: 0; }
.help-topic-title { display: block; font-size: 13px; font-weight: 600; }
.help-topic-summary { display: block; font-size: 11.5px; color: var(--cf-fg-muted); }
.help-chevron { color: var(--cf-fg-muted); flex-shrink: 0; }
.help-topic-body { padding: 2px 14px 14px; border-top: 1px solid var(--cf-border); }
.help-p { font-size: 12.5px; line-height: 1.6; margin: 10px 0; }
.help-list { font-size: 12.5px; line-height: 1.6; margin: 10px 0; padding-left: 20px; }
.help-list li { margin-bottom: 5px; }
.help-code {
    background: var(--cf-code-bg); border: 1px solid var(--cf-border); border-radius: 3px;
    padding: 1px 4px; font-size: 11px; font-family: var(--vscode-editor-font-family, monospace);
}
.help-table-wrap { overflow-x: auto; margin: 10px 0; }
.help-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.help-table th, .help-table td {
    border: 1px solid var(--cf-border); padding: 6px 9px;
    text-align: left; vertical-align: top;
}
.help-table th { background: var(--cf-bg); font-weight: 600; font-size: 11px; }
.help-pre-wrap { position: relative; margin: 10px 0; }
.help-copy { position: absolute; top: 6px; right: 6px; padding: 3px 8px; font-size: 10.5px; }
.help-pre {
    margin: 0; padding: 10px; border-radius: 6px; overflow-x: auto;
    font-size: 11px; line-height: 1.5;
    background: var(--cf-code-bg); border: 1px solid var(--cf-border);
    font-family: var(--vscode-editor-font-family, monospace);
}
.help-note {
    margin: 10px 0; padding: 9px 11px; border-radius: 5px; font-size: 12px; line-height: 1.55;
    border-left: 3px solid var(--cf-accent); background: var(--cf-bg);
}
.help-note.warn { border-left-color: #f59e0b; }
`;
