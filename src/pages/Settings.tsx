import React, { useState } from 'react';

declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

interface SettingsProps {
  initialApiKey?: string;
  initialChatFont?: string;
}

export const Settings: React.FC<SettingsProps> = ({
  initialApiKey = '',
  initialChatFont = 'var(--vscode-font-family)'
}) => {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [showPassword, setShowPassword] = useState(false);
  const [chatFont, setChatFont] = useState(initialChatFont);

  const handleSave = () => {
    if (typeof acquireVsCodeApi !== 'undefined') {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({
        type: 'saveSettings',
        apikey: apiKey.trim(),
        chatFont: chatFont
      });
    }
  };

  return (
    <div style={{
      backgroundColor: '#0b0f19',
      color: '#f9fafb',
      margin: 0,
      padding: '24px',
      boxSizing: 'border-box',
      minHeight: '100vh',
      fontFamily: 'var(--vscode-font-family, sans-serif)'
    }}>
      <style>{`
        .settings-input:focus, .settings-select:focus {
          outline: none;
          border-color: #06b6d4 !important;
        }
        .save-btn:hover {
          opacity: 0.9;
        }
        .toggle-eye:hover {
          color: #f9fafb !important;
        }
      `}</style>

      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        background: '#111827',
        border: '1px solid #1f2937',
        borderRadius: '8px',
        padding: '24px'
      }}>
        <h1 style={{ fontSize: '18px', marginTop: 0, color: '#f9fafb' }}>
          ⚡ Coding Forever — Einstellungen
        </h1>

        {/* Gemini API Key Group */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            textTransform: 'uppercase',
            color: '#9ca3af',
            marginBottom: '6px',
            letterSpacing: '0.05em'
          }}>
            Gemini API Key
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              className="settings-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Deinen API Key hier einfügen..."
              style={{
                width: '100%',
                background: '#0b0f19',
                border: '1px solid #1f2937',
                color: '#fff',
                padding: '8px 36px 8px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                boxSizing: 'border-box'
              }}
            />
            <button
              type="button"
              className="toggle-eye"
              onClick={() => setShowPassword(!showPassword)}
              title="Key anzeigen/verbergen"
              style={{
                position: 'absolute',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px 4px'
              }}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {/* UI Font-Familie Group */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            textTransform: 'uppercase',
            color: '#9ca3af',
            marginBottom: '6px',
            letterSpacing: '0.05em'
          }}>
            UI Font-Familie
          </label>
          <select
            className="settings-select"
            value={chatFont}
            onChange={(e) => setChatFont(e.target.value)}
            style={{
              width: '100%',
              background: '#0b0f19',
              border: '1px solid #1f2937',
              color: '#fff',
              padding: '8px',
              borderRadius: '6px',
              fontSize: '12px'
            }}
          >
            <option value="var(--vscode-font-family)">VS Code Standard</option>
            <option value="Arial">Arial</option>
            <option value="Consolas">Consolas (Monospace)</option>
            <option value="JetBrains Mono">JetBrains Mono</option>
          </select>
        </div>

        {/* Save Button */}
        <button
          type="button"
          className="save-btn"
          onClick={handleSave}
          style={{
            background: '#06b6d4',
            color: '#0b0f19',
            border: 'none',
            padding: '8px 16px',
            fontWeight: 'bold',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Einstellungen speichern
        </button>
      </div>
    </div>
  );
};