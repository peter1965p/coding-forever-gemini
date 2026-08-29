import React, { useState, useEffect } from 'react';
import { vscode } from '../lib/vscodeApi';

export interface AiConfig {
  geminiApiKey: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
  localEnabled: boolean;
  baseUrl: string;
  modelName: string;
  mcpConfig?: string;
  userName?: string;
}

const ACCENT = '#f97316';
const PRIMARY = '#16a34a';

export const AiSettings: React.FC = () => {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');

  const [localEnabled, setLocalEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [modelName, setModelName] = useState('llama3.2');
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const [mcpConfig, setMcpConfig] = useState('');
  const [userName, setUserName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'LOAD_AI_SETTINGS') {
        const payload: AiConfig = message.payload;
        if (payload.geminiApiKey) setGeminiApiKey(payload.geminiApiKey);
        if (payload.claudeApiKey) setClaudeApiKey(payload.claudeApiKey);
        if (payload.openaiApiKey) setOpenaiApiKey(payload.openaiApiKey);
        if (payload.localEnabled !== undefined) setLocalEnabled(payload.localEnabled);
        if (payload.baseUrl) setBaseUrl(payload.baseUrl);
        if (payload.modelName) setModelName(payload.modelName);
        if (payload.mcpConfig) setMcpConfig(payload.mcpConfig);
        if (payload.userName) setUserName(payload.userName);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (localEnabled) {
      fetchLocalModels(baseUrl);
    }
  }, [localEnabled, baseUrl]);

  const fetchLocalModels = async (url: string) => {
    setLoadingModels(true);
    try {
      const cleanUrl = url.replace(/\/v1\/?$/, '');
      const res = await fetch(`${cleanUrl}/api/tags`);
      const data = await res.json();
      if (data && data.models) {
        const models = data.models.map((m: any) => m.name);
        setLocalModels(models);
        if (models.length > 0 && !models.includes(modelName)) {
          setModelName(models[0]);
        }
      }
    } catch (e) {
      console.error('Konnte lokale Modelle nicht abrufen:', e);
      setLocalModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = () => {
    const config: AiConfig = {
      geminiApiKey, claudeApiKey, openaiApiKey,
      localEnabled, baseUrl, modelName, mcpConfig, userName
    };
    vscode.postMessage({ type: 'SAVE_AI_SETTINGS', payload: config });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: '16px 20px', color: 'var(--vscode-foreground)', fontFamily: 'var(--vscode-font-family)', maxWidth: '520px', margin: '0 auto' }}>

      <h2 style={{
      position: 'relative',
      backgroundImage: 'linear-gradient(to bottom, #fed7aa, #f97316, #431407)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      filter: 'drop-shadow(0 0 70px rgba(234, 88, 12, 0.5))',
      textTransform: 'uppercase',
      transition: 'all 1s ease'
    }}>
        AI Engine
      </h2>
      <p style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '0.85em', marginBottom: '20px', lineHeight: '1.4' }}>
        Gemini ist als Standard aktiv. Optional lassen sich Cloud-Keys, lokale Modelle und MCP-Server zuschalten.
      </p>

      <div style={sectionStyle}>
        <label style={labelStyle}>Entwickler-Name (Greeting)</label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="z. B. Peter"
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitle}>⚡ Cloud Provider</div>

        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Google Gemini API Key (Primär)</label>
          <input
            type="password"
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder="AIzaSy..."
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Anthropic Claude API Key (Optional)</label>
          <input
            type="password"
            value={claudeApiKey}
            onChange={(e) => setClaudeApiKey(e.target.value)}
            placeholder="sk-ant-..."
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>OpenAI ChatGPT API Key (Optional)</label>
          <input
            type="password"
            value={openaiApiKey}
            onChange={(e) => setOpenaiApiKey(e.target.value)}
            placeholder="sk-..."
            style={inputStyle}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={sectionTitle}>🖥️ Lokale Modelle (Ollama / LM Studio)</div>
            <div style={{ fontSize: '0.8em', color: 'var(--vscode-descriptionForeground)' }}>Automatischer Scan lokaler Instanzen</div>
          </div>

          <label style={{ position: 'relative', display: 'inline-block', width: '38px', height: '20px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={localEnabled}
              onChange={(e) => setLocalEnabled(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: localEnabled ? PRIMARY : 'var(--vscode-input-background)',
              border: '1px solid var(--vscode-input-border)',
              borderRadius: '20px',
              transition: '0.2s'
            }}>
              <span style={{
                position: 'absolute', height: '14px', width: '14px',
                left: localEnabled ? '20px' : '2px', bottom: '2px',
                backgroundColor: 'white', borderRadius: '50%',
                transition: '0.2s'
              }} />
            </span>
          </label>
        </div>

        {localEnabled && (
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--vscode-panel-border)' }}>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Ollama / Local Endpoint</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => fetchLocalModels(baseUrl)}
                  style={{ padding: '0 10px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }}
                  title="Modelle neu laden"
                >
                  {loadingModels ? '...' : '🔄 Scan'}
                </button>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Ausgewähltes Lokales Modell</label>
              {localModels.length > 0 ? (
                <select value={modelName} onChange={(e) => setModelName(e.target.value)} style={inputStyle}>
                  {localModels.map((m) => (<option key={m} value={m}>{m}</option>))}
                </select>
              ) : (
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="z. B. llama3.2 (keine Modelle gefunden? Endpoint prüfen)"
                  style={inputStyle}
                />
              )}
              {localModels.length > 0 && (
                <div style={{ fontSize: '0.75em', color: PRIMARY, marginTop: '4px' }}>
                  ✓ {localModels.length} lokale Modelle erfolgreich erkannt.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={sectionTitle}>🔌 MCP Server (Model Context Protocol)</div>
          <a href="https://modelcontextprotocol.io/clients" target="_blank" rel="noreferrer" style={{ fontSize: '0.8em', color: ACCENT, textDecoration: 'none' }}>
            Server Verzeichnis ↗
          </a>
        </div>
        <textarea
          value={mcpConfig}
          onChange={(e) => setMcpConfig(e.target.value)}
          placeholder={'{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]\n    }\n  }\n}'}
          rows={4}
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.85em', resize: 'vertical' }}
        />
      </div>

      <button
        onClick={handleSave}
        style={{
          width: '100%',
          padding: '10px',
          background: PRIMARY,
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '0.9em',
          textTransform: 'uppercase',
          letterSpacing: '0.03em'
        }}
      >
        {saved ? '✓ Gespeichert' : 'Speichern'}
      </button>
    </div>
  );
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '14px',
  padding: '12px 14px',
  background: 'var(--vscode-editor-background)',
  border: '1px solid var(--vscode-panel-border)',
  borderRadius: '6px'
};

const sectionTitle: React.CSSProperties = {
  fontSize: '0.95em',
  fontWeight: 'bold',
  marginBottom: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontSize: '0.82em',
  fontWeight: '600',
  color: 'var(--vscode-descriptionForeground)'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: 'var(--vscode-input-background)',
  color: 'var(--vscode-input-foreground)',
  border: '1px solid var(--vscode-input-border)',
  borderRadius: '4px',
  fontSize: '0.9em',
  boxSizing: 'border-box'
};