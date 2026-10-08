import React, { useMemo, useState, useEffect } from 'react';
import { bootstrap, vscode } from '../lib/vscodeApi';
import { PAGE_CSS } from './Settings';

interface PromptBlock {
    id: string;
    label: string;
    category: string;
    description: string;
    prompt: string;
    scope: 'global' | 'workspace';
    workspace?: string | null;
}

const CATEGORIES = [
    'General', 'Refactoring', 'Debugging', 'Testing', 'Doku', 'Git', 'Security', 'Agent-Kontrolle'
];

export const PromptManager: React.FC = () => {
    const [prompts, setPrompts] = useState<PromptBlock[]>([]);
    const [filter, setFilter] = useState<'all' | 'workspace' | 'global'>('all');
    const [label, setLabel] = useState('');
    const [category, setCategory] = useState('General');
    const [description, setDescription] = useState('');
    const [prompt, setPrompt] = useState('');
    const [scope, setScope] = useState<'global' | 'workspace'>('global');

    useEffect(() => {
        vscode.postMessage({ type: 'getPrompts' });

        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'loadPrompts') {
                setPrompts(event.data.data || []);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleCreate = (event: React.FormEvent) => {
        event.preventDefault();
        if (!label.trim() || !prompt.trim()) { return; }

        // Die Felder hießen hier vorher "project", in der Datenbank aber
        // "workspace" — projektbezogene Blöcke wurden deshalb nie zugeordnet.
        vscode.postMessage({
            type: 'addPrompt',
            data: {
                label: label.trim(),
                category,
                description: description.trim(),
                prompt,
                scope,
                workspace: scope === 'workspace' ? bootstrap.workspaceName : null
            }
        });

        setLabel('');
        setDescription('');
        setPrompt('');
    };

    const visiblePrompts = useMemo(() => prompts.filter(block => {
        if (filter === 'all') { return true; }
        if (filter === 'global') { return block.scope === 'global'; }
        return block.scope === 'workspace';
    }), [filter, prompts]);

    return (
        <div className="cf-page" style={{ maxWidth: '700px' }}>
            <style>{PAGE_CSS}{PM_CSS}</style>

            <h2 className="cf-title">Prompt Library</h2>
            <p className="cf-lead">
                Gespeicherte Prompt-Blöcke stehen im Chat über <code>/</code> zur Verfügung.
                Platzhalter: <code>{'{selection}'}</code> für die Markierung, <code>{'{file}'}</code> für den Dateipfad.
            </p>

            <form className="cf-card" onSubmit={handleCreate}>
                <div className="cf-card-title">Neuer Block</div>

                <div className="pm-grid">
                    <div>
                        <span className="cf-label">Bezeichnung</span>
                        <input className="cf-input" value={label} required
                            placeholder="🧹 Clean Code"
                            onChange={e => setLabel(e.target.value)} />
                    </div>
                    <div>
                        <span className="cf-label">Kategorie</span>
                        <select className="cf-input" value={category}
                            onChange={e => setCategory(e.target.value)}>
                            {CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </div>
                </div>

                <span className="cf-label" style={{ marginTop: '10px' }}>Beschreibung</span>
                <input className="cf-input" value={description}
                    placeholder="Was macht dieser Block?"
                    onChange={e => setDescription(e.target.value)} />

                <span className="cf-label" style={{ marginTop: '10px' }}>Prompt</span>
                <textarea className="cf-input" value={prompt} rows={4} required
                    placeholder={'Refactore folgenden Code:\n\n```{selection}```'}
                    onChange={e => setPrompt(e.target.value)}
                    style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: '11.5px', resize: 'vertical' }} />

                <div className="pm-footer">
                    <label className="pm-scope">
                        <input type="radio" checked={scope === 'global'}
                            onChange={() => setScope('global')} />
                        Global
                    </label>
                    <label className="pm-scope">
                        <input type="radio" checked={scope === 'workspace'}
                            onChange={() => setScope('workspace')} />
                        Nur {bootstrap.workspaceName}
                    </label>
                    <button type="submit" className="cf-btn-primary" style={{ width: 'auto', padding: '7px 16px' }}>
                        Speichern
                    </button>
                </div>
            </form>

            <div className="pm-filters">
                {([['all', 'Alle'], ['global', 'Global'], ['workspace', 'Workspace']] as const).map(
                    ([value, text]) => (
                        <button key={value}
                            className={`cf-btn-secondary${filter === value ? ' active' : ''}`}
                            onClick={() => setFilter(value)}>
                            {text}
                        </button>
                    )
                )}
                <span className="cf-hint" style={{ margin: 0, marginLeft: 'auto' }}>
                    {visiblePrompts.length} Blöcke
                </span>
            </div>

            {visiblePrompts.map(block => (
                <div key={block.id} className="cf-card pm-item">
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="pm-item-head">
                            <strong>{block.label}</strong>
                            <span className={`cf-badge${block.scope === 'global' ? ' muted' : ''}`}>
                                {block.scope === 'global' ? 'global' : block.workspace || 'workspace'}
                            </span>
                            <span className="cf-hint" style={{ margin: 0 }}>{block.category}</span>
                        </div>
                        {block.description && (
                            <div className="cf-hint" style={{ margin: '2px 0 6px' }}>{block.description}</div>
                        )}
                        <pre className="pm-preview">{block.prompt}</pre>
                    </div>
                    <div className="pm-item-actions">
                        <button className="cf-btn-secondary"
                            onClick={() => vscode.postMessage({ type: 'usePrompt', prompt: block.prompt })}>
                            In Chat
                        </button>
                        <button className="cf-btn-secondary"
                            onClick={() => vscode.postMessage({ type: 'deletePrompt', id: block.id })}>
                            Löschen
                        </button>
                    </div>
                </div>
            ))}

            {visiblePrompts.length === 0 && (
                <div className="cf-hint" style={{ textAlign: 'center', marginTop: '20px' }}>
                    Keine Blöcke in dieser Ansicht.
                </div>
            )}
        </div>
    );
};

const PM_CSS = `
.pm-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; }
.pm-footer {
    display: flex; align-items: center; gap: 14px; margin-top: 12px;
    padding-top: 10px; border-top: 1px solid var(--cf-border); flex-wrap: wrap;
}
.pm-scope {
    display: flex; align-items: center; gap: 5px;
    font-size: 11.5px; color: var(--cf-fg-muted); cursor: pointer;
}
.pm-footer .cf-btn-primary { margin-left: auto; }
.pm-filters { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
.cf-btn-secondary.active { border-color: var(--cf-accent); color: var(--cf-accent); }
.pm-item { display: flex; gap: 12px; align-items: flex-start; }
.pm-item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; }
.pm-item-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.pm-preview {
    margin: 0; padding: 7px 9px; border-radius: 4px; max-height: 90px; overflow: auto;
    font-size: 11px; line-height: 1.45; white-space: pre-wrap; word-break: break-word;
    background: var(--cf-bg); border: 1px solid var(--cf-border); color: var(--cf-fg-muted);
    font-family: var(--vscode-editor-font-family, monospace);
}
`;
