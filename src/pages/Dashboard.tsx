import React, { useEffect, useMemo, useState } from 'react';
import {
    bootstrap, groupKey, hasActiveOllama, ModelGroup, OllamaStatus, PublicSettings, qualifyModelId, vscode
} from '../lib/vscodeApi';

interface SystemSpecs {
    cpuModel: string;
    cpuCores: number;
    cpuSpeed: number;
    ramGB: number;
    hasGpu: boolean;
    gpuName: string;
    osInfo: string;
    ramFreeGB: number;
    ramUsedPercent: number;
    cpuTempC: number | null;
    cpuLoadPercent: number | null;
}

interface LiveStats {
    ramGB: number;
    ramFreeGB: number;
    ramUsedPercent: number;
    cpuTempC: number | null;
    cpuLoadPercent: number | null;
}

interface SessionRow {
    id: string;
    title: string;
    updated_at?: string;
}

function loadColor(percent: number): string {
    if (percent >= 85) { return 'var(--cf-danger)'; }
    if (percent >= 65) { return '#f59e0b'; }
    return 'var(--cf-success)';
}

const ProgressBar: React.FC<{ percent: number }> = ({ percent }) => (
    <div className="db-bar">
        <div style={{
            width: `${Math.max(0, Math.min(100, percent))}%`,
            background: loadColor(percent)
        }} />
    </div>
);

