import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { ToolDef } from '../providers/types';

const execAsync = promisify(exec);

/** Build-Artefakte und Abhängigkeiten, die den Agenten nur Tokens kosten. */
const EXCLUDE_GLOB = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,'
    + '**/coverage/**,**/.next/**,**/.venv/**,**/__pycache__/**,**/.vscode-test/**,'
    + '**/releases/**,**/*.vsix,**/*.map,**/package-lock.json,**/pnpm-lock.yaml,**/yarn.lock}';

const MAX_FILES_LISTED = 400;
const MAX_FILE_CHARS = 60_000;
const MAX_GREP_FILES = 1200;
const MAX_GREP_MATCHES = 80;
const MAX_COMMAND_OUTPUT = 12_000;
const COMMAND_TIMEOUT_MS = 120_000;

export interface ToolContext {
    /** Wenn false, wird jeder schreibende Schritt einzeln bestätigt. */
    autoAccept: boolean;
    onStatus(text: string): void;
    confirm(message: string): Promise<boolean>;
    showDiff(fileUri: vscode.Uri, proposedContent: string): Promise<void>;
}

/* ==========================================================
 * WORKSPACE-GRENZE
 * ========================================================== */

export function workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

type PathResolution = { ok: true; abs: string; rel: string } | { ok: false; error: string };

/**
 * Löst einen vom Modell gelieferten Pfad auf und stellt sicher, dass er im
 * Workspace bleibt. Ohne diese Prüfung kam ein Modell mit "../../.ssh/id_rsa"
 * problemlos aus dem Projekt heraus.
 */
export function resolveInWorkspace(relPath: unknown): PathResolution {
    const root = workspaceRoot();
    if (!root) { return { ok: false, error: 'Kein Workspace geöffnet.' }; }
    if (typeof relPath !== 'string' || !relPath.trim()) {
        return { ok: false, error: 'Kein Pfad angegeben.' };
    }

    const abs = path.resolve(root, relPath.trim());
    const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (abs !== root && !abs.startsWith(rootPrefix)) {
        return { ok: false, error: `Zugriff verweigert: "${relPath}" liegt außerhalb des Workspace.` };
    }

    // Symlinks könnten die Prüfung oben umgehen, deshalb den echten Pfad prüfen,
    // falls die Datei schon existiert.
    try {
        if (fs.existsSync(abs)) {
            const real = fs.realpathSync(abs);
            const realRoot = fs.realpathSync(root);
            const realPrefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
            if (real !== realRoot && !real.startsWith(realPrefix)) {
                return { ok: false, error: `Zugriff verweigert: "${relPath}" zeigt per Symlink aus dem Workspace heraus.` };
            }
        }
    } catch {
        // realpath darf scheitern (Rechte) — die Prefix-Prüfung oben greift trotzdem.
    }

    // Für das Workspace-Root selbst ist path.relative() leer; '.' ist dort das
    // sinnvolle Ergebnis (list_files baut daraus sein Glob).
    return { ok: true, abs, rel: path.relative(root, abs) || '.' };
}

/* ==========================================================
 * COMMAND-ABSICHERUNG
 * ========================================================== */

interface CommandRisk {
    pattern: RegExp;
    reason: string;
}

/**
 * Befehle, die auch bei aktivem AutoAccept nachfragen. AutoAccept ist per
 * Default an — ohne diese Liste dürfte das Modell ab Werk "rm -rf" absetzen.
 */
