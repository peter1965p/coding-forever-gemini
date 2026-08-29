import React, { useState } from 'react';
import { vscode } from '../lib/vscodeApi';

interface SettingsProps {
  initialApiKey?: string;
  initialChatFont?: string;
}

const ACCENT = '#f97316';
const PRIMARY = '#16a34a';

export const Settings: React.FC<SettingsProps> = ({
  initialApiKey = '',
  initialChatFont = 'var(--vscode-font-family)'
}) => {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [showPassword, setShowPassword] = useState(false);
  const [chatFont, setChatFont] = useState(initialChatFont);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    vscode.postMessage({
      type: 'saveSettings',
      apikey: apiKey.trim(),
      chatFont: chatFont
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{
      color: 'var(--vscode-foreground)',
      padding: '16px 20px',
      boxSizing: 'border-box',
      fontFamily: 'var(--vscode-font-family, sans-serif)',
      maxWidth: '520px',
      margin: '0 auto'
    }}>
      <style>{`
        .settings-input:focus, .settings-select:focus {
          outline: none;
          border-color: ${ACCENT} !important;
        }
        .save-btn:hover { opacity: 0.9; }
        .toggle-eye:hover { color: var(--vscode-foreground) !important; }
      `}</style>

      <h2 style={{
      position: 'relative',
      backgroundImage: 'linear-gradient(to bottom, #fed7aa, #f97316, #431407)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      filter: 'drop-shadow(0 0 70px rgba(234, 88, 12, 0.5))',
      textTransform: 'uppercase',
      transition: 'all 1s ease'
    }}>
        Einstellungen
      </h2>

      <div style={sectionStyle}>
        <label style={labelStyle}>Gemini API Key</label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            className="settings-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Deinen API Key hier einfügen..."
            style={{ ...inputStyle, paddingRight: '36px' }}
          />
          <button
            type="button"
            className="toggle-eye"
            onClick={() => setShowPassword(!showPassword)}
            title="Key anzeigen/verbergen"
            style={{
              position: 'absolute', right: '8px', background: 'transparent', border: 'none',
              color: 'var(--vscode-descriptionForeground)', cursor: 'pointer', fontSize: '14px', padding: '2px 4px'
            }}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>UI Font-Familie</label>
        <select
          className="settings-select"
          value={chatFont}
          onChange={(e) => setChatFont(e.target.value)}
          style={inputStyle}
        >
          <option value="var(--vscode-font-family)">VS Code Standard</option>
          <option value="Arial">Arial</option>
          <option value="Consolas">Consolas (Monospace)</option>
          <option value="JetBrains Mono">JetBrains Mono</option>
        </select>
      </div>

      <button
        type="button"
        className="save-btn"
        onClick={handleSave}
        style={{
          width: '100%',
          background: PRIMARY,
          color: '#fff',
          border: 'none',
          padding: '10px',
          fontWeight: 'bold',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.9em',
          textTransform: 'uppercase',
          letterSpacing: '0.03em'
        }}
      >
        {saved ? '✓ Gespeichert' : 'Einstellungen speichern'}
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '0.82em',
  fontWeight: 600,
  color: 'var(--vscode-descriptionForeground)'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--vscode-input-background)',
  border: '1px solid var(--vscode-input-border)',
  color: 'var(--vscode-input-foreground)',
  padding: '8px 10px',
  borderRadius: '4px',
  fontSize: '0.9em',
  boxSizing: 'border-box'
};