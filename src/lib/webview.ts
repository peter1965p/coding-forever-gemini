import * as path from 'path';
import * as vscode from 'vscode';
import { PublicSettings } from './settings';

/**
 * Serialisiert Daten für die Einbettung in ein <script>-Tag.
 * Ohne das Escapen von "<" könnte ein Wert mit "</script>" das Tag schließen —
 * vorher wurden Werte sogar unquotiert in Strings interpoliert, sodass ein
 * Anführungszeichen im Workspace-Namen das ganze HTML zerlegt hat.
 */
function toScriptJson(value: unknown): string {
    return JSON.stringify(value ?? null)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        // U+2028/U+2029 sind in JS Zeilentrenner und würden das Script zerlegen.
        .replace(/[\u2028\u2029]/g, match => match === '\u2028' ? '\\u2028' : '\\u2029');
}

function createNonce(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return nonce;
}

export function getWebviewHtml(
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
    initialRoute: string,
    settings: PublicSettings
): string {
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'dist', 'bundle.js'))
    );
    const nonce = createNonce();
    const pkg = context.extension.packageJSON;

    const bootstrap = {
        route: initialRoute,
        extName: pkg.name,
        extVersion: pkg.version,
        workspaceName: vscode.workspace.workspaceFolders?.[0]?.name || 'Global',
        osUser: process.env.USER || process.env.USERNAME || '',
        settings
    };

    // Kein connect-src: das Webview spricht ausschließlich über postMessage mit der
    // Extension. Vorher holte es die Ollama-Modellliste selbst per fetch, wofür
    // http://localhost:* offen sein musste.
    const csp = [
        "default-src 'none'",
        `img-src ${webview.cspSource} https: data:`,
        `script-src 'nonce-${nonce}'`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource} data:`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Coding Forever</title>
    <script nonce="${nonce}">window.CODING_FOREVER = ${toScriptJson(bootstrap)};</script>
</head>
<body style="margin:0;padding:0;background:var(--vscode-editor-background);">
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
