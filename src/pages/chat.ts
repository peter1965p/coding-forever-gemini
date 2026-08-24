export function getChatHtml(apiKey: string, bypass: boolean, auto: boolean): string {
    return `<!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <style>
            :root {
                --bg-main: #0b0f19;
                --bg-card: #111827;
                --border-color: #1f2937;
                --text-main: #f9fafb;
                --text-muted: #9ca3af;
                --accent-teal: #06b6d4;
                --accent-green: #10b981;
                --accent-orange: #f59e0b;
                --input-bg: #1f2937;
                --bubble-user: #1f2937;
                --bubble-ai: #0f172a;
            }

            *, *::before, *::after {
                box-sizing: border-box;
            }

            body {
                font-family: var(--vscode-font-family);
                margin: 0;
                padding: 0;
                background-color: var(--bg-main);
                color: var(--text-main);
                display: flex;
                flex-direction: column;
                height: 100vh;
                font-size: 12px;
                overflow: hidden;
            }

            .header-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                border-bottom: 1px solid var(--border-color);
                background-color: var(--bg-card);
                font-weight: 600;
            }

            .chat-container {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .message {
                max-width: 95%;
                padding: 8px 10px;
                border-radius: 6px;
                line-height: 1.4;
                border: 1px solid var(--border-color);
                word-break: break-word;
            }

            .message.user {
                background-color: var(--bubble-user);
                align-self: flex-end;
                border-color: rgba(6, 182, 212, 0.3);
                white-space: pre-wrap;
            }

            .message.ai {
                background-color: var(--bubble-ai);
                align-self: flex-start;
            }

            .input-container {
                padding: 10px;
                background-color: var(--bg-card);
                border-top: 1px solid var(--border-color);
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .controls-row {
                display: flex;
                gap: 6px;
            }

            select, textarea {
                background-color: var(--input-bg);
                border: 1px solid var(--border-color);
                color: var(--text-main);
                padding: 6px 8px;
                border-radius: 4px;
                font-family: inherit;
                font-size: 11px;
            }

            select {
                flex: 1;
            }

            textarea {
                width: 100%;
                height: 55px;
                resize: none;
            }

            textarea:focus, select:focus {
                outline: none;
                border-color: var(--accent-teal);
            }

            .btn {
                background-color: var(--accent-teal);
                color: #0b0f19;
                border: none;
                padding: 6px 14px;
                font-weight: 600;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                white-space: nowrap;
            }

            .btn:hover { opacity: 0.9; }

            .badges {
                font-size: 10px;
                color: var(--text-muted);
                display: flex;
                justify-content: space-between;
                padding: 0 2px;
            }
        </style>
    </head>
    <body>

        <div class="header-bar">
            <span>💬 Coding Forever Chat</span>
            <span style="font-size: 10px; color: ${apiKey ? 'var(--accent-green)' : 'var(--accent-orange)'};">${apiKey ? '● Active' : '○ No Key'}</span>
        </div>

        <div class="chat-container" id="chatHistory">
            <div class="message ai">Moin! Bereit für automatische Dateisuche & Code-Erstellung im Bypass-Modus.</div>
        </div>

        <div class="input-container">
            <div class="badges">
                <span>Bypass: <strong style="color: ${bypass ? 'var(--accent-green)' : 'var(--text-muted)'};">${bypass ? 'ON' : 'OFF'}</strong></span>
                <span>Auto: <strong style="color: ${auto ? 'var(--accent-green)' : 'var(--text-muted)'};">${auto ? 'ON' : 'OFF'}</strong></span>
            </div>
            <div class="controls-row">
                <select id="cModel">
                    <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                    <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                    <option value="gemini-3.5-flash-lite" selected>gemini-3.5-flash-lite</option>
                </select>
                <button class="btn" id="sendBtn">Senden</button>
            </div>
            <textarea id="cInput" placeholder="Describe what to build or fix..."></textarea>
        </div>

        <script>
            const vscode = acquireVsCodeApi();

            const sendBtn = document.getElementById('sendBtn');
            const cInput = document.getElementById('cInput');
            const cModel = document.getElementById('cModel');
            const history = document.getElementById('chatHistory');

            function sendChat() {
                if (!cInput || !cModel) return;
                const text = cInput.value.trim();
                const model = cModel.value;
                if (!text) return;

                appendMessage(text, 'user');
                cInput.value = '';

                vscode.postMessage({ type: 'runChat', prompt: text, model: model });
            }

            sendBtn.addEventListener('click', () => {
                sendChat();
            });

            cInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendChat();
                }
            });

            function appendMessage(text, sender) {
                if (!history) return;
                const div = document.createElement('div');
                div.className = 'message ' + sender;
                div.innerText = text;
                history.appendChild(div);
                history.scrollTop = history.scrollHeight;
            }

            window.addEventListener('message', e => {
                const message = e.data;
                if (message && message.type === 'response') {
                    appendMessage(message.text, 'ai');
                }
            });
        </script>
    </body>
    </html>`;
}