import React, { useEffect, useState } from 'react';
import { bootstrap, PublicSettings, vscode } from '../lib/vscodeApi';

const FONT_OPTIONS = [
    { value: 'var(--vscode-font-family)', label: 'VS Code Standard' },
    { value: 'var(--vscode-editor-font-family)', label: 'Editor-Schrift (monospace)' },
    { value: "'Segoe UI', system-ui, sans-serif", label: 'Segoe UI' },
    { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
    { value: "'Fira Code', monospace", label: 'Fira Code' },
    { value: "'Inter', system-ui, sans-serif", label: 'Inter' }
];

const SIZE_OPTIONS = [
    { value: 10, label: 'Sehr kompakt' },
    { value: 11, label: 'Kompakt' },
    { value: 12, label: 'Normal' },
    { value: 14, label: 'Groß' },
    { value: 16, label: 'Sehr groß' }
];

export const Settings: React.FC = () => {
    const [chatFont, setChatFont] = useState(bootstrap.settings.chatFont);
    const [chatFontSize, setChatFontSize] = useState(bootstrap.settings.chatFontSize);
    const [saved, setSaved] = useState(false);

    // Die Seite wurde vorher ohne Props gerendert und startete deshalb mit
    // leeren Feldern — ein Klick auf "Speichern" löschte dadurch den API-Key.
    // Keys liegen jetzt ausschließlich in der SecretStorage und werden hier
    // gar nicht mehr angefasst.
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'settings') {
                const settings: PublicSettings = event.data.settings;
                setChatFont(settings.chatFont);
                setChatFontSize(settings.chatFontSize);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleSave = () => {
        vscode.postMessage({ type: 'saveSettings', prefs: { chatFont, chatFontSize } });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="cf-page">
            <style>{PAGE_CSS}</style>

            <h2 className="cf-title">Einstellungen</h2>
            <p className="cf-lead">
                Darstellung des Chats. API-Keys und Modelle liegen unter <strong>AI Engine</strong>,
                die Agent-Grenzen in den VS Code Einstellungen.
            </p>

            <section className="cf-card">
                <div className="cf-card-title">Darstellung des Chats</div>

                <span className="cf-label">Schriftart</span>
                <select className="cf-input" value={chatFont} onChange={e => setChatFont(e.target.value)}>
                    {FONT_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>

                <span className="cf-label" style={{ marginTop: '10px' }}>
                    Größe — skaliert Text und Abstände gemeinsam
                </span>
                <div className="cf-row">
                    <input
                        className="cf-range"
                        type="range"
                        min={9}
                        max={18}
                        step={1}
                        value={chatFontSize}
                        onChange={e => setChatFontSize(Number(e.target.value))}
                    />
                    <span className="cf-badge muted">{chatFontSize} px</span>
                </div>
                <div className="cf-row" style={{ marginTop: '6px', flexWrap: 'wrap' }}>
                    {SIZE_OPTIONS.map(option => (
                        <button
                            key={option.value}
                            className={`cf-btn-secondary${chatFontSize === option.value ? ' active' : ''}`}
                            onClick={() => setChatFontSize(option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <div className="cf-preview" style={{ fontFamily: chatFont, fontSize: `${chatFontSize}px` }}>
                    So sieht dein Chat aus — <code>const antwort = await krebsi.hilf(mir);</code>
                </div>
            </section>

            <section className="cf-card">
                <div className="cf-card-title">Agent-Verhalten</div>
                <p className="cf-hint">
                    Maximale Schritte pro Anfrage, Verlaufstiefe und die Rückfrage bei riskanten
                    Befehlen sind VS Code Einstellungen (Präfix <code>codingForever.agent</code>).
                </p>
                <button className="cf-btn-secondary"
                    onClick={() => vscode.postMessage({ type: 'openVsCodeSettings' })}>
                    VS Code Einstellungen öffnen
                </button>
            </section>

            <section className="cf-card">
                <div className="cf-card-title">Version</div>
                <p className="cf-hint">Coding Forever v{bootstrap.extVersion} · Workspace: {bootstrap.workspaceName}</p>
                <button className="cf-btn-secondary"
                    onClick={() => vscode.postMessage({ type: 'checkUpdates' })}>
                    Nach Updates suchen
                </button>
            </section>

            <button className="cf-btn-primary" onClick={handleSave}>
                {saved ? '✓ Gespeichert' : 'Speichern'}
            </button>
        </div>
    );
};

export const PAGE_CSS = `
.cf-page {
    padding: 18px 22px; max-width: 560px; margin: 0 auto; box-sizing: border-box;
    color: var(--cf-fg); font-size: 13px;
}
.cf-title {
    margin: 0 0 6px; text-transform: uppercase; font-size: 20px;
    background-image: linear-gradient(to bottom, #fed7aa, var(--cf-accent), #431407);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.cf-lead { color: var(--cf-fg-muted); font-size: 12px; line-height: 1.5; margin: 0 0 18px; }
.cf-card {
    margin-bottom: 14px; padding: 12px 14px; border-radius: 6px;
    background: var(--cf-bg-elev); border: 1px solid var(--cf-border);
}
.cf-card-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.cf-label {
    display: block; margin-bottom: 4px; font-size: 11.5px;
    font-weight: 600; color: var(--cf-fg-muted);
}
.cf-input {
    width: 100%; box-sizing: border-box; padding: 6px 9px; border-radius: 4px; font-size: 12px;
    background: var(--cf-bg-input); color: var(--cf-fg); border: 1px solid var(--cf-border);
    font-family: inherit;
}
.cf-input:focus { outline: none; border-color: var(--cf-accent); }
.cf-preview {
    margin-top: 10px; padding: 8px 10px; border-radius: 4px; font-size: 12px;
    background: var(--cf-bg); border: 1px dashed var(--cf-border); color: var(--cf-fg-muted);
}
.cf-hint { font-size: 11.5px; color: var(--cf-fg-muted); line-height: 1.5; margin: 0 0 10px; }
.cf-hint code {
    background: var(--cf-code-bg); border-radius: 3px; padding: 1px 4px;
    font-family: var(--vscode-editor-font-family, monospace);
}
.cf-btn-primary {
    width: 100%; padding: 9px; border: none; border-radius: 4px; cursor: pointer;
    background: var(--cf-accent); color: #fff; font-weight: 700; font-size: 12.5px;
    text-transform: uppercase; letter-spacing: .03em;
}
.cf-btn-primary:hover { background: var(--cf-accent-hover); }
.cf-btn-secondary {
    padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11.5px;
    background: transparent; color: var(--cf-fg); border: 1px solid var(--cf-border);
}
.cf-btn-secondary:hover { border-color: var(--cf-accent); color: var(--cf-accent); }
.cf-row { display: flex; gap: 6px; align-items: center; }
.cf-badge {
    font-size: 10px; padding: 1px 6px; border-radius: 3px;
    background: var(--cf-success); color: #fff; white-space: nowrap;
}
.cf-badge.muted { background: var(--cf-border-strong); color: var(--cf-fg-muted); }
.cf-btn-secondary.active { border-color: var(--cf-accent); color: var(--cf-accent); }
.cf-range { flex: 1; accent-color: var(--cf-accent); cursor: pointer; }
.cf-preview code {
    background: var(--cf-code-bg); border-radius: 3px; padding: 1px 4px;
    font-family: var(--vscode-editor-font-family, monospace);
}
`;
