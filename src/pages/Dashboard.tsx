import React, { useState, useEffect } from 'react';

declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

export const Dashboard: React.FC = () => {
  const [selectedModel, setSelectedModel] = useState('gemini-3.5-flash-lite');
  const [promptText, setPromptText] = useState('');
  const [responseText, setResponseText] = useState('Bereit für Anfragen...');

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'response') {
        setResponseText(message.text);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSend = () => {
    setResponseText(`Sende Anfrage an ${selectedModel}...`);

    if (typeof acquireVsCodeApi !== 'undefined') {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({
        type: 'runChat',
        prompt: promptText,
        model: selectedModel,
        bypass: true,
        autoAccept: true
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
      overflowY: 'auto'
    }}>
      {/* CSS CSS-in-JS Style Injection für spezifische Hover / Sub-Elemente */}
      <style>{`
        .dash-select:focus, .dash-textarea:focus {
          outline: none;
          border-color: #06b6d4 !important;
        }
        .dash-btn:hover {
          opacity: 0.9;
        }
      `}</style>

      {/* Header Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between', // <- 'space-between' statt 'justifySpace'
        alignItems: 'center',
        marginBottom: '24px',
        borderBottom: '1px solid #1f2937',
        paddingBottom: '16px'
      }}>
        <div style={{
          fontSize: '20px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#f9fafb'
        }}>
          <span style={{ color: '#f59e0b' }}>⚡</span> Coding Forever — Dashboard
        </div>
        <div style={{
          background: '#111827',
          border: '1px solid #1f2937',
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '12px',
          color: '#10b981',
          marginLeft: 'auto'
        }}>
          🟢 System Status: Online (Gemini Flash Unchained)
        </div>
      </div>

      {/* 4 Status-Karten */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px', letterSpacing: '0.05em' }}>Modell-Status</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981' }}>Active</div>
          <div style={{ fontSize: '11px', color: '#06b6d4', marginTop: '4px' }}>{selectedModel}</div>
        </div>

        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px', letterSpacing: '0.05em' }}>Bypass-Modus</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f59e0b' }}>ON</div>
          <div style={{ fontSize: '11px', color: '#06b6d4', marginTop: '4px' }}>Sicherheitsfilter deaktiviert</div>
        </div>

        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px', letterSpacing: '0.05em' }}>Auto-Accept</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981' }}>Aktiv</div>
          <div style={{ fontSize: '11px', color: '#06b6d4', marginTop: '4px' }}>Code-Übernahme</div>
        </div>

        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px', letterSpacing: '0.05em' }}>API-Key</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Hinterlegt</div>
          <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>Verbunden</div>
        </div>
      </div>

      {/* Arbeitsbereich: Direkt-Prompt & Live-Antwort */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Direkt-Prompt an Gemini
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>Gemini Modell auswählen</label>
            <select
              className="dash-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                width: '100%',
                background: '#1f2937',
                border: '1px solid #374151',
                color: '#fff',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '12px',
                boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            >
              <option value="gemini-3.7-flash">gemini-3.7-flash</option>
              <option value="gemini-3.6-flash">gemini-3.6-flash</option>
              <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
            </select>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>Prompt / Anforderung eingeben</label>
            <textarea
              className="dash-textarea"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Was möchtest du programmieren oder analysieren?"
              style={{
                width: '100%',
                background: '#1f2937',
                border: '1px solid #374151',
                color: '#fff',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '12px',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                height: '90px',
                resize: 'none'
              }}
            />
          </div>
          <button
            className="dash-btn"
            onClick={handleSend}
            style={{
              background: '#06b6d4',
              color: '#0b0f19',
              border: 'none',
              padding: '10px 16px',
              fontWeight: 'bold',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              width: '100%'
            }}
          >
            Anfrage absenden
          </button>
        </div>

        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Live-Antwort <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 'normal' }}>Output Stream</span>
          </div>
          <div style={{
            background: '#0b0f19',
            border: '1px solid #1f2937',
            borderRadius: '6px',
            padding: '12px',
            fontSize: '12px',
            color: '#9ca3af',
            height: '138px',
            overflowY: 'auto',
            boxSizing: 'border-box'
          }}>
            {responseText}
          </div>
        </div>
      </div>

      {/* Letzte Aktivitäten & Logs */}
      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '20px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Letzte Aktivitäten & Logs
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '8px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', color: '#9ca3af', padding: '8px', borderBottom: '1px solid #1f2937', fontWeight: 'normal', fontSize: '11px', textTransform: 'uppercase' }}>Aktion / Task</th>
              <th style={{ textAlign: 'left', color: '#9ca3af', padding: '8px', borderBottom: '1px solid #1f2937', fontWeight: 'normal', fontSize: '11px', textTransform: 'uppercase' }}>Modell</th>
              <th style={{ textAlign: 'left', color: '#9ca3af', padding: '8px', borderBottom: '1px solid #1f2937', fontWeight: 'normal', fontSize: '11px', textTransform: 'uppercase' }}>Status</th>
              <th style={{ textAlign: 'left', color: '#9ca3af', padding: '8px', borderBottom: '1px solid #1f2937', fontWeight: 'normal', fontSize: '11px', textTransform: 'uppercase' }}>Zeitpunkt</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '10px 8px', borderBottom: '1px solid #1f2937' }}>Extension initialisiert & Dashboard geladen</td>
              <td style={{ padding: '10px 8px', borderBottom: '1px solid #1f2937', color: '#9ca3af' }}>system</td>
              <td style={{ padding: '10px 8px', borderBottom: '1px solid #1f2937' }}>
                <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>Erfolgreich</span>
              </td>
              <td style={{ padding: '10px 8px', borderBottom: '1px solid #1f2937', color: '#9ca3af' }}>Gerade eben</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};