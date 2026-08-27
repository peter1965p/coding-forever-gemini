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

  return (
    <div className="app-container">
      <nav style={{ display: 'flex', gap: '10px', padding: '10px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <button onClick={() => setActiveTab('chat')}>Chat</button>
        <button onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        <button onClick={() => setActiveTab('prompts')}>Prompt Library</button>
        <button onClick={() => setActiveTab('ai-settings')}>AI Engine</button>
        <button onClick={() => setActiveTab('settings')}>Einstellungen</button>
      </nav>
      <main style={{ padding: activeTab === 'chat' ? 0 : '10px' }}>
        {activeTab === 'chat' && <Chat extName={extName} extVersion={extVersion} userName={userName} />}
        {activeTab === 'ai-settings' && <AiSettings />}
        {activeTab === 'prompts' && <PromptManager />}
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  );
};

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