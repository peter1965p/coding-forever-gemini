import * as fs from 'fs';
import * as vscode from 'vscode';
import { resolveInWorkspace } from './tools';

const MAX_ACTIVE_FILE_CHARS = 6000;
const MAX_MENTION_CHARS = 12_000;
const MAX_MENTIONS = 6;

export interface EditorContext {
    fileName: string;
    content: string;
    selection: string;
    languageId: string;
}

export function readEditorContext(): EditorContext | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return undefined; }

    const raw = editor.document.getText();
    return {
        fileName: vscode.workspace.asRelativePath(editor.document.uri),
        content: raw.length > MAX_ACTIVE_FILE_CHARS
            ? `${raw.slice(0, MAX_ACTIVE_FILE_CHARS)}\n... (gekürzt, Datei ist länger)`
            : raw,
        selection: editor.document.getText(editor.selection),
        languageId: editor.document.languageId
    };
}

export function buildSystemPrompt(options: {
    agentMode: boolean;
    editor?: EditorContext;
    workspaceName: string;
    autoAccept: boolean;
}): string {
    const { agentMode, editor, workspaceName, autoAccept } = options;
    const activeFile = editor?.fileName ?? 'keine';

    if (!agentMode) {
        // Ohne Tools kann das Modell nicht nachsehen. Ohne diesen Hinweis fängt es
        // an, nach Pfaden zu fragen oder Dateien zu erfinden.
        return [
            'Du bist "Coding Forever", ein Coding-Assistent in VS Code.',
            'In diesem Modus hast du KEINEN Datei- oder Terminal-Zugriff. Du kannst nichts nachsehen',
            'und keine Rückfragen zu Pfaden stellen — antworte mit dem, was unten steht.',
            'Braucht eine Anfrage mehr Kontext (z.B. "scanne das Projekt"), sag in einem Satz,',
            'dass dafür der Agent-Modus eingeschaltet werden muss.',
            '',
            `Workspace: ${workspaceName}`,
            `Aktive Datei: ${activeFile}`,
            editor?.content
                ? `Inhalt:\n\`\`\`${editor.languageId}\n${editor.content}\n\`\`\``
                : '(keine Datei geöffnet)'
        ].join('\n');
    }

    return [
        'Du bist "Coding Forever", ein autonomer Entwickler-Agent direkt in VS Code.',
        '',
        'Arbeitsweise:',
        '1. Erst Überblick verschaffen: grep_workspace für gezielte Suche, list_files für die Struktur,',
        '   read_file nur für Dateien, die du wirklich brauchst. Erfinde nichts, was du nicht gesehen hast.',
        '2. Änderungen bevorzugt mit edit_file (nur die betroffene Stelle). write_file ist für neue',
        '   Dateien oder echte Neufassungen.',
        '3. Nach jeder Änderung get_diagnostics aufrufen und eigene Fehler selbst beheben,',
        '   bevor du dich fertig meldest.',
        '4. Tests oder Builds über run_command ausführen und die Ausgabe auswerten.',
        '   Dauerläufer (dev-Server, watch) nur mit background=true starten.',
        '5. Ändere ausschließlich, was die Aufgabe verlangt. Keine Umformatierungen nebenbei.',
        '6. Datei- und Terminal-Aktionen laufen immer über die Tools, niemals als Code-Block im Text.',
        '7. Am Ende in zwei bis drei Sätzen zusammenfassen, was du geändert hast.',
        '',
        `Workspace: ${workspaceName}`,
        `Aktive Datei im Editor: ${activeFile}`,
        editor?.selection?.trim()
            ? `Markierte Stelle:\n\`\`\`${editor.languageId}\n${editor.selection.slice(0, 2000)}\n\`\`\``
            : '',
        `AutoAccept: ${autoAccept ? 'an (Änderungen werden ohne Rückfrage geschrieben)' : 'aus (jede Änderung wird bestätigt)'}`
    ].filter(Boolean).join('\n');
}

const MAX_SELECTION_CHARS = 8000;

/**
 * Ersetzt die Platzhalter der Prompt-Bibliothek.
 * Das passiert beim Absenden, nicht beim Einfügen in das Eingabefeld — so bleibt
 * im Chat sichtbar, welche Vorlage benutzt wurde.
 */
export function applyTemplatePlaceholders(prompt: string, editor?: EditorContext): string {
    if (!/\{(selection|file)\}/.test(prompt)) { return prompt; }

    const selection = (editor?.selection?.trim() ? editor.selection : editor?.content ?? '')
        .slice(0, MAX_SELECTION_CHARS);

    return prompt
        .replace(/\{selection\}/g, selection || '(keine Datei geöffnet)')
        .replace(/\{file\}/g, editor?.fileName ?? 'keine Datei geöffnet');
}

/**
 * Löst @datei-Referenzen im Prompt auf und hängt den Dateiinhalt an.
 * So kann der Nutzer Kontext gezielt mitgeben, statt sich darauf zu verlassen,
 * dass der Agent die richtige Datei von selbst findet.
 */
export function expandFileMentions(prompt: string): { prompt: string; attached: string[] } {
    const mentionPattern = /@([\w./\\-]+\.[\w]+)/g;
    const seen = new Set<string>();
    const attachments: string[] = [];
    const attached: string[] = [];

    for (const match of prompt.matchAll(mentionPattern)) {
        if (attached.length >= MAX_MENTIONS) { break; }
        const raw = match[1];
        if (seen.has(raw)) { continue; }
        seen.add(raw);

        const resolved = resolveInWorkspace(raw);
        if (!resolved.ok || !fs.existsSync(resolved.abs)) { continue; }
        if (fs.statSync(resolved.abs).isDirectory()) { continue; }

        let content: string;
        try {
            content = fs.readFileSync(resolved.abs, 'utf8');
        } catch {
            continue;
        }

        const budget = Math.floor(MAX_MENTION_CHARS / MAX_MENTIONS);
        const body = content.length > budget
            ? `${content.slice(0, budget)}\n... (gekürzt)`
            : content;

        attachments.push(`### ${resolved.rel}\n\`\`\`\n${body}\n\`\`\``);
        attached.push(resolved.rel);
    }

    if (attachments.length === 0) { return { prompt, attached }; }

    return {
        prompt: `${prompt}\n\n--- Vom Nutzer angehängte Dateien ---\n${attachments.join('\n\n')}`,
        attached
    };
}
