import * as vscode from 'vscode';

export function getSettingsHtml(apiKey: string = '', isFirstRun: boolean = false, isUpgrade: boolean = false, chatFont: string = 'var(--vscode-font-family)'): string {
    return `<!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <title>Coding Forever — Einstellungen</title>
        <style>
            :root {
                --bg-main: #0b0f19;
                --bg-card: #111827;
                --border-color: #1f2937;
                --accent-cyan: #06b6d4;
                --text-main: #f9fafb;
                --text-muted: #9ca3af;
                --hover-bg: #1e293b;
            }
            body {
                font-family: var(--vscode-font-family, sans-serif);
                background-color: var(--bg-main);
                color: var(--text-main);
                margin: 0;
                padding: 24px;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background: var(--bg-card);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 24px;
            }
            h1 { font-size: 18px; margin-top: 0; color: var(--text-main); }
            .form-group { margin-bottom: 20px; }
            label { display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; letter-spacing: 0.05em; }
            
            /* Password-Input mit Auge Wrapper */
            .input-wrapper {
                position: relative;
                display: flex;
                align-items: center;
            }
            input[type="password"], input[type="text"] {
                width: 100%;
                background: #0b0f19;
                border: 1px solid var(--border-color);
                color: #fff;
                padding: 8px 36px 8px 10px;
                border-radius: 6px;
                font-size: 12px;
                box-sizing: border-box;
            }
            input:focus { outline: none; border-color: var(--accent-cyan); }
            
            .toggle-eye {
                position: absolute;
                right: 8px;
                background: transparent;
                border: none;
                color: var(--text-muted);
                cursor: pointer;
                font-size: 14px;
                padding: 2px 4px;
            }
            .toggle-eye:hover { color: var(--text-main); }

            select {
                width: 100%;
                background: #0b0f19;
                border: 1px solid var(--border-color);
                color: #fff;
                padding: 8px;
                border-radius: 6px;
                font-size: 12px;
            }

            button.save-btn {
                background: var(--accent-cyan);
                color: var(--bg-main);
                border: none;
                padding: 8px 16px;
                font-weight: bold;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
            }
            button.save-btn:hover { opacity: 0.9; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>⚡ Coding Forever — Einstellungen</h1>
            
            <div class="form-group">
                <label>Gemini API Key</label>
                <div class="input-wrapper">
                    <input type="password" id="apiKeyInput" value="${apiKey}" placeholder="Deinen API Key hier einfügen...">
                    <button class="toggle-eye" id="toggleEyeBtn" title="Key anzeigen/verbergen">👁️</button>
                </div>
            </div>

            <div class="form-group">
                <label>UI Font-Familie</label>
                <select id="fontSelect">
                    <option value="var(--vscode-font-family)" ${chatFont.includes('vscode') ? 'selected' : ''}>VS Code Standard</option>
                    <option value="Arial" ${chatFont === 'Arial' ? 'selected' : ''}>Arial</option>
                    <option value="Consolas" ${chatFont === 'Consolas' ? 'selected' : ''}>Consolas (Monospace)</option>
                    <option value="JetBrains Mono" ${chatFont === 'JetBrains Mono' ? 'selected' : ''}>JetBrains Mono</option>
                </select>
            </div>

            <button class="save-btn" id="saveBtn">Einstellungen speichern</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const apiKeyInput = document.getElementById('apiKeyInput');
            const toggleEyeBtn = document.getElementById('toggleEyeBtn');
            const fontSelect = document.getElementById('fontSelect');
            const saveBtn = document.getElementById('saveBtn');

            // Auge-Button Logik
            toggleEyeBtn.addEventListener('click', () => {
                if (apiKeyInput.type === 'password') {
                    apiKeyInput.type = 'text';
                    toggleEyeBtn.innerText = '🙈';
                } else {
                    apiKeyInput.type = 'password';
                    toggleEyeBtn.innerText = '👁️';
                }
            });

            saveBtn.addEventListener('click', () => {
                vscode.postMessage({
                    type: 'saveSettings',
                    apikey: apiKeyInput.value.trim(),
                    chatFont: fontSelect.value
                });
            });
        </script>
    </body>
    </html>`;
}