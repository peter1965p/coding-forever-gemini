export function getSettingsHtml(apiKey: string, bypass: boolean, autoAccept: boolean, chatFont: string): string {
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
                --accent-orange: #f59e0b;
                --text-main: #f9fafb;
                --text-muted: #9ca3af;
            }
            body {
                font-family: ${chatFont}, sans-serif;
                background-color: var(--bg-main);
                color: var(--text-main);
                margin: 0;
                padding: 24px;
                box-sizing: border-box;
                height: 100vh;
                overflow-y: auto;
            }
            .header-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                border-bottom: 1px solid var(--border-color);
                padding-bottom: 16px;
            }
            .app-title {
                font-size: 20px;
                font-weight: bold;
                display: flex;
                align-items: center;
                gap: 10px;
                color: var(--text-main);
            }
            .app-title span { color: var(--accent-orange); }
            
            .panel {
                background-color: var(--bg-card);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 24px;
                max-width: 600px;
                box-sizing: border-box;
            }
            .panel-title {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 20px;
            }
            .form-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                font-size: 11px;
                color: var(--text-muted);
                margin-bottom: 8px;
                text-transform: uppercase;
            }
            input[type="text"], select {
                width: 100%;
                background: #1f2937;
                border: 1px solid #374151;
                color: #fff;
                padding: 10px;
                border-radius: 6px;
                font-size: 12px;
                box-sizing: border-box;
                font-family: inherit;
            }
            input[type="text"]:focus, select:focus {
                outline: none;
                border-color: var(--accent-cyan);
            }
            button {
                background: var(--accent-cyan);
                color: var(--bg-main);
                border: none;
                padding: 10px 20px;
                font-weight: bold;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
            }
            button:hover { opacity: 0.9; }
        </style>
    </head>
    <body>
        <div class="header-bar">
            <div class="app-title"><span>⚡</span> Coding Forever — Einstellungen</div>
        </div>

        <div class="panel">
            <div class="panel-title">Extension Konfiguration</div>
            
            <div class="form-group">
                <label for="apiKeyInput">Gemini API Key</label>
                <input type="text" id="apiKeyInput" value="${apiKey}" placeholder="Dein API-Schlüssel...">
            </div>

            <div class="form-group">
                <label for="fontSelect">UI Font-Familie</label>
                <select id="fontSelect">
                    <option value="var(--vscode-font-family)" ${chatFont === 'var(--vscode-font-family)' ? 'selected' : ''}>Standard VS Code Font</option>
                    <option value="Arial" ${chatFont === 'Arial' ? 'selected' : ''}>Arial</option>
                    <option value="Courier New" ${chatFont === 'Courier New' ? 'selected' : ''}>Courier New</option>
                    <option value="Segoe UI" ${chatFont === 'Segoe UI' ? 'selected' : ''}>Segoe UI</option>
                </select>
            </div>

            <button id="saveBtn">Einstellungen speichern</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            
            document.getElementById('saveBtn').addEventListener('click', () => {
                const apikey = document.getElementById('apiKeyInput').value.trim();
                const chatFont = document.getElementById('fontSelect').value;
                vscode.postMessage({ type: 'saveSettings', apikey, chatFont });
            });
        </script>
    </body>
    </html>`;
}