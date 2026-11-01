import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AiSettings } from './AiSettings';
import { Chat } from './chat';
import { Dashboard } from './Dashboard';
import { PromptManager } from './PromptManager';
import { Help } from './Help';
import { Settings } from './Settings';
import { bootstrap } from '../lib/vscodeApi';
import { THEME_CSS } from '../lib/theme';

const TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'prompts', label: 'Prompt Library' },
    { id: 'ai-settings', label: 'AI Engine' },
    { id: 'settings', label: 'Einstellungen' },
    { id: 'help', label: 'Hilfe' }
];

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState(bootstrap.route);

    // Die Extension kann die Ansicht wechseln (z.B. über einen Header-Button).
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'navigate' && event.data.route) {
                setActiveTab(event.data.route);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    if (activeTab === 'chat') {
        return <Chat extName="Coding Forever" userName={bootstrap.settings.userName || bootstrap.osUser} />;
    }

    return (
        <div className="cf-root cf-shell">
            <style>{THEME_CSS}{SHELL_CSS}</style>

            <nav className="cf-nav">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`cf-nav-btn${activeTab === tab.id ? ' active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
                <span className="cf-nav-version">v{bootstrap.extVersion}</span>
            </nav>

            <main className="cf-main">
                {activeTab === 'dashboard' && <Dashboard />}
                {activeTab === 'prompts' && <PromptManager />}
                {activeTab === 'ai-settings' && <AiSettings />}
                {activeTab === 'settings' && <Settings />}
                {activeTab === 'help' && <Help />}
            </main>
        </div>
    );
};

const SHELL_CSS = `
.cf-shell {
    display: flex; flex-direction: column; height: 100vh; box-sizing: border-box;
    background: var(--cf-bg); color: var(--cf-fg);
    font-family: var(--vscode-font-family, sans-serif);
}
.cf-nav {
    display: flex; align-items: center; gap: 6px; padding: 8px 14px; flex-shrink: 0;
    background: var(--cf-bg-elev); border-bottom: 1px solid var(--cf-border);
}
.cf-nav-btn {
    background: transparent; color: var(--cf-fg); border: 1px solid transparent;
    padding: 5px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;
    transition: background .15s;
}
.cf-nav-btn:hover { background: var(--cf-bg-hover); }
.cf-nav-btn.active { background: var(--cf-accent); color: #fff; font-weight: 600; }
.cf-nav-version { margin-left: auto; font-size: 10px; color: var(--cf-fg-muted); }
.cf-main { flex: 1; overflow-y: auto; }
`;

const container = document.getElementById('root');
if (container) {
    ReactDOM.createRoot(container).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
