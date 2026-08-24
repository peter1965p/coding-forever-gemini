export function getDashHtml(chatFont: string): string {
    return `<!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <title>Coding Forever — Dashboard</title>
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
            .status-badge {
                background: var(--bg-card);
                border: 1px solid var(--border-color);
                padding: 6px 14px;
                border-radius: 20px;
                font-size: 12px;
                color: #10b981;
            }

            /* 4 KPI Cards */
            .kpi-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 16px;
                margin-bottom: 24px;
            }
            .kpi-card {
                background-color: var(--bg-card);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 16px;
            }
            .kpi-title {
                font-size: 11px;
                text-transform: uppercase;
                color: var(--text-muted);
                margin-bottom: 8px;
                letter-spacing: 0.05em;
            }
            .kpi-value {
                font-size: 20px;
                font-weight: bold;
            }
            .kpi-sub {
                font-size: 11px;
                color: var(--accent-cyan);
                margin-top: 4px;
            }

            /* Main Section: Prompt & Live Response */
            .workspace-grid {
                display: grid;
                grid-template-columns: 2fr 1fr;
                gap: 16px;
                margin-bottom: 24px;
            }
            .panel {
                background-color: var(--bg-card);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 20px;
                box-sizing: border-box;
            }
            .panel-title {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 14px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .panel-title span { font-size: 11px; color: var(--text-muted); font-weight: normal; }
            
            .form-group {
                margin-bottom: 14px;
            }
            label {
                display: block;
                font-size: 11px;
                color: var(--text-muted);
                margin-bottom: 6px;
                text-transform: uppercase;
            }
            select, textarea {
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
            textarea {
                height: 90px;
                resize: none;
            }
            select:focus, textarea:focus {
                outline: none;
                border-color: var(--accent-cyan);
            }
            button {
                background: var(--accent-cyan);
                color: var(--bg-main);
                border: none;
                padding: 10px 16px;
                font-weight: bold;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                width: 100%;
            }
            button:hover { opacity: 0.9; }

            .response-box {
                background: #0b0f19;
                border: 1px solid var(--border-color);
                border-radius: 6px;
                padding: 12px;
                font-size: 12px;
                color: var(--text-muted);
                height: 138px;
                overflow-y: auto;
                box-sizing: border-box;
            }

            /* Logs Table */
            .data-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
                margin-top: 8px;
            }
            .data-table th {
                text-align: left;
                color: var(--text-muted);
                padding: 8px;
                border-bottom: 1px solid var(--border-color);
                font-weight: normal;
                font-size: 11px;
                text-transform: uppercase;
            }
            .data-table td {
                padding: 10px 8px;
                border-bottom: 1px solid var(--border-color);
            }
            .badge-success {
                background: rgba(16, 185, 129, 0.1);
                color: #10b981;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="header-bar">
            <div class="app-title"><span>⚡</span> Coding Forever — Dashboard</div>
            <div class="status-badge">🟢 System Status: Online (Gemini Flash Unchained)</div>
        </div>

        <!-- 4 Status-Karten -->
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-title">Modell-Status</div>
                <div class="kpi-value" style="color: #10b981;">Active</div>
                <div class="kpi-sub" id="activeModelSub">gemini-3.5-flash-lite</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-title">Bypass-Modus</div>
                <div class="kpi-value" style="color: var(--accent-orange);">ON</div>
                <div class="kpi-sub">Sicherheitsfilter deaktiviert</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-title">Auto-Accept</div>
                <div class="kpi-value" style="color: #10b981;">Aktiv</div>
                <div class="kpi-sub">Code-Übernahme</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-title">API-Key</div>
                <div class="kpi-value">Hinterlegt</div>
                <div class="kpi-sub" style="color: #10b981;">Verbunden</div>
            </div>
        </div>

        <!-- Arbeitsbereich: Direkt-Prompt & Live-Antwort -->
        <div class="workspace-grid">
            <div class="panel">
                <div class="panel-title">Direkt-Prompt an Gemini</div>
                <div class="form-group">
                    <label>Gemini Modell auswählen</label>
                    <select id="dashModel">
                        <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                        <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                        <option value="gemini-3.5-flash-lite" selected>gemini-3.5-flash-lite</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Prompt / Anforderung eingeben</label>
                    <textarea id="dashPrompt" placeholder="Was möchtest du programmieren oder analysieren?"></textarea>
                </div>
                <button id="dashSendBtn">Anfrage absenden</button>
            </div>

            <div class="panel">
                <div class="panel-title">Live-Antwort <span>Output Stream</span></div>
                <div class="response-box" id="dashResponse">Bereit für Anfragen...</div>
            </div>
        </div>

        <!-- Letzte Aktivitäten & Logs -->
        <div class="panel">
            <div class="panel-title">Letzte Aktivitäten & Logs</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Aktion / Task</th>
                        <th>Modell</th>
                        <th>Status</th>
                        <th>Zeitpunkt</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Extension initialisiert & Dashboard geladen</td>
                        <td style="color: var(--text-muted);">system</td>
                        <td><span class="badge-success">Erfolgreich</span></td>
                        <td style="color: var(--text-muted);">Gerade eben</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const dashModel = document.getElementById('dashModel');
            const activeModelSub = document.getElementById('activeModelSub');

            // Direkt beim Laden initialisieren
            activeModelSub.innerText = dashModel.value;

            // Bei Änderung des Dropdown-Menüs aktualisieren
            dashModel.addEventListener('change', () => {
                activeModelSub.innerText = dashModel.value;
            });

            document.getElementById('dashSendBtn').addEventListener('click', () => {
                const prompt = document.getElementById('dashPrompt').value;
                const model = dashModel.value;
                document.getElementById('dashResponse').innerText = 'Sende Anfrage an ' + model + '...';
                vscode.postMessage({ type: 'runChat', prompt: prompt, model: model, bypass: true, autoAccept: true });
            });

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'response') {
                    document.getElementById('dashResponse').innerText = message.text;
                }
            });
        </script>
    </body>
    </html>`;
}