export const Dashboard: React.FC = () => {
    const [settings, setSettings] = useState<PublicSettings>(bootstrap.settings);
    const [specs, setSpecs] = useState<SystemSpecs | null>(null);
    const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
    const [sessions, setSessions] = useState<SessionRow[]>([]);
    const [ollamaStatus, setOllamaStatus] = useState<Record<string, OllamaStatus>>({});
    const [ollamaChecking, setOllamaChecking] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-3.6-flash');
    const [promptText, setPromptText] = useState('');
    const [responseText, setResponseText] = useState('Bereit für Anfragen.');
    const [isRunning, setIsRunning] = useState(false);

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
                case 'systemSpecs':
                    setSpecs(message.specs);
                    break;
                case 'liveStats': {
                    const stats: LiveStats = message.stats;
                    setSpecs(prev => (prev ? { ...prev, ...stats } : prev));
                    break;
                }
                case 'historyLoaded':
                    setSessions(message.sessions || []);
                    break;
                case 'ollamaStatus': {
                    const next: Record<string, OllamaStatus> = {};
                    for (const status of message.statuses || []) { next[status.id] = status; }
                    setOllamaStatus(next);
                    setOllamaChecking(false);
                    break;
                }
                case 'assistantStart':
                    setResponseText('');
                    break;
                case 'assistantDelta':
                    setResponseText(prev => prev + message.text);
                    break;
                case 'status':
                    setResponseText(prev => `${prev}${prev ? '\n' : ''}${message.text}`);
                    break;
                case 'error':
                    setResponseText(prev => `${prev}${prev ? '\n' : ''}⚠️ ${message.text}`);
                    break;
                case 'chatDone':
                    setIsRunning(false);
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('message', handleMessage);

        vscode.postMessage({ type: 'scanSystem' });
        vscode.postMessage({ type: 'getModels' });
        vscode.postMessage({ type: 'loadHistory' });
        vscode.postMessage({ type: 'checkOllama' });

        // Nur die leichten Live-Werte nachziehen — kein erneuter GPU-/OS-Scan.
        const interval = setInterval(() => vscode.postMessage({ type: 'scanLiveStats' }), 4000);

        return () => {
            window.removeEventListener('message', handleMessage);
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        if (modelGroups.length === 0) { return; }
        const available = modelGroups.flatMap(group =>
            group.models.map(model => qualifyModelId(group, model.id))
        );
        if (available.length > 0 && !available.includes(selectedModel)) {
            setSelectedModel(available[0]);
        }
    }, [modelGroups, selectedModel]);

    const providerCount = useMemo(
        () => [
            settings.hasGeminiKey, settings.hasGroqKey,
            settings.hasClaudeKey, settings.hasOpenaiKey
        ].filter(Boolean).length + settings.ollamaInstances.filter(instance => instance.enabled).length,
        [settings]
    );

    const modelCount = useMemo(
        () => modelGroups.reduce((sum, group) => sum + group.models.length, 0),
        [modelGroups]
    );

    // Die Statuskarten zeigten vorher fest verdrahtete Werte ("Bypass ON",
    // "API-Key hinterlegt"), unabhängig von der echten Konfiguration.
    const handleSend = () => {
        if (!promptText.trim() || isRunning) { return; }
        setIsRunning(true);
        setResponseText('');
        vscode.postMessage({
            type: 'runChat',
            prompt: promptText,
            model: selectedModel,
            agentMode: false,
            autoAccept: false
        });
    };

    return (
        <div className="db-page">
            <style>{DASHBOARD_CSS}</style>

            <header className="db-head">
                <span className="db-logo">Coding Forever</span>
                <span className="db-pill">
                    {providerCount > 0
                        ? <>🟢 {providerCount} {providerCount === 1 ? 'Anbieter' : 'Anbieter'} aktiv</>
                        : <>🔴 Kein Anbieter konfiguriert</>}
                    <span className="db-muted">v{bootstrap.extVersion}</span>
                </span>
            </header>

            {providerCount === 0 && (
                <div className="db-warning">
                    Noch kein API-Key hinterlegt. Unter <strong>AI Engine</strong> einen Key
                    eintragen oder lokale Modelle über Ollama aktivieren.
                </div>
            )}

            <section className="db-card">
                <div className="db-card-title">
                    System-Monitor
                    <span className="db-muted">{specs ? specs.osInfo : 'Scanne...'}</span>
                </div>

                {specs ? (
                    <div className="db-grid">
                        <div>
                            <div className="db-metric-label">
                                CPU — {specs.cpuModel} ({specs.cpuCores} Kerne
                                {specs.cpuSpeed ? `, ${specs.cpuSpeed.toFixed(1)} GHz` : ''})
                            </div>
                            {specs.cpuLoadPercent !== null ? (
                                <>
                                    <ProgressBar percent={specs.cpuLoadPercent} />
                                    <div className="db-muted">{specs.cpuLoadPercent}% Auslastung</div>
                                </>
                            ) : (
                                <div className="db-muted">Auf dieser Plattform nicht messbar</div>
                            )}
                        </div>

                        <div>
                            <div className="db-metric-label">RAM — {specs.ramGB} GB gesamt</div>
                            <ProgressBar percent={specs.ramUsedPercent} />
                            <div className="db-muted">
                                {specs.ramUsedPercent}% belegt · {specs.ramFreeGB} GB frei
                            </div>
                        </div>

                        <div>
                            <div className="db-metric-label">CPU-Temperatur</div>
                            {specs.cpuTempC !== null ? (
                                <div className="db-big" style={{ color: loadColor(specs.cpuTempC) }}>
                                    {specs.cpuTempC}°C
                                </div>
                            ) : (
                                <div className="db-muted">Nicht auslesbar</div>
                            )}
                        </div>

                        <div>
                            <div className="db-metric-label">GPU</div>
                            <div style={{
                                fontSize: '12px',
                                color: specs.hasGpu ? 'var(--cf-success)' : 'var(--cf-fg-muted)'
                            }}>
                                {specs.gpuName}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="db-muted">Scanne Hardware...</div>
                )}
            </section>

            <div className="db-stats">
                <div className="db-card">
                    <div className="db-metric-label">Verfügbare Modelle</div>
                    <div className="db-big">{modelCount || '—'}</div>
                    <div className="db-muted">über {providerCount} Anbieter</div>
                </div>
                <div className="db-card">
                    <div className="db-metric-label">Gemini</div>
                    <div className="db-big" style={{
                        color: settings.hasGeminiKey ? 'var(--cf-success)' : 'var(--cf-fg-muted)'
                    }}>
                        {settings.hasGeminiKey ? 'Bereit' : 'Kein Key'}
                    </div>
                    <div className="db-muted">
                        Groq: {settings.hasGroqKey ? 'bereit' : '—'} · Claude: {settings.hasClaudeKey ? 'bereit' : '—'}
                    </div>
                </div>
                <div className="db-card">
                    <div className="db-metric-label">Ollama</div>
                    <div className="db-big" style={{
                        color: hasActiveOllama(settings) ? 'var(--cf-success)' : 'var(--cf-fg-muted)'
                    }}>
                        {hasActiveOllama(settings)
                            ? `${settings.ollamaInstances.filter(i => i.enabled).length} aktiv`
                            : 'Aus'}
                    </div>
                    <div className="db-muted">
                        {settings.ollamaInstances.length === 0
                            ? 'Keine Instanz eingerichtet'
                            : `von ${settings.ollamaInstances.length} Instanz${settings.ollamaInstances.length === 1 ? '' : 'en'}`}
                    </div>
                </div>
                <div className="db-card">
                    <div className="db-metric-label">Workspace</div>
                    <div className="db-big" style={{ fontSize: '15px' }}>{bootstrap.workspaceName}</div>
                    <div className="db-muted">{sessions.length} gespeicherte Chats</div>
                </div>
            </div>

            <section className="db-card">
                <div className="db-card-title">
                    Ollama-Instanzen
                    <span style={{ display: 'flex', gap: '6px' }}>
                        <button className="db-btn db-btn-small" disabled={ollamaChecking}
                            onClick={() => { setOllamaChecking(true); vscode.postMessage({ type: 'checkOllama' }); }}>
                            {ollamaChecking ? 'Prüfe...' : 'Prüfen'}
                        </button>
                        <button className="db-btn db-btn-small"
                            onClick={() => vscode.postMessage({ type: 'openSettings' })}>
                            Verwalten
                        </button>
                    </span>
                </div>

                {settings.ollamaInstances.length === 0 ? (
                    <div className="db-muted">
                        Noch keine Instanz. Unter <strong>AI Engine</strong> den eigenen Rechner oder
                        einen stärkeren im Netzwerk eintragen.
                    </div>
                ) : (
                    <div className="db-instances">
                        {settings.ollamaInstances.map(instance => {
                            const status = ollamaStatus[instance.id];
                            const state = !instance.enabled ? 'off'
                                : !status ? 'unknown'
                                : status.reachable ? 'ok' : 'down';

                            return (
                                <div key={instance.id} className={`db-instance ${state}`}>
                                    <label className="db-switch" title={instance.enabled ? 'Ausschalten' : 'Einschalten'}>
                                        <input
                                            type="checkbox"
                                            checked={instance.enabled}
                                            onChange={event => vscode.postMessage({
                                                type: 'setOllamaInstanceEnabled',
                                                id: instance.id,
                                                enabled: event.target.checked
                                            })}
                                        />
                                        <span />
                                    </label>

                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div className="db-instance-name">{instance.name}</div>
                                        <div className="db-muted">{instance.url}</div>
                                    </div>

                                    <div className="db-instance-state">
                                        {state === 'off' && <span className="db-muted">aus</span>}
                                        {state === 'unknown' && <span className="db-muted">prüfe...</span>}
                                        {state === 'ok' && (
                                            <span title={status?.version ? `Ollama ${status.version}` : undefined}>
                                                <span className="db-dot ok" /> {status?.modelCount ?? 0} Modelle
                                                {status?.latencyMs !== undefined && (
                                                    <span className="db-muted"> · {status.latencyMs} ms</span>
                                                )}
                                            </span>
                                        )}
                                        {state === 'down' && (
                                            <span title={status?.error} style={{ color: 'var(--cf-danger)' }}>
                                                <span className="db-dot down" /> nicht erreichbar
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <div className="db-split">
                <section className="db-card">
                    <div className="db-card-title">Direkt-Prompt</div>
                    <p className="db-muted" style={{ marginBottom: '12px' }}>
                        Einzelfrage ohne Datei- oder Terminal-Zugriff. Für Agent-Aufgaben den Chat nutzen.
                    </p>

                    <label className="db-metric-label">Modell</label>
                    <select className="db-input" value={selectedModel}
                        onChange={e => setSelectedModel(e.target.value)}>
                        {modelCount === 0 && <option value="gemini-3.6-flash">Lade Modelle...</option>}
                        {modelGroups.map(group => (
                            <optgroup key={groupKey(group)} label={group.hint && group.models.length === 0 ? `${group.label} — ${group.hint}` : group.label}>
                                {group.models.map(model => (
                                    <option key={`${groupKey(group)}:${model.id}`}
                                        value={qualifyModelId(group, model.id)}>
                                        {model.id}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>

                    <label className="db-metric-label" style={{ marginTop: '12px' }}>Prompt</label>
                    <textarea className="db-input" value={promptText} rows={4}
                        placeholder="Was möchtest du wissen?"
                        onChange={e => setPromptText(e.target.value)} />

                    <div className="db-actions">
                        <button className="db-btn primary" onClick={handleSend}
                            disabled={isRunning || !promptText.trim()}>
                            {isRunning ? 'Läuft...' : 'Anfrage absenden'}
                        </button>
                        <button className="db-btn" onClick={() => vscode.postMessage({ type: 'openChat' })}>
                            Chat öffnen
                        </button>
                        <button className="db-btn" onClick={() => vscode.postMessage({ type: 'createProject' })}>
                            Neues Projekt
                        </button>
                    </div>
                </section>

                <section className="db-card">
                    <div className="db-card-title">
                        Antwort
                        {isRunning && <span className="db-muted">streamt...</span>}
                    </div>
                    <pre className="db-output">{responseText}</pre>
                </section>
            </div>

            <section className="db-card">
                <div className="db-card-title">Letzte Chats in diesem Workspace</div>
                {sessions.length > 0 ? (
                    <table className="db-table">
                        <thead>
                            <tr><th>Titel</th><th>Zuletzt geändert</th></tr>
                        </thead>
                        <tbody>
                            {sessions.slice(0, 8).map(session => (
                                <tr key={session.id}>
                                    <td>{session.title}</td>
                                    <td className="db-muted">
                                        {session.updated_at
                                            ? new Date(`${session.updated_at.replace(' ', 'T')}Z`).toLocaleString('de-DE')
                                            : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="db-muted">Noch keine Chats gespeichert.</div>
                )}
            </section>
        </div>
    );
};

const DASHBOARD_CSS = `
.db-page { padding: 22px; box-sizing: border-box; color: var(--cf-fg); font-size: 13px; }
.db-head {
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: 14px; margin-bottom: 20px; border-bottom: 1px solid var(--cf-border);
}
.db-logo {
    font-size: 20px; font-weight: 700; text-transform: uppercase;
    background-image: linear-gradient(to bottom, #fed7aa, var(--cf-accent), #431407);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.db-pill {
    display: flex; align-items: center; gap: 10px; font-size: 11px;
    background: var(--cf-bg-elev); border: 1px solid var(--cf-border);
    padding: 6px 14px; border-radius: 20px;
}
.db-warning {
    margin-bottom: 18px; padding: 10px 14px; border-radius: 6px; font-size: 12px;
    border: 1px solid #f59e0b; color: #f59e0b;
}
.db-card {
    background: var(--cf-bg-elev); border: 1px solid var(--cf-border);
    border-radius: 8px; padding: 16px 18px; margin-bottom: 18px; box-sizing: border-box;
}
.db-btn-small { padding: 4px 10px; font-size: 11px; font-weight: 500; }
.db-instances { display: flex; flex-direction: column; gap: 8px; }
.db-instance {
    display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 6px;
    background: var(--cf-bg); border: 1px solid var(--cf-border);
}
.db-instance.ok { border-color: var(--cf-success); }
.db-instance.down { border-color: var(--cf-danger); }
.db-instance.off { opacity: 0.7; }
.db-instance-name { font-size: 13px; font-weight: 600; }
.db-instance-state { font-size: 11.5px; white-space: nowrap; text-align: right; }
.db-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 2px; }
.db-dot.ok { background: var(--cf-success); }
.db-dot.down { background: var(--cf-danger); }
.db-switch { position: relative; display: inline-block; width: 38px; height: 22px; flex-shrink: 0; cursor: pointer; }
.db-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.db-switch span {
    position: absolute; inset: 0; border-radius: 22px;
    background: var(--cf-border-strong); transition: background .2s;
}
.db-switch span::before {
    content: ''; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px;
    background: #fff; border-radius: 50%; transition: transform .2s;
}
.db-switch input:checked + span { background: var(--cf-success); }
.db-switch input:checked + span::before { transform: translateX(16px); }
.db-switch input:focus-visible + span { outline: 2px solid var(--cf-accent); outline-offset: 2px; }
.db-card-title {
    display: flex; justify-content: space-between; align-items: center; gap: 10px;
    font-size: 13px; font-weight: 600; margin-bottom: 12px;
}
.db-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 18px; }
.db-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; }
.db-stats .db-card { margin-bottom: 18px; }
.db-split { display: grid; grid-template-columns: 3fr 2fr; gap: 14px; }
@media (max-width: 760px) { .db-split { grid-template-columns: 1fr; } }
.db-metric-label {
    display: block; font-size: 10.5px; color: var(--cf-fg-muted);
    text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px;
}
.db-muted { font-size: 11px; color: var(--cf-fg-muted); font-weight: 400; }
.db-big { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
.db-bar {
    background: var(--cf-border); border-radius: 4px; height: 8px;
    width: 100%; overflow: hidden; margin-bottom: 4px;
}
.db-bar > div { height: 100%; transition: width .6s ease, background .6s ease; }
.db-input {
    width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px;
    font-size: 12px; font-family: inherit; resize: vertical;
    background: var(--cf-bg-input); color: var(--cf-fg); border: 1px solid var(--cf-border);
}
.db-input:focus { outline: none; border-color: var(--cf-accent); }
.db-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.db-btn {
    padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;
    background: transparent; color: var(--cf-fg); border: 1px solid var(--cf-border);
}
.db-btn:hover:not(:disabled) { border-color: var(--cf-accent); color: var(--cf-accent); }
.db-btn.primary { background: var(--cf-accent); color: #fff; border-color: var(--cf-accent); flex: 1; }
.db-btn.primary:hover:not(:disabled) { background: var(--cf-accent-hover); color: #fff; }
.db-btn:disabled { opacity: .45; cursor: default; }
.db-output {
    margin: 0; padding: 12px; border-radius: 6px; height: 190px; overflow-y: auto;
    font-size: 11.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
    background: var(--cf-bg); border: 1px solid var(--cf-border); color: var(--cf-fg-muted);
    font-family: var(--vscode-editor-font-family, monospace);
}
.db-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.db-table th {
    text-align: left; padding: 7px 8px; font-size: 10.5px; font-weight: 400;
    text-transform: uppercase; color: var(--cf-fg-muted);
    border-bottom: 1px solid var(--cf-border);
}
.db-table td { padding: 8px; border-bottom: 1px solid var(--cf-border); }
`;
