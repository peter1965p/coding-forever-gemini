import React, { useState, useEffect } from 'react';
import { vscode } from '../lib/vscodeApi';

interface PromptBlock {
  id: number;
  label: string;
  category: string;
  description: string;
  prompt: string;
  scope: 'global' | 'project';
  project?: string;
}

const workspaceName = (window as any).WORKSPACE_NAME || 'Global';

export const PromptManager: React.FC = () => {
  const [prompts, setPrompts] = useState<PromptBlock[]>([]);
  const [filter, setFilter] = useState<'all' | 'project' | 'global'>('all');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('General');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState<'global' | 'project'>('global');

  useEffect(() => {
    vscode.postMessage({ command: 'getPrompts' });
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'loadPrompts') {
        setPrompts(message.data);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !prompt) return;

    vscode.postMessage({
      command: 'addPrompt',
      data: {
        label,
        category,
        description,
        prompt,
        scope,
        project: scope === 'project' ? workspaceName : null
      }
    });

    setLabel('');
    setDescription('');
    setPrompt('');
  };

  const handleDelete = (id: number) => {
    vscode.postMessage({ command: 'deletePrompt', id });
  };

  const handleRun = (block: PromptBlock) => {
    vscode.postMessage({
      command: 'executePrompt',
      prompt: block.prompt
    });
  };

  const visiblePrompts = prompts.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'global') return p.scope === 'global';
    return p.scope === 'project' && p.project === workspaceName;
  });

  return (
    <div style={{ padding: '16px', color: 'var(--vscode-foreground)' }}>
      <h2 style={{
      position: 'relative',
      backgroundImage: 'linear-gradient(to bottom, #fed7aa, #f97316, #431407)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      filter: 'drop-shadow(0 0 70px rgba(234, 88, 12, 0.5))',
      textTransform: 'uppercase',
      transition: 'all 1s ease'
    }}>Prompt Manager</h2>
      <p style={{ opacity: 0.8, fontSize: '0.9em' }}>
        Verwalte deine benutzerdefinierten Prompts. Nutze <code>{'{selection}'}</code> für markierten
        Code und <code>{'{file}'}</code> für den Dateipfad.
        {' '}Aktuelles Projekt: <strong>{workspaceName}</strong>
      </p>

      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Label (z.B. ⚡ Server Action)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ padding: '6px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)' }}
        />
        <input
          type="text"
          placeholder="Kategorie (z.B. Next.js, Refactoring)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ padding: '6px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)' }}
        />
        <input
          type="text"
          placeholder="Kurze Beschreibung"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ padding: '6px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)' }}
        />
        <textarea
          rows={4}
          placeholder="Prompt Text mit Platzhaltern..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ padding: '6px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)' }}
        />
        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85em' }}>
          <label>
            <input type="radio" checked={scope === 'global'} onChange={() => setScope('global')} /> Global (überall verfügbar)
          </label>
          <label>
            <input type="radio" checked={scope === 'project'} onChange={() => setScope('project')} /> Nur für "{workspaceName}"
          </label>
        </div>
        <button
          type="submit"
          style={{ padding: '8px', background: '#03950b', color: 'var(--vscode-button-foreground)', border: 'none', cursor: 'pointer' }}
        >
        Neuen Prompt erstellen
        </button>
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>Gespeicherte Prompts ({visiblePrompts.length})</h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          style={{ padding: '4px', background: 'var(--vscode-dropdown-background)', color: 'var(--vscode-dropdown-foreground)', border: '1px solid var(--vscode-dropdown-border)' }}
        >
          <option value="all">Alle</option>
          <option value="project">Nur "{workspaceName}"</option>
          <option value="global">Nur Global</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {visiblePrompts.map((item) => (
          <div
            key={item.id}
            style={{
              padding: '12px',
              border: '1px solid var(--vscode-widget-border)',
              borderRadius: '4px',
              background: 'var(--vscode-editor-background)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{item.label}</strong>
              <span style={{ fontSize: '0.8em', opacity: 0.6 }}>
                [{item.category}]{item.scope === 'project' ? ` · ${item.project}` : ' · global'}
              </span>
            </div>
            <p style={{ fontSize: '0.85em', opacity: 0.8, margin: '4px 0' }}>{item.description}</p>
            <pre style={{ fontSize: '0.8em', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', overflowX: 'auto' }}>
              {item.prompt}
            </pre>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => handleRun(item)}
                style={{ padding: '4px 8px', background: '#03950b', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Im Chat ausführen
              </button>
              <button
                onClick={() => handleDelete(item.id)}
                style={{ padding: '4px 8px', background: '#9c0418', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Löschen
              </button>
            </div>
          </div>
        ))}
        {visiblePrompts.length === 0 && (
          <p style={{ opacity: 0.5, fontSize: '0.85em' }}>Keine Prompts in dieser Ansicht.</p>
        )}
      </div>
    </div>
  );
};