const RISKY_COMMANDS: CommandRisk[] = [
    { pattern: /\brm\s+(-\w*\s+)*-\w*[rf]/i, reason: 'rekursives oder erzwungenes Löschen' },
    { pattern: /\bsudo\b|\bdoas\b/i, reason: 'Ausführung mit Root-Rechten' },
    { pattern: /\b(mkfs|fdisk|parted)\b/i, reason: 'Änderung an Dateisystemen' },
    { pattern: /\bdd\s+if=/i, reason: 'direktes Schreiben auf Blockgeräte' },
    { pattern: />\s*\/dev\/(sd|nvme|disk)/i, reason: 'Schreiben auf ein Blockgerät' },
    { pattern: /\b(shutdown|reboot|halt|poweroff)\b/i, reason: 'Herunterfahren des Systems' },
    { pattern: /(curl|wget)[^|;&]*\|\s*(ba|z|fi)?sh/i, reason: 'Ausführen eines heruntergeladenen Skripts' },
    { pattern: /\bchmod\s+(-R\s+)?777\b/i, reason: 'Freigabe aller Rechte' },
    { pattern: /\bgit\s+(reset\s+--hard|clean\s+-\w*f)/i, reason: 'Verwerfen lokaler Änderungen' },
    { pattern: /\bgit\s+push\b/i, reason: 'Veröffentlichen von Commits' },
    { pattern: /\b(npm|yarn|pnpm)\s+publish\b/i, reason: 'Veröffentlichen eines Pakets' },
    { pattern: /:\s*\(\s*\)\s*\{.*\}\s*;\s*:/, reason: 'Fork-Bombe' },
    { pattern: /\bhistory\s+-c\b|\btruncate\b/i, reason: 'Löschen von Verlauf oder Dateiinhalten' }
];

export function assessCommand(command: string): CommandRisk | undefined {
    return RISKY_COMMANDS.find(risk => risk.pattern.test(command));
}

/* ==========================================================
 * TOOL-DEFINITIONEN
 * ========================================================== */

export const AGENT_TOOLS: ToolDef[] = [
    {
        name: 'list_files',
        description: 'Listet Dateien im Workspace (ohne node_modules, dist, .git). Optional auf einen Unterordner eingeschränkt.',
        parameters: {
            subdir: { type: 'string', description: 'Optionaler Unterordner relativ zum Workspace-Root.' }
        },
        required: []
    },
    {
        name: 'read_file',
        description: 'Liest den Inhalt einer Datei relativ zum Workspace-Root.',
        parameters: {
            path: { type: 'string', description: 'Relativer Pfad zur Datei.' }
        },
        required: ['path']
    },
    {
        name: 'grep_workspace',
        description: 'Durchsucht den Workspace per regulärem Ausdruck und liefert Treffer mit Datei und Zeilennummer. Immer bevorzugen gegenüber dem Lesen vieler Dateien.',
        parameters: {
            pattern: { type: 'string', description: 'Regulärer Ausdruck (JavaScript-Syntax).' },
            include: { type: 'string', description: 'Optionales Glob für die Dateiauswahl, z.B. "**/*.ts".' }
        },
        required: ['pattern']
    },
    {
        name: 'edit_file',
        description: 'Ersetzt eine eindeutige Textstelle in einer Datei. Immer bevorzugen gegenüber write_file, weil nur der betroffene Abschnitt übertragen wird.',
        parameters: {
            path: { type: 'string', description: 'Relativer Pfad zur Datei.' },
            search: { type: 'string', description: 'Exakter Text, der ersetzt werden soll (muss genau einmal vorkommen).' },
            replace: { type: 'string', description: 'Neuer Text.' }
        },
        required: ['path', 'search', 'replace']
    },
    {
        name: 'write_file',
        description: 'Erstellt eine Datei oder überschreibt sie komplett. Nur für neue Dateien oder vollständige Neufassungen nutzen.',
        parameters: {
            path: { type: 'string', description: 'Relativer Pfad zur Datei.' },
            content: { type: 'string', description: 'Kompletter neuer Dateiinhalt.' }
        },
        required: ['path', 'content']
    },
    {
        name: 'get_diagnostics',
        description: 'Liefert die aktuellen Fehler und Warnungen von VS Code (TypeScript, ESLint, etc.). Nach jeder Änderung aufrufen, um das eigene Ergebnis zu prüfen.',
        parameters: {
            path: { type: 'string', description: 'Optional: nur Diagnosen dieser Datei.' }
        },
        required: []
    },
    {
        name: 'git_diff',
        description: 'Zeigt die uncommitteten Änderungen im Workspace als Diff.',
        parameters: {
            staged: { type: 'boolean', description: 'true für die gestageten Änderungen (git diff --staged).' }
        },
        required: []
    },
    {
        name: 'run_command',
        description: 'Führt einen Shell-Befehl im Workspace-Root aus und liefert dessen Ausgabe zurück. Für Dauerläufer (dev-Server, watch) background=true setzen; dann läuft der Befehl in einem VS Code Terminal.',
        parameters: {
            command: { type: 'string', description: 'Der Befehl, z.B. "npm test".' },
            background: { type: 'boolean', description: 'true startet den Befehl in einem Terminal statt auf die Ausgabe zu warten.' }
        },
        required: ['command']
    }
];

