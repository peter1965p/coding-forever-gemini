import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database } from 'sql.js';

export interface PromptBlock {
  id: string;
  label: string;
  category: string;
  description: string;
  prompt: string;
  scope: 'global' | 'workspace';
  workspace?: string | null;   // NEU: Projektname, nur bei scope='workspace' gesetzt
  createdAt?: string;
}

export class PromptDatabaseManager {
  private static instance: PromptDatabaseManager;
  private db: Database | null = null;
  private dbPath: string = '';

  private constructor() {}

  public static async getInstance(context: vscode.ExtensionContext): Promise<PromptDatabaseManager> {
    if (!PromptDatabaseManager.instance) {
      const manager = new PromptDatabaseManager();
      await manager.init(context);
      PromptDatabaseManager.instance = manager;
    }
    return PromptDatabaseManager.instance;
  }

  private async init(context: vscode.ExtensionContext): Promise<void> {
    const storageUri = context.globalStorageUri;
    const dbDir = storageUri.fsPath;
    this.dbPath = path.join(dbDir, 'prompts.sqlite');

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // WASM-Datei explizit aus dem dist-Ordner laden
    const wasmBinaryPath = path.join(context.extensionPath, 'dist', 'sql-wasm.wasm');
    const SQL = await initSqlJs({
      locateFile: () => wasmBinaryPath
    });

    if (fs.existsSync(this.dbPath)) {
      const filebuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(filebuffer);
    } else {
      this.db = new SQL.Database();
      this.saveToDisk();
    }

    this.initTable();
  }

  private saveToDisk(): void {
    if (!this.db) {
      return;
    }
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  private initTable(): void {
  if (!this.db) {
    return;
  }
  const sql = `
    CREATE TABLE IF NOT EXISTS prompt_blocks (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      prompt TEXT NOT NULL,
      scope TEXT DEFAULT 'global',
      workspace TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  this.db.run(sql);
  this.migrateAddWorkspaceColumn();
  this.seedDefaults();
  this.saveToDisk();
}

// NEU: Migration für bestehende DBs ohne 'workspace'-Spalte (z.B. Upgrade von v1.x/v2.0-early)
private migrateAddWorkspaceColumn(): void {
  if (!this.db) {
    return;
  }
  const res = this.db.exec("PRAGMA table_info(prompt_blocks)");
  const columns = res[0]?.values.map((row) => row[1] as string) || [];
  if (!columns.includes('workspace')) {
    this.db.run("ALTER TABLE prompt_blocks ADD COLUMN workspace TEXT");
  }
}

  private seedDefaults(): void {
  if (!this.db) {
    return;
  }

  const defaults: Array<[string, string, string, string, string, string]> = [
    // id, label, category, description, prompt, scope
    ['clean-code', '🧹 Clean Code', 'Refactoring', 'Optimiert den Code nach TypeScript Standards',
      'Refactore folgenden Code-Abschnitt:\n\n```{selection}```', 'global'],
    ['bugfix', '🔍 Bugfix Analysis', 'Debugging', 'Analysiert den Code auf Fehler',
      'Analysiere diesen Code auf Laufzeitfehler:\n\n```{selection}```', 'global'],
    ['fact-check', '⚓ Fakten-Check', 'Agent-Kontrolle', 'Verhindert Halluzinationen bei der Code-Analyse',
      'Analysiere NUR den folgenden Code. Erfinde keine Funktionen, Imports oder APIs, die nicht sichtbar sind. Wenn dir Kontext fehlt, sag das explizit statt zu raten:\n\n```{selection}```', 'global'],
    ['unit-tests', '🧪 Unit Tests', 'Testing', 'Generiert Tests für den markierten Code',
      'Schreibe Unit-Tests für folgenden Code. Nutze das im Projekt übliche Test-Framework (falls unklar, frag nach statt zu raten):\n\n```{selection}```', 'global'],
    ['explain-code', '📖 Erklär mir das', 'Doku', 'Erklärt Code verständlich in einfachem Deutsch',
      'Erkläre diesen Code Zeile für Zeile in einfachem Deutsch, als würdest du es einem Kollegen erklären, der gerade erst reinkommt:\n\n```{selection}```', 'global'],
    ['commit-msg', '📝 Commit Message', 'Git', 'Erstellt eine Conventional-Commit-Message',
      'Schreibe eine prägnante Conventional-Commit-Message für folgende Änderung. Kein Fließtext, nur die Message:\n\n```{selection}```', 'global'],
    ['security-scan', '🔒 Security Scan', 'Security', 'Schneller Sicherheits-Check auf konkrete Findings',
      'Prüfe diesen Code auf offensichtliche Sicherheitsprobleme (Injection, unsichere Defaults, exponierte Secrets). Liste nur konkrete Findings, keine generischen Warnungen:\n\n```{selection}```', 'global'],
    ['diff-only', '✅ Diff-Only', 'Agent-Kontrolle', 'Verhindert ungewollte Umschreibungen im Agent-Modus',
      'Ändere NUR was für die Aufgabe nötig ist. Gib den kompletten geänderten Codeblock zurück, aber verändere keine Formatierung, Variablennamen oder Struktur außerhalb dessen, was ich explizit gefragt habe:\n\n```{selection}```\n\nAktive Datei: {file}', 'global'],
  ];

  const insertStmt = "INSERT OR IGNORE INTO prompt_blocks (id, label, category, description, prompt, scope) VALUES (?, ?, ?, ?, ?, ?)";
  for (const row of defaults) {
    this.db.run(insertStmt, row);
  }
}

  public async getPrompts(workspace?: string): Promise<PromptBlock[]> {
  if (!this.db) {
    return [];
  }
  // Global-Prompts immer, workspace-Prompts nur für's aktuell übergebene Projekt
  const sql = workspace
    ? "SELECT id, label, category, description, prompt, scope, workspace, created_at as createdAt FROM prompt_blocks WHERE scope = 'global' OR workspace = ?"
    : "SELECT id, label, category, description, prompt, scope, workspace, created_at as createdAt FROM prompt_blocks WHERE scope = 'global'";

  const res = workspace ? this.db.exec(sql, [workspace]) : this.db.exec(sql);
  if (!res[0]) {
    return [];
  }

  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const obj: any = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as PromptBlock;
  });
}

public async addPrompt(block: Omit<PromptBlock, 'id' | 'createdAt'>): Promise<void> {
  if (!this.db) {
    return;
  }
  const id = `prompt_${Date.now()}`;
  this.db.run(
    "INSERT INTO prompt_blocks (id, label, category, description, prompt, scope, workspace) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, block.label, block.category, block.description, block.prompt, block.scope, block.workspace ?? null]
  );
  this.saveToDisk();
} 
  public async deletePrompt(id: string): Promise<void> {
    if (!this.db) {
      return;
    }
    this.db.run("DELETE FROM prompt_blocks WHERE id = ?", [id]);
    this.saveToDisk();
  }
}