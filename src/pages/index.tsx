import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AiSettings } from './AiSettings';
import { PromptManager } from './PromptManager';
import { Dashboard } from './Dashboard';
import { Settings } from './Settings';
import { Chat } from './chat';

const App = () => {
  const initialRoute = (window as any).INITIAL_ROUTE || 'dashboard';
  const [activeTab, setActiveTab] = useState(initialRoute);
  const extName = (window as any).EXT_NAME;
  const extVersion = (window as any).EXT_VERSION;
  const userName = (window as any).VSCODE_USER_NAME;

  // Wenn wir im Chat sind, zeigen wir die Leiste nicht
  if (activeTab === 'chat') {
    return <Chat extName={extName} extVersion={extVersion} userName={userName} />;
  }

  return (
    <div className="app-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', background: 'var(--vscode-editor-background)' }}>
      
      {/* Die Menüleiste oben im Dashboard-Fenster */}
      <nav style={{ 
        display: 'flex', 
        gap: '6px', 
        padding: '8px 16px', 
        background: 'var(--vscode-sideBar-background, var(--vscode-editor-background))', 
        borderBottom: '1px solid var(--vscode-panel-border)',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <button 
          style={getButtonStyle(activeTab === 'dashboard')} 
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button 
          style={getButtonStyle(activeTab === 'prompts')} 
          onClick={() => setActiveTab('prompts')}
        >
          Prompt Library
        </button>
        <button 
          style={getButtonStyle(activeTab === 'ai-settings')} 
          onClick={() => setActiveTab('ai-settings')}
        >
          AI Engine
        </button>
        <button 
          style={getButtonStyle(activeTab === 'settings')} 
          onClick={() => setActiveTab('settings')}
        >
          Einstellungen
        </button>
      </nav>

      {/* Inhalt des jeweiligen Unterfensters */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {activeTab === 'ai-settings' && <AiSettings />}
        {activeTab === 'prompts' && <PromptManager />}
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  );
};

// Button-Design mit festem #ff6200 für den aktiven Zustand
const getButtonStyle = (isActive: boolean) => ({
  background: isActive ? '#ff6200' : 'transparent',
  color: isActive ? '#ffffff' : 'var(--vscode-foreground)',
  border: isActive ? 'none' : '1px solid transparent',
  padding: '5px 12px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.85em',
  fontWeight: isActive ? '600' : 'normal',
  transition: 'background 0.2s'
});

// Automatisches Mounten in das von der Extension bereitgestellte Root-Element
const container = document.getElementById('root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}