import * as vscode from 'vscode';

export function getChatHtml(context: vscode.ExtensionContext, extName: string = 'Coding Forever', extVersion: string = '1.0.0'): string {
    return `<!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <title>${extName} — Chat & Verlauf</title>
        <style>
            :root {
                --bg-sidebar: #0f172a;
                --bg-main: #0b0f19;
                --bg-card: #111827;
                --border-color: #1f2937;
                --accent-cyan: #06b6d4;
                --accent-orange: #f59e0b;
                --text-main: #f9fafb;
                --text-muted: #9ca3af;
                --hover-bg: #1e293b;
            }
            body {
                font-family: var(--vscode-font-family, sans-serif);
                background-color: var(--bg-main);
                color: var(--text-main);
                margin: 0;
                padding: 0;
                display: flex;
                height: 100vh;
                overflow: hidden;
                box-sizing: border-box;
            }

            /* Linke Sidebar (Flexibel & Einklappbar) */
            .sidebar {
                width: 200px;
                min-width: 130px;
                max-width: 260px;
                background-color: var(--bg-sidebar);
                border-right: 1px solid var(--border-color);
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: 10px;
                box-sizing: border-box;
                transition: all 0.2s ease-in-out;
            }
            .sidebar.collapsed {
                display: none;
            }

            .sidebar-top {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .nav-btn {
                background: transparent;
                border: none;
                color: var(--text-main);
                padding: 6px 8px;
                text-align: left;
                font-size: 11px;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .nav-btn:hover {
                background-color: var(--hover-bg);
            }
            .nav-btn.primary {
                background-color: #1e293b;
                color: var(--accent-cyan);
                font-weight: bold;
                border: 1px solid var(--border-color);
            }
            
            .history-section {
                margin-top: 12px;
                overflow-y: auto;
                max-height: calc(100vh - 180px);
            }
            .history-title {
                font-size: 9px;
                text-transform: uppercase;
                color: var(--text-muted);
                letter-spacing: 0.05em;
                margin-bottom: 6px;
                padding-left: 4px;
            }
            .history-item {
                font-size: 11px;
                color: var(--text-muted);
                padding: 5px 8px;
                border-radius: 4px;
                cursor: pointer;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .history-item:hover {
                background-color: var(--hover-bg);
                color: var(--text-main);
            }

            /* Hauptbereich (Chat) */
            .main-chat {
                flex: 1;
                display: flex;
                flex-direction: column;
                background-color: var(--bg-main);
                height: 100vh;
                box-sizing: border-box;
                min-width: 0;
            }
            .chat-header {
                padding: 10px 14px;
                border-bottom: 1px solid var(--border-color);
                font-size: 12px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background-color: var(--bg-card);
            }
            .toggle-sidebar-btn {
                background: transparent;
                border: 1px solid var(--border-color);
                color: var(--text-muted);
                border-radius: 4px;
                cursor: pointer;
                padding: 2px 6px;
                font-size: 11px;
            }
            .toggle-sidebar-btn:hover {
                color: var(--text-main);
                background-color: var(--hover-bg);
            }

            .chat-messages {
                flex: 1;
                padding: 14px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .message {
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 12px;
                max-width: 90%;
                line-height: 1.4;
                word-break: break-word;
            }
            .message.user {
                background-color: #1e293b;
                align-self: flex-end;
                border: 1px solid var(--border-color);
            }
            .message.assistant {
                background-color: var(--bg-card);
                align-self: flex-start;
                border: 1px solid var(--border-color);
            }

            /* Eingabebereich unten */
            .chat-input-area {
                padding: 10px 14px;
                background-color: var(--bg-card);
                border-top: 1px solid var(--border-color);
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            textarea {
                width: 100%;
                background: #0b0f19;
                border: 1px solid var(--border-color);
                color: #fff;
                padding: 8px;
                border-radius: 6px;
                font-size: 12px;
                resize: none;
                height: 48px;
                box-sizing: border-box;
                font-family: inherit;
            }
            textarea:focus {
                outline: none;
                border-color: var(--accent-cyan);
            }
            .chat-controls {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
            }
            select {
                background: #0b0f19;
                border: 1px solid var(--border-color);
                color: var(--text-main);
                padding: 4px 6px;
                border-radius: 4px;
                font-size: 11px;
            }
            button.send-btn {
                background: var(--accent-cyan);
                color: var(--bg-main);
                border: none;
                padding: 6px 14px;
                font-weight: bold;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
            }
            button.send-btn:hover { opacity: 0.9; }
        </style>
    </head>
    <body>
        <!-- Linke Sidebar -->
        <div class="sidebar" id="sidebar">
            <div class="sidebar-top">
                <button class="nav-btn primary" id="newChatBtn">
                    <span>✏️</span> Neuer Chat
                </button>
                <button class="nav-btn" id="openDashBtn">
                    <span>📊</span> Dashboard
                </button>
                <button class="nav-btn" id="openSettingsBtn">
                    <span>⚙️</span> Einstellungen
                </button>

                <div class="history-section">
                    <div class="history-title">Verlauf</div>
                    <div id="historyList">
                        <div class="history-item">Extension initialisiert</div>
                        <div class="history-item">Refactoring dash.ts</div>
                        <div class="history-item">GitHub Update prüfen</div>
                    </div>
                </div>
            </div>

            <div style="font-size: 10px; color: var(--text-muted); text-align: center; padding-top: 6px; border-top: 1px solid var(--border-color);">
                ${extName} v${extVersion}
            </div>
        </div>

        <!-- Rechter Haupt-Chat-Bereich -->
        <div class="main-chat">
            <div class="chat-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="toggle-sidebar-btn" id="toggleSidebarBtn" title="Sidebar umschalten">☰</button>
                    <span>Agentic Chat</span>
                </div>
                <span style="font-size: 11px; color: var(--accent-orange);">Bypass [ON]</span>
            </div>

            <div class="chat-messages" id="chatMessages">
                <div class="message assistant">Moin Peter! Coding Forever ist bereit. Wie kann ich dir heute helfen? 🚀</div>
            </div>

            <div class="chat-input-area">
                <textarea id="promptInput" placeholder="Was soll gebaut werden? (Ctrl+Enter)..."></textarea>
                <div class="chat-controls">
                    <select id="modelSelect">
                        <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                        <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                        <option value="gemini-3.5-flash-lite" selected>gemini-3.5-flash-lite</option>
                    </select>
                    <button class="send-btn" id="sendBtn">Senden</button>
                </div>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();

            const promptInput = document.getElementById('promptInput');
            const sendBtn = document.getElementById('sendBtn');
            const chatMessages = document.getElementById('chatMessages');
            const modelSelect = document.getElementById('modelSelect');
            const sidebar = document.getElementById('sidebar');
            const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');

            toggleSidebarBtn.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
            });

            document.getElementById('newChatBtn').addEventListener('click', () => {
                chatMessages.innerHTML = '<div class="message assistant">Neuer Chat gestartet. Was gibt es zu tun?</div>';
            });
            document.getElementById('openDashBtn').addEventListener('click', () => {
                vscode.postMessage({ type: 'openDashboard' });
            });
            document.getElementById('openSettingsBtn').addEventListener('click', () => {
                vscode.postMessage({ type: 'openSettings' });
            });

            function sendMessage() {
                const text = promptInput.value.trim();
                if (!text) return;

                const userDiv = document.createElement('div');
                userDiv.className = 'message user';
                userDiv.innerText = text;
                chatMessages.appendChild(userDiv);
                promptInput.value = '';
                chatMessages.scrollTop = chatMessages.scrollHeight;

                vscode.postMessage({
                    type: 'runChat',
                    prompt: text,
                    model: modelSelect.value,
                    bypass: true,
                    autoAccept: true
                });
            }

            sendBtn.addEventListener('click', sendMessage);
            promptInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'response' || message.text) {
                    const botDiv = document.createElement('div');
                    botDiv.className = 'message assistant';
                    botDiv.innerText = message.text || message.content;
                    chatMessages.appendChild(botDiv);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            });
        </script>
    </body>
    </html>`;
}