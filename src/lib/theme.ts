/**
 * Design-Tokens des Chats. Vorher waren die Farben als Hex-Werte über die
 * Komponenten verstreut, wodurch das UI in hellen VS-Code-Themes unleserlich war.
 * Jetzt leiten sie sich aus den Theme-Variablen ab, mit den alten Dark-Werten
 * nur noch als Fallback.
 */
export const THEME_CSS = `
.cf-root {
    --cf-accent: #ff6200;
    --cf-accent-hover: #ea580c;
    --cf-bg: var(--vscode-editor-background, #0b0f19);
    --cf-bg-elev: var(--vscode-sideBar-background, #111827);
    --cf-bg-input: var(--vscode-input-background, #0b0f19);
    --cf-bg-hover: var(--vscode-list-hoverBackground, #1e293b);
    --cf-border: var(--vscode-panel-border, #1f2937);
    --cf-border-strong: var(--vscode-input-border, #334155);
    --cf-fg: var(--vscode-editor-foreground, #f9fafb);
    --cf-fg-muted: var(--vscode-descriptionForeground, #9ca3af);
    --cf-bubble-user: var(--vscode-list-inactiveSelectionBackground, #1e293b);
    --cf-bubble-ai: var(--vscode-editorWidget-background, #1a1f2e);
    --cf-code-bg: var(--vscode-textCodeBlock-background, #161b22);
    --cf-danger: var(--vscode-errorForeground, #ef4444);
    --cf-success: #10b981;
}
`;

/** Erkennt das aktive VS-Code-Theme über die Klasse am body-Element. */
export function isLightTheme(): boolean {
    const classes = document.body.classList;
    return classes.contains('vscode-light') || classes.contains('vscode-high-contrast-light');
}