export function toolStatusLabel(name: string, args: any): string {
    switch (name) {
        case 'list_files': return args?.subdir ? `📂 Scanne ${args.subdir}...` : '📂 Scanne Projektstruktur...';
        case 'read_file': return `📖 Lese ${args?.path}...`;
        case 'grep_workspace': return `🔎 Suche nach "${args?.pattern}"...`;
        case 'edit_file': return `✏️ Bearbeite ${args?.path}...`;
        case 'write_file': return `✍️ Schreibe ${args?.path}...`;
        case 'get_diagnostics': return '🩺 Prüfe Fehlerliste...';
        case 'git_diff': return '🔀 Lese git diff...';
        case 'run_command': return `⚡ Führe aus: ${args?.command}`;
        default: return `🔧 ${name}...`;
    }
}

/* ==========================================================
 * AUSFÜHRUNG
 * ========================================================== */

function truncate(text: string, max: number, hint: string): string {
    if (text.length <= max) { return text; }
    return `${text.slice(0, max)}\n\n... (gekürzt, ${text.length - max} Zeichen mehr. ${hint})`;
}

async function listFiles(subdir: unknown): Promise<any> {
    if (!workspaceRoot()) { return { error: 'Kein Workspace geöffnet.' }; }

    let pattern = '**/*';
    if (typeof subdir === 'string' && subdir.trim()) {
        const resolved = resolveInWorkspace(subdir);
        if (!resolved.ok) { return { error: resolved.error }; }
        const prefix = resolved.rel.replace(/\\/g, '/').replace(/\/+$/, '');
        if (prefix && prefix !== '.') { pattern = `${prefix}/**/*`; }
    }

    const files = await vscode.workspace.findFiles(pattern, EXCLUDE_GLOB);
    const paths = files.map(f => vscode.workspace.asRelativePath(f)).sort();

    if (paths.length > MAX_FILES_LISTED) {
        return {
            files: paths.slice(0, MAX_FILES_LISTED).join('\n'),
            truncated: true,
            note: `${paths.length - MAX_FILES_LISTED} weitere Dateien ausgelassen. `
                + 'Nutze grep_workspace oder list_files mit subdir statt alles zu scannen.'
        };
    }

    return { files: paths.join('\n'), count: paths.length };
}

function readFile(relPath: unknown): any {
    const resolved = resolveInWorkspace(relPath);
    if (!resolved.ok) { return { error: resolved.error }; }
    if (!fs.existsSync(resolved.abs)) { return { error: `Datei nicht gefunden: ${resolved.rel}` }; }
    if (fs.statSync(resolved.abs).isDirectory()) {
        return { error: `${resolved.rel} ist ein Ordner. Nutze list_files mit subdir.` };
    }

    const content = fs.readFileSync(resolved.abs, 'utf8');
    return {
        path: resolved.rel,
        content: truncate(content, MAX_FILE_CHARS, 'Nutze grep_workspace für gezielte Stellen.')
    };
}

async function grepWorkspace(pattern: unknown, include: unknown): Promise<any> {
    if (!workspaceRoot()) { return { error: 'Kein Workspace geöffnet.' }; }
    if (typeof pattern !== 'string' || !pattern.trim()) { return { error: 'Kein Suchmuster angegeben.' }; }

    let regex: RegExp;
    try {
        regex = new RegExp(pattern, 'i');
    } catch (e: any) {
        return { error: `Ungültiger regulärer Ausdruck: ${e.message}` };
    }

    const glob = typeof include === 'string' && include.trim() ? include.trim() : '**/*';
    const files = (await vscode.workspace.findFiles(glob, EXCLUDE_GLOB)).slice(0, MAX_GREP_FILES);

    const matches: string[] = [];
    let scanned = 0;

    for (const file of files) {
        if (matches.length >= MAX_GREP_MATCHES) { break; }
        let text: string;
        try {
            const stat = fs.statSync(file.fsPath);
            if (stat.size > 2_000_000) { continue; }
            text = fs.readFileSync(file.fsPath, 'utf8');
        } catch {
            continue;
        }
        if (text.includes('\u0000')) { continue; }
        scanned++;

        const rel = vscode.workspace.asRelativePath(file);
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (!regex.test(lines[i])) { continue; }
            matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
            if (matches.length >= MAX_GREP_MATCHES) { break; }
        }
    }

    return {
        matchCount: matches.length,
        scannedFiles: scanned,
        matches: matches.join('\n') || '(keine Treffer)',
        truncated: matches.length >= MAX_GREP_MATCHES
    };
}

