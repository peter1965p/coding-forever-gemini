import * as vscode from 'vscode';

const RELEASES_API = 'https://api.github.com/repos/peter1965p/coding-forever-gemini/releases/latest';

export function isNewerVersion(current: string, latest: string): boolean {
    const parse = (v: string) => v.split('.').map(part => parseInt(part, 10) || 0);
    const currentParts = parse(current);
    const latestParts = parse(latest);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const c = currentParts[i] ?? 0;
        const l = latestParts[i] ?? 0;
        if (l > c) { return true; }
        if (l < c) { return false; }
    }
    return false;
}

/**
 * Prüft das neueste GitHub-Release. Vorher lief das über das https-Modul mit
 * verschachtelten Callbacks; fetch ist im Extension Host längst verfügbar.
 */
export async function checkForGitHubUpdates(
    context: vscode.ExtensionContext,
    manual = false
): Promise<void> {
    const currentVersion: string = context.extension.packageJSON.version;

    try {
        const res = await fetch(RELEASES_API, {
            headers: {
                'User-Agent': 'Coding-Forever-Extension',
                'Accept': 'application/vnd.github+json'
            }
        });

        if (!res.ok) {
            if (manual) {
                vscode.window.showInformationMessage(
                    `Kein GitHub-Release gefunden (HTTP ${res.status}).`
                );
            }
            return;
        }

        const release: any = await res.json();
        const latestVersion = String(release.tag_name || '').replace(/^v/, '');
        if (!latestVersion) { return; }

        if (isNewerVersion(currentVersion, latestVersion)) {
            const action = await vscode.window.showInformationMessage(
                `🚀 Ein neues Update für Coding Forever ist verfügbar (v${latestVersion}).`,
                'GitHub Releases öffnen',
                'Später'
            );
            if (action === 'GitHub Releases öffnen') {
                await vscode.env.openExternal(vscode.Uri.parse(release.html_url));
            }
        } else if (manual) {
            vscode.window.showInformationMessage(
                `Coding Forever ist auf dem neuesten Stand (v${currentVersion}).`
            );
        }
    } catch (error: any) {
        console.error('Update-Check fehlgeschlagen:', error);
        if (manual) {
            vscode.window.showErrorMessage(`Netzwerkfehler beim Prüfen auf Updates: ${error.message}`);
        }
    }
}
