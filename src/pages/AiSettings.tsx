import React, { useState, useEffect } from 'react';

declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

export interface AiConfig {
  provider: 'gemini' | 'ollama' | 'custom';
  geminiApiKey: string;
  baseUrl: string;
  modelName: string;
  localApiKey?: string;
  userName?: string;
}

export const AiSettings: React.FC = () => {
  const [provider, setProvider] = useState<'gemini' | 'ollama' | 'custom'>('gemini');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434/v1');
  const [modelName, setModelName] = useState('llama3.2');
  const [localApiKey, setLocalApiKey] = useState('');
  const [userName, setUserName] = useState('');
  const [saved, setSaved] = useState(false);

  // Höre auf Nachrichten vom Extension-Host für den Benutzernamen & gespeicherte Settings
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'LOAD_AI_SETTINGS') {
        const payload: AiConfig = message.payload;
        if (payload.provider) setProvider(payload.provider);
        if (payload.geminiApiKey) setGeminiApiKey(payload.geminiApiKey);
        if (payload.baseUrl) setBaseUrl(payload.baseUrl);
        if (payload.modelName) setModelName(payload.modelName);
        if (payload.localApiKey) setLocalApiKey(payload.localApiKey);
        if (payload.userName) setUserName(payload.userName);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSave = () => {
    const config: AiConfig = {
      provider,
      geminiApiKey,
      baseUrl,
      modelName,
      localApiKey,
      userName
    };

    if (typeof acquireVsCodeApi !== 'undefined') {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({
        type: 'SAVE_AI_SETTINGS',
        payload: config
      });
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: '24px', color: 'var(--vscode-foreground)', fontFamily: 'var(--vscode-font-family)', maxWidth: '650px' }}>
      <h2 style={{ marginTop: 0, marginBottom: '8px' }}>🤖 AI Engine & Provider Einstellungen</h2>
      <p style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '0.9em', marginBottom: '24px' }}>
        Konfiguriere hier die KI-Anbindung. Du kannst zwischen Google Gemini Flash und lokalen Modellen (z. B. via Ollama oder LM Studio) wechseln.
      </p>

      {/* BENUTZERNAME */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Entwickler-Name (Greeting)</label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="z. B. Peter (wird sonst automatisch aus OS/VS Code ermittelt)"
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border)',
            borderRadius: '4px'
          }}
        />
      </div>

      {/* PROVIDER SELECT */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>AI Engine Provider</label>
        <select 
          value={provider} 
          onChange={(e) => setProvider(e.target.value as any)}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--vscode-dropdown-background)',
            color: 'var(--vscode-dropdown-foreground)',
            border: '1px solid var(--vscode-dropdown-border)',
            borderRadius: '4px'
          }}
        >
          <option value="gemini">Google Gemini Flash (Cloud — Unchained)</option>
          <option value="ollama">Local AI (Ollama - Native / Docker)</option>
          <option value="custom">Local AI (LM Studio / OpenAI Compatible API)</option>
        </select>
      </div>

      {/* CLOUD VS LOCAL CONFIG */}
      {provider === 'gemini' ? (
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Gemini API Key</label>
          <input
            type="password"
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder="AIzaSy..."
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)',
              borderRadius: '4px'
            }}
          />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Local Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={provider === 'ollama' ? 'http://localhost:11434/v1' : 'http://localhost:1234/v1'}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Model Name</label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="z. B. llama3.2, qwen2.5-coder, codellama"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Local Auth Key (Optional)</label>
            <input
              type="password"
              value={localApiKey}
              onChange={(e) => setLocalApiKey(e.target.value)}
              placeholder="Falls lokaler Server einen Token verlangt"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px'
              }}
            />
          </div>
        </>
      )}

      {/* SAVE BUTTON */}
      <button
        onClick={handleSave}
        style={{
          padding: '10px 20px',
          background: 'var(--vscode-button-background)',
          color: 'var(--vscode-button-foreground)',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        {saved ? '✓ Einstellungen gespeichert' : 'AI-Konfiguration speichern'}
      </button>
    </div>
  );
};