async function editFile(args: any, ctx: ToolContext): Promise<any> {
    const resolved = resolveInWorkspace(args?.path);
    if (!resolved.ok) { return { error: resolved.error }; }
    if (!fs.existsSync(resolved.abs)) {
        return { error: `Datei nicht gefunden: ${resolved.rel}. Für neue Dateien write_file nutzen.` };
    }
    if (typeof args?.search !== 'string' || args.search.length === 0) {
        return { error: 'Parameter "search" fehlt oder ist leer.' };
    }
    const replacement = typeof args?.replace === 'string' ? args.replace : '';

    const original = fs.readFileSync(resolved.abs, 'utf8');
    const occurrences = original.split(args.search).length - 1;
    if (occurrences === 0) {
        return { error: `Der Suchtext kommt in ${resolved.rel} nicht vor. Datei vorher mit read_file prüfen.` };
    }
    if (occurrences > 1) {
        return {
            error: `Der Suchtext kommt ${occurrences}× in ${resolved.rel} vor und ist damit nicht eindeutig. `
                + 'Mehr Kontext in "search" aufnehmen.'
        };
    }

    const updated = original.replace(args.search, () => replacement);
    const fileUri = vscode.Uri.file(resolved.abs);
    await ctx.showDiff(fileUri, updated);

    if (!ctx.autoAccept && !(await ctx.confirm(`Änderung an "${resolved.rel}" übernehmen?`))) {
        return { error: 'Vom Nutzer im Diff-Schritt abgelehnt.' };
    }

    fs.writeFileSync(resolved.abs, updated, 'utf8');
    return { success: true, path: resolved.rel, replacedChars: args.search.length };
}

async function writeFile(args: any, ctx: ToolContext): Promise<any> {
    const resolved = resolveInWorkspace(args?.path);
    if (!resolved.ok) { return { error: resolved.error }; }
    if (typeof args?.content !== 'string') { return { error: 'Parameter "content" fehlt.' }; }

    const existed = fs.existsSync(resolved.abs);
    if (existed) {
        await ctx.showDiff(vscode.Uri.file(resolved.abs), args.content);
    }

    const question = existed
        ? `Soll "${resolved.rel}" nach deiner Prüfung im Diff überschrieben werden?`
        : `Soll die neue Datei "${resolved.rel}" angelegt werden?`;
    if (!ctx.autoAccept && !(await ctx.confirm(question))) {
        return { error: 'Vom Nutzer im Diff-Schritt abgelehnt.' };
    }

    const dir = path.dirname(resolved.abs);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(resolved.abs, args.content, 'utf8');
    return { success: true, path: resolved.rel, created: !existed };
}

function severityLabel(severity: vscode.DiagnosticSeverity): string {
    switch (severity) {
        case vscode.DiagnosticSeverity.Error: return 'error';
        case vscode.DiagnosticSeverity.Warning: return 'warning';
        case vscode.DiagnosticSeverity.Information: return 'info';
        default: return 'hint';
    }
}

function getDiagnostics(relPath: unknown): any {
    let entries: Array<[vscode.Uri, vscode.Diagnostic[]]>;

    if (typeof relPath === 'string' && relPath.trim()) {
        const resolved = resolveInWorkspace(relPath);
        if (!resolved.ok) { return { error: resolved.error }; }
        entries = [[vscode.Uri.file(resolved.abs), vscode.languages.getDiagnostics(vscode.Uri.file(resolved.abs))]];
    } else {
        entries = vscode.languages.getDiagnostics();
    }

    const lines: string[] = [];
    let errors = 0;
    let warnings = 0;

    for (const [uri, diagnostics] of entries) {
        for (const diagnostic of diagnostics) {
            if (diagnostic.severity === vscode.DiagnosticSeverity.Error) { errors++; }
            if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) { warnings++; }
            if (diagnostic.severity > vscode.DiagnosticSeverity.Warning) { continue; }
            lines.push(
                `${vscode.workspace.asRelativePath(uri)}:${diagnostic.range.start.line + 1}`
                + ` [${severityLabel(diagnostic.severity)}] ${diagnostic.message}`
            );
        }
    }

    return {
        errors,
        warnings,
        diagnostics: lines.slice(0, 100).join('\n') || '(keine Fehler oder Warnungen)',
        truncated: lines.length > 100
    };
}

