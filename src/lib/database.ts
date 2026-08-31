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
  workspace?: string | null;
  createdAt?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  workspace: string;
  is_open: number; // 1 = geöffnet als Tab, 0 = nur im Verlauf
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  sender: 'user' | 'assistant' | 'status';
  text: string;
  created_at?: string;
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

    this.initTables();
  }

  private saveToDisk(): void {
    if (!this.db) {
      return;
    }
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  private initTables(): void {
    if (!this.db) {
      return;
    }

    // Prompts Tabelle
    const sqlPrompts = `
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

    // Chat-Sessions Tabelle (Tabs & Verlauf)
    const sqlSessions = `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        workspace TEXT NOT NULL,
        is_open INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Chat-Nachrichten Tabelle
    const sqlMessages = `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );
    `;

    this.db.run(sqlPrompts);
    this.db.run(sqlSessions);
    this.db.run(sqlMessages);

    this.migrateAddWorkspaceColumn();
    this.seedDefaults();
    this.saveToDisk();
  }

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

  /* ==========================================================
   * PROMPT MANAGEMENT
   * ========================================================== */

  public async getPrompts(workspace?: string): Promise<PromptBlock[]> {
    if (!this.db) {return [];}
    const sql = workspace
      ? "SELECT id, label, category, description, prompt, scope, workspace, created_at as createdAt FROM prompt_blocks WHERE scope = 'global' OR workspace = ?"
      : "SELECT id, label, category, description, prompt, scope, workspace, created_at as createdAt FROM prompt_blocks WHERE scope = 'global'";

    const res = workspace ? this.db.exec(sql, [workspace]) : this.db.exec(sql);
    if (!res[0]) {return [];}

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
    if (!this.db) {return;}
    const id = `prompt_${Date.now()}`;
    this.db.run(
      "INSERT INTO prompt_blocks (id, label, category, description, prompt, scope, workspace) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, block.label, block.category, block.description, block.prompt, block.scope, block.workspace ?? null]
    );
    this.saveToDisk();
  }

  public async deletePrompt(id: string): Promise<void> {
    if (!this.db) {return;}
    this.db.run("DELETE FROM prompt_blocks WHERE id = ?", [id]);
    this.saveToDisk();
  }

  /* ==========================================================
   * CHAT SESSIONS & HISTORY MANAGEMENT
   * ========================================================== */

  public async getSessions(workspace: string): Promise<ChatSession[]> {
    if (!this.db) {return [];}
    const sql = "SELECT id, title, workspace, is_open, created_at, updated_at FROM chat_sessions WHERE workspace = ? ORDER BY updated_at DESC";
    const res = this.db.exec(sql, [workspace]);
    if (!res[0]) {return [];}

    const columns = res[0].columns;
    return res[0].values.map((row) => {
      const obj: any = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj as ChatSession;
    });
  }

  public async createSession(id: string, title: string, workspace: string): Promise<ChatSession> {
    if (!this.db) {throw new Error("Database not initialized");}
    const sql = "INSERT INTO chat_sessions (id, title, workspace, is_open) VALUES (?, ?, ?, 1)";
    this.db.run(sql, [id, title, workspace]);
    this.saveToDisk();
    return { id, title, workspace, is_open: 1 };
  }

  public async updateSessionTitle(id: string, title: string): Promise<void> {
    if (!this.db) {return;}
    const sql = "UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
    this.db.run(sql, [title, id]);
    this.saveToDisk();
  }

  public async setSessionTabStatus(id: string, isOpen: boolean): Promise<void> {
    if (!this.db) {return;}
    const sql = "UPDATE chat_sessions SET is_open = ? WHERE id = ?";
    this.db.run(sql, [isOpen ? 1 : 0, id]);
    this.saveToDisk();
  }

  public async deleteSession(id: string): Promise<void> {
    if (!this.db) {return;}
    this.db.run("DELETE FROM chat_messages WHERE session_id = ?", [id]);
    this.db.run("DELETE FROM chat_sessions WHERE id = ?", [id]);
    this.saveToDisk();
  }

  /* ==========================================================
   * CHAT MESSAGES MANAGEMENT
   * ========================================================== */

  public async getMessages(sessionId: string): Promise<ChatMessage[]> {
    if (!this.db) {return [];}
    const sql = "SELECT id, session_id, sender, text, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC";
    const res = this.db.exec(sql, [sessionId]);
    if (!res[0]) {return [];}

    const columns = res[0].columns;
    return res[0].values.map((row) => {
      const obj: any = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj as ChatMessage;
    });
  }

  public async addMessage(sessionId: string, sender: 'user' | 'assistant' | 'status', text: string): Promise<ChatMessage> {
    if (!this.db) {throw new Error("Database not initialized");}
    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    
    // Nachricht einfügen
    this.db.run(
      "INSERT INTO chat_messages (id, session_id, sender, text) VALUES (?, ?, ?, ?)",
      [id, sessionId, sender, text]
    );

    // Session Timestamp aktualisieren
    this.db.run("UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [sessionId]);
    
    this.saveToDisk();
    return { id, session_id: sessionId, sender, text };
  }
}