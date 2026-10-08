import React, { useEffect, useMemo, useState } from 'react';
import { bootstrap, ModelGroup, PublicSettings, vscode } from '../lib/vscodeApi';
import { PAGE_CSS } from './Settings';

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

interface RecommendedModel {
    name: string;
    desc: string;
    tag: string;
}

type KeyName = 'geminiApiKey' | 'groqApiKey' | 'claudeApiKey' | 'openaiApiKey';

interface KeyField {
    name: KeyName;
    /** Zu welcher Gruppe im Modell-Dropdown der Key gehört. */
    providerId: ModelGroup['providerId'];
    label: string;
    placeholder: string;
    hasKeyProp: keyof PublicSettings;
    signupUrl: string;
}

const KEY_FIELDS: KeyField[] = [
    {
        name: 'geminiApiKey',
        providerId: 'gemini',
        label: 'Google Gemini',
        placeholder: 'AIzaSy...',
        hasKeyProp: 'hasGeminiKey',
        signupUrl: 'https://aistudio.google.com/apikey'
    },
    {
        name: 'groqApiKey',
        providerId: 'groq',
        label: 'Groq (kostenlos & sehr schnell)',
        placeholder: 'gsk_...',
        hasKeyProp: 'hasGroqKey',
        signupUrl: 'https://console.groq.com/keys'
    },
    {
        name: 'claudeApiKey',
        providerId: 'claude',
        label: 'Anthropic Claude',
        placeholder: 'sk-ant-...',
        hasKeyProp: 'hasClaudeKey',
        signupUrl: 'https://console.anthropic.com/settings/keys'
    },
    {
        name: 'openaiApiKey',
        providerId: 'openai',
        label: 'OpenAI',
        placeholder: 'sk-...',
        hasKeyProp: 'hasOpenaiKey',
        signupUrl: 'https://platform.openai.com/api-keys'
    }
];

export const AiSettings: React.FC = () => {
    const [settings, setSettings] = useState<PublicSettings>(bootstrap.settings);
    const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
    const [clearKeys, setClearKeys] = useState<KeyName[]>([]);
    const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
    const [specs, setSpecs] = useState<SystemSpecs | null>(null);
    const [recommended, setRecommended] = useState<RecommendedModel[]>([]);
    const [saved, setSaved] = useState(false);

    const [localEnabled, setLocalEnabled] = useState(settings.localEnabled);
    const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
    const [userName, setUserName] = useState(settings.userName);
    const [mcpConfig, setMcpConfig] = useState(settings.mcpConfig);

    useEffect(() => {
        vscode.postMessage({ type: 'getModels' });
        vscode.postMessage({ type: 'scanSystem' });

        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'settings') {
                const next: PublicSettings = message.settings;
                setSettings(next);
                setLocalEnabled(next.localEnabled);
                setBaseUrl(next.baseUrl);
                setUserName(next.userName);
                setMcpConfig(next.mcpConfig);
                setKeyInputs({});
                setClearKeys([]);
            } else if (message.type === 'modelsLoaded') {
                setModelGroups(message.groups || []);
            } else if (message.type === 'systemSpecs') {
                setSpecs(message.specs);
                setRecommended(message.recommended || []);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const localGroup = useMemo(
        () => modelGroups.find(group => group.providerId === 'local'),
        [modelGroups]
    );

    const handleSave = () => {
        // Nur tatsächlich eingegebene Keys mitschicken: die Seite kennt die
        // gespeicherten Keys nicht (sie verlassen die SecretStorage nie), ein
        // leeres Feld darf also nichts überschreiben.
        const keys: Record<string, string> = {};
        for (const [name, value] of Object.entries(keyInputs)) {
            if (value.trim()) { keys[name] = value.trim(); }
        }

        vscode.postMessage({
            type: 'saveAiSettings',
            keys,
            clearKeys,
            prefs: { localEnabled, baseUrl, userName, mcpConfig }
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const toggleClear = (name: KeyName) => {
        setClearKeys(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
        setKeyInputs(prev => ({ ...prev, [name]: '' }));
    };

    return (
        <div className="cf-page">
            <style>{PAGE_CSS}{AI_CSS}</style>

            <h2 className="cf-title">AI Engine</h2>
            <p className="cf-lead">
                Keys liegen in der verschlüsselten SecretStorage von VS Code und werden nie an
                das Chat-Fenster übertragen. Jeder hinterlegte Anbieter erscheint automatisch
                im Modell-Dropdown des Chats.
            </p>

            <section className="cf-card">
                <div className="cf-card-title">Entwickler-Name</div>
                <input className="cf-input" type="text" value={userName}
                    placeholder="z. B. Peter"
                    onChange={e => setUserName(e.target.value)} />
                <p className="cf-hint" style={{ marginTop: '6px', marginBottom: 0 }}>
                    Wird für die Begrüßung im Chat benutzt.
                </p>
            </section>

            <section className="cf-card">
                <div className="cf-card-title">Cloud-Anbieter</div>
                {KEY_FIELDS.map(field => {
                    const stored = Boolean(settings[field.hasKeyProp]);
                    const markedForDeletion = clearKeys.includes(field.name);
                    const modelCount = modelGroups
                        .find(group => group.providerId === field.providerId)?.models.length ?? 0;

                    return (
                        <div key={field.name} className="cf-key-row">
                            <div className="cf-key-head">
                                <span className="cf-label" style={{ margin: 0 }}>{field.label}</span>
                                {stored && !markedForDeletion && (
                                    <span className="cf-badge">
                                        gespeichert{modelCount ? ` · ${modelCount} Modelle` : ''}
                                    </span>
                                )}
                                {markedForDeletion && <span className="cf-badge muted">wird gelöscht</span>}
                            </div>
                            <div className="cf-row">
                                <input
                                    className="cf-input"
                                    type="password"
                                    autoComplete="off"
                                    value={keyInputs[field.name] ?? ''}
                                    disabled={markedForDeletion}
                                    placeholder={stored ? 'Zum Ersetzen neuen Key eintragen' : field.placeholder}
                                    onChange={e => setKeyInputs(prev => ({ ...prev, [field.name]: e.target.value }))}
                                />
                                {stored && (
                                    <button className="cf-btn-secondary" title="Key entfernen"
                                        onClick={() => toggleClear(field.name)}>
                                        {markedForDeletion ? 'Behalten' : 'Löschen'}
                                    </button>
                                )}
                            </div>
                            {!stored && (
                                <a className="cf-key-link" href={field.signupUrl}
                                    target="_blank" rel="noreferrer">Key erstellen ↗</a>
                            )}
                        </div>
                    );
                })}
            </section>

            <section className="cf-card">
                <div className="cf-card-head">
                    <div>
                        <div className="cf-card-title" style={{ marginBottom: '2px' }}>
                            Lokale Modelle (Ollama)
                        </div>
                        <div className="cf-hint" style={{ margin: 0 }}>
                            Läuft komplett offline, ohne API-Key.
                        </div>
                    </div>
                    <label className="cf-switch">
                        <input type="checkbox" checked={localEnabled}
                            onChange={e => setLocalEnabled(e.target.checked)} />
                        <span />
                    </label>
                </div>

                {localEnabled && (
                    <div className="cf-local">
                        <span className="cf-label">Endpoint</span>
                        <div className="cf-row">
                            <input className="cf-input" type="text" value={baseUrl}
                                placeholder="http://localhost:11434"
                                onChange={e => setBaseUrl(e.target.value)} />
                            <button className="cf-btn-secondary"
                                onClick={() => vscode.postMessage({ type: 'getModels' })}>
                                Scannen
                            </button>
                        </div>

                        {localGroup && localGroup.models.length > 0 ? (
                            <div className="cf-hint" style={{ marginTop: '8px', color: 'var(--cf-success)' }}>
                                ✓ {localGroup.models.length} Modelle erkannt: {localGroup.models.map(m => m.id).join(', ')}
                            </div>
                        ) : (
                            <div className="cf-hint" style={{ marginTop: '8px', color: 'var(--cf-danger)' }}>
                                ⚠️ {localGroup?.hint || 'Keine lokalen Modelle gefunden.'}
                            </div>
                        )}

                        {specs && (
                            <div className="cf-specs">
                                <div className="cf-hint" style={{ marginBottom: recommended.length ? '8px' : 0 }}>
                                    <strong>Hardware:</strong> {specs.cpuModel} ({specs.cpuCores} Kerne
                                    {specs.cpuSpeed ? `, ${specs.cpuSpeed.toFixed(1)} GHz` : ''})
                                    {' · '}{specs.ramUsedPercent}% von {specs.ramGB} GB RAM
                                    {specs.cpuTempC !== null ? ` · ${specs.cpuTempC}°C` : ''}
                                    {' · GPU: '}<i>{specs.gpuName}</i>
                                </div>

                                {recommended.map(model => (
                                    <div key={model.name} className="cf-rec">
                                        <div style={{ minWidth: 0 }}>
                                            <div className="cf-rec-name">
                                                {model.name} <span className="cf-badge">{model.tag}</span>
                                            </div>
                                            <div className="cf-hint" style={{ margin: 0 }}>{model.desc}</div>
                                        </div>
                                        <button className="cf-btn-secondary"
                                            onClick={() => vscode.postMessage({
                                                type: 'executeCommand',
                                                command: `ollama pull ${model.name}`
                                            })}>
                                            Installieren
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>

            <section className="cf-card">
                <div className="cf-card-head">
                    <div className="cf-card-title" style={{ marginBottom: 0 }}>MCP Server</div>
                    <a className="cf-key-link" href="https://modelcontextprotocol.io/clients"
                        target="_blank" rel="noreferrer">Verzeichnis ↗</a>
                </div>
                <p className="cf-hint">
                    Wird bereits gespeichert, aber noch nicht vom Agenten ausgewertet — die
                    MCP-Anbindung ist für ein kommendes Release vorgesehen.
                </p>
                <textarea
                    className="cf-input"
                    rows={4}
                    value={mcpConfig}
                    onChange={e => setMcpConfig(e.target.value)}
                    placeholder={'{\n  "mcpServers": {\n    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/pfad"] }\n  }\n}'}
                    style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: '11px', resize: 'vertical' }}
                />
            </section>

            <button className="cf-btn-primary" onClick={handleSave}>
                {saved ? '✓ Gespeichert' : 'Speichern'}
            </button>
        </div>
    );
};

const AI_CSS = `
.cf-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.cf-key-row { margin-bottom: 12px; }
.cf-key-row:last-child { margin-bottom: 0; }
.cf-key-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.cf-key-link { font-size: 11px; color: var(--cf-accent); text-decoration: none; }
.cf-key-link:hover { text-decoration: underline; }
.cf-switch { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
.cf-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.cf-switch span {
    position: absolute; inset: 0; cursor: pointer; border-radius: 20px;
    background: var(--cf-border-strong); transition: background .2s;
}
.cf-switch span::before {
    content: ''; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px;
    background: #fff; border-radius: 50%; transition: transform .2s;
}
.cf-switch input:checked + span { background: var(--cf-success); }
.cf-switch input:checked + span::before { transform: translateX(16px); }
.cf-local { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--cf-border); }
.cf-specs {
    margin-top: 12px; padding: 10px; border-radius: 6px;
    background: var(--cf-bg); border: 1px dashed var(--cf-border);
}
.cf-rec {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    padding: 7px 9px; margin-top: 6px; border-radius: 4px;
    background: var(--cf-bg-input); border: 1px solid var(--cf-border);
}
.cf-rec-name { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
`;