async function gitDiff(staged: unknown): Promise<any> {
    const root = workspaceRoot();
    if (!root) { return { error: 'Kein Workspace geöffnet.' }; }

    const command = staged === true ? 'git diff --staged' : 'git diff';
    try {
        const { stdout } = await execAsync(command, {
            cwd: root,
            maxBuffer: 10 * 1024 * 1024,
            timeout: 30_000
        });
        return {
            diff: truncate(stdout, MAX_COMMAND_OUTPUT, 'Nutze git_diff gezielt nach einzelnen Änderungen.')
                || '(keine Änderungen)'
        };
    } catch (e: any) {
        return { error: `git diff fehlgeschlagen: ${e.stderr || e.message}` };
    }
}

async function runCommand(args: any, ctx: ToolContext): Promise<any> {
    const root = workspaceRoot();
    if (!root) { return { error: 'Kein Workspace geöffnet.' }; }
    if (typeof args?.command !== 'string' || !args.command.trim()) {
        return { error: 'Kein Befehl angegeben.' };
    }

    const command = args.command.trim();
    const risk = assessCommand(command);
    const confirmDangerous = vscode.workspace
        .getConfiguration('codingForever')
        .get<boolean>('agent.confirmDangerousCommands', true);

    // Riskante Befehle werden auch bei AutoAccept bestätigt — das ist der Punkt,
    // an dem ein Agent sonst echten Schaden anrichten kann.
    const needsConfirmation = !ctx.autoAccept || (risk !== undefined && confirmDangerous);
    if (needsConfirmation) {
        const warning = risk ? `\n\n⚠️ Erkanntes Risiko: ${risk.reason}.` : '';
        if (!(await ctx.confirm(`Befehl ausführen?\n\n${command}${warning}`))) {
            return { error: 'Vom Nutzer abgelehnt.' };
        }
    }

    if (args?.background === true) {
        const terminal = vscode.window.createTerminal({ name: 'Coding Forever Agent', cwd: root });
        terminal.show();
        terminal.sendText(command);
        return { success: true, note: 'Befehl läuft im Terminal weiter; keine Ausgabe verfügbar.' };
    }

    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd: root,
            timeout: COMMAND_TIMEOUT_MS,
            maxBuffer: 10 * 1024 * 1024
        });
        return {
            exitCode: 0,
            stdout: truncate(stdout, MAX_COMMAND_OUTPUT, 'Ausgabe gezielt filtern.'),
            stderr: truncate(stderr, 2000, '')
        };
    } catch (e: any) {
        if (e.killed) {
            return { error: `Befehl nach ${COMMAND_TIMEOUT_MS / 1000}s abgebrochen. Für Dauerläufer background=true nutzen.` };
        }
        return {
            exitCode: e.code ?? 1,
            stdout: truncate(e.stdout ?? '', MAX_COMMAND_OUTPUT, ''),
            stderr: truncate(e.stderr ?? e.message, MAX_COMMAND_OUTPUT, '')
        };
    }
}

export async function executeTool(name: string, args: any, ctx: ToolContext): Promise<any> {
    try {
        switch (name) {
            case 'list_files': return await listFiles(args?.subdir);
            case 'read_file': return readFile(args?.path);
            case 'grep_workspace': return await grepWorkspace(args?.pattern, args?.include);
            case 'edit_file': return await editFile(args, ctx);
            case 'write_file': return await writeFile(args, ctx);
            case 'get_diagnostics': return getDiagnostics(args?.path);
            case 'git_diff': return await gitDiff(args?.staged);
            case 'run_command': return await runCommand(args, ctx);
            default: return { error: `Unbekanntes Tool: ${name}` };
        }
    } catch (e: any) {
        // Ein Tool-Fehler darf den Loop nicht killen — das Modell soll die
        // Meldung sehen und es anders versuchen können.
        return { error: `Tool "${name}" fehlgeschlagen: ${e.message}` };
    }
}
