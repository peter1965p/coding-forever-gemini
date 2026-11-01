# Change Log

All notable changes to the "coding-forever" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [3.0.1]

**Mehrere Ollama-Rechner, per Klick umschaltbar.** Wer für lokale Modelle zu wenig Hardware hat, kann einen stärkeren Rechner im Netzwerk als Ollama-Instanz eintragen und im Dashboard ein- und ausschalten.

### Ollama-Instanzen

* **Beliebig viele Instanzen** statt der bisherigen einen. Jede hat einen Namen und eine Adresse (`http://192.168.1.20:11434`); Schema und Standard-Port 11434 werden ergänzt, wenn man sie weglässt.
* **Schalter im Dashboard.** Neue Karte „Ollama-Instanzen": ein Klick schaltet eine Instanz ein oder aus, daneben steht live, ob sie antwortet — mit Modellzahl, Antwortzeit und Ollama-Version. „Prüfen" testet neu, „Verwalten" öffnet die AI Engine.
* **Eigene Gruppe pro Instanz im Modell-Dropdown** („Ollama · Gaming PC"), sodass man sieht, auf welchem Rechner ein Modell läuft. Die Status-Zeile im Chat nennt die Instanz ebenfalls.
* **Verwaltung in der AI Engine:** anlegen, benennen, Adresse ändern, entfernen — mit eingeklappter Anleitung für den Remote-Rechner (`OLLAMA_HOST=0.0.0.0 ollama serve`, Firewall) und Warnhinweis zur unverschlüsselten Verbindung.
* **Neuer Befehl `Ollama-Instanzen umschalten`** in der Befehlspalette, als Mehrfachauswahl.
* **Hardware-Empfehlungen nur noch für den eigenen Rechner.** Der Scan beschreibt diese Maschine; für einen Rechner im Netzwerk wären Empfehlungen und der „Installieren"-Knopf (`ollama pull` läuft lokal) falsch gewesen.
* **Statuscheck in der Hilfe** meldet eine eingeschaltete, aber nicht erreichbare Instanz mit der naheliegenden Ursache; dazu neue Hilfetexte zum Remote-Betrieb.
* **Neue Anleitung „Reverse Engineering mit ReVa (Ghidra)“** in der Hilfe (jetzt zwölf Themen): Vorbereitung, fertige Konfiguration für den GUI-Modus (`http://localhost:8080/mcp/message`) und den Headless-Modus (`mcp-reva`), Tipps für die Arbeit (Agent an, konkret fragen, `maxTurns` auf 30–40, Rückfrage vor schreibenden Werkzeugen) und eine Tabelle der typischen Stolperstellen — gekürzte Ergebnisse, Token-Limits bei vielen Werkzeugen, 120-s-Timeout. Auffindbar über „reva“, „ghidra“, „rea“ oder „reverse engineering“.
* **Bestehende Einrichtung bleibt erhalten:** die bisherige Einzel-Instanz wird beim ersten Start als „Dieser Rechner" übernommen — mit ihrer Adresse und ihrem Schalterzustand. Alte Modell-Auswahlen (`local:…`) laufen weiter.

### Robustheit

* **Timeout für nicht antwortende Rechner.** Ein Netzwerk-Rechner, der gerade aus ist, ließ `fetch` minutenlang hängen — und mit ihm die komplette Modellliste aller Anbieter. Jede Instanz wird jetzt parallel und mit 5 s Timeout geprüft; ein toter Rechner hält die übrigen nicht auf.
* **Das Webview wird nicht mehr als vertrauenswürdig behandelt:** die Instanzliste wird beim Speichern normalisiert (gültige Adressen, eindeutige IDs ohne `:` und `/`, keine Duplikate), statt roh übernommen zu werden.
* Das Schreiben von „Büro" als ID ergibt `buero` statt `buro`.

### Intern

* **111 Unit-Tests** (vorher 80). Neu: ein echter HTTP-Server, der Ollama nachstellt, einer der Verbindungen annimmt und nie antwortet (für den Timeout), die Migration der alten Einstellung, die Normalisierung und die Auflösung von `ollama:<instanz>:<modell>`.
* Entfernt: die ungenutzte Methode `getDefaultModel`.

## [3.0.0]

**MCP ist da.** Das Feld in der AI Engine speicherte seit Monaten eine Konfiguration, die niemand gelesen hat — das war das einzige Versprechen, das die Extension nicht gehalten hat. Jetzt startet Coding Forever die eingetragenen Server wirklich, holt ihre Tools ab und stellt sie dem Agenten zur Verfügung.

### Model Context Protocol

* **Echter MCP-Client** über das offizielle SDK, mit stdio- und Streamable-HTTP-Transport. Das Konfigurationsformat ist dasselbe wie bei Claude Desktop und den übrigen Clients (`{ "mcpServers": { ... } }`), bestehende Konfigurationen lassen sich also direkt übernehmen — inklusive `env`, `cwd`, `args` und `disabled`.
* **MCP-Tools sind gleichberechtigt.** Sie landen zusammen mit den eingebauten im selben Agent-Loop und funktionieren dadurch sofort bei allen fünf Anbietern — Gemini, Groq, Claude, OpenAI und Ollama. Kein Anbieter braucht Sonderbehandlung.
* **Eindeutige Namen:** Tools werden als `mcp__<server>__<tool>` eingehängt, damit zwei Server dasselbe Tool anbieten können, ohne sich gegenseitig zu überschreiben.
* **Rückfrage bei schreibenden Tools.** Ob ein Tool nur liest, sagt der Server über `readOnlyHint`; alles andere wird bei ausgeschaltetem **Accept All** einzeln bestätigt, mit sichtbaren Argumenten.
* **Server-Status in der AI Engine:** welcher Server läuft, über welchen Transport, mit wie vielen Tools — und bei einem Fehlschlag die Meldung im Klartext statt stillem Nichts. Dazu ein Protokoll-Kanal („Coding Forever" in der Ausgabe) und der Befehl `MCP-Server neu verbinden`.
* **Sauberer Lebenszyklus:** Beim Speichern werden nur geänderte Server neu gestartet, entfernte beendet, unveränderte laufen weiter. Ein Server, der gar nicht startet, blockiert die anderen nicht; Verbindungsaufbau läuft nach 30 s in einen Timeout statt ewig zu hängen.

### Hilfe-System

* **Neuer Tab „Hilfe"** mit elf Themen — Schnellstart, Chat-Bedienung, Agent und Werkzeuge, Kontrolle und Sicherheit, Anbieter, MCP, Prompt-Bibliothek, Befehle, Einstellungen, Datenablage und Problemlösung. Volltextsuche über Titel, Schlagworte und Fließtext; bei aktiver Suche klappen alle Treffer auf.
* **Statuscheck statt Prosa.** Oben auf der Seite steht nicht, wie es gehen sollte, sondern was bei dir gerade fehlt: konfigurierte Anbieter, geladene Modelle, verbundene MCP-Server, offenes Projekt. Jeder Befund kommt mit dem passenden nächsten Schritt als Knopf — „AI Engine öffnen", „Neu laden", „Protokoll".
* **Erreichbar von überall:** Fragezeichen in der Chat-Leiste, Symbol in der Seitenleisten-Titelzeile, Befehl `Coding Forever: Hilfe öffnen`.
* **Hinweis statt Sackgasse:** Ist gar kein Anbieter eingerichtet, zeigt der Chat das direkt an — mit Knöpfen zur AI Engine und zur Hilfe, statt den Nutzer in eine Fehlermeldung laufen zu lassen.
* MCP-Beispielkonfigurationen lassen sich aus der Hilfe heraus kopieren.

### Tool-Schemata

* **Neue Schema-Schicht** (`src/providers/schema.ts`). Die eingebauten Tools hatten flache Parameter — nur Strings, Zahlen, Booleans. MCP-Server liefern beliebiges JSON Schema mit verschachtelten Objekten, Arrays und Enums, das vorher niemand hätte übersetzen können.
* Groq, OpenAI, Ollama und Claude bekommen das JSON Schema direkt. Für **Gemini** gibt es einen rekursiven Übersetzer in dessen eigenen Dialekt: Typen in Großbuchstaben, `type: ["string","null"]` → `nullable`, und alle Keywords raus, die Google mit „Invalid JSON payload" quittiert (`$schema`, `additionalProperties`, `pattern`, `default`, `oneOf` …).

### Behoben

* **Fehlgeschlagene Läufe verschwanden aus dem Verlauf.** Fehler und Abbrüche wurden nur ins Fenster geschrieben, nie gespeichert — nach einem Reload stand dort eine Frage ohne Antwort. In der Datenbank standen dadurch seit 2.9.0 zehn Fragen gegen fünf Antworten. Fehlschläge landen jetzt sichtbar im Verlauf.

### Darstellung

* **Schriftgröße ist einstellbar** (9–18 px, mit Vorauswahl von „Sehr kompakt" bis „Sehr groß"). Text **und** Abstände skalieren gemeinsam, weil das Chat-Layout jetzt durchgehend in `em` gegen eine Basisgröße rechnet statt mit zwei Dutzend fest verdrahteten Pixelwerten. In der schmalen Sidebar war die Standardgröße schlicht zu groß.

### Intern

* `src/mcp/` mit Konfigurations-Parser und Verbindungsmanager.
* Der Agent-Loop kennt `executeTool` jetzt als Callback statt die eingebauten Tools direkt zu importieren — das Routing zwischen eingebaut und MCP macht der Aufrufer.
* **77 Unit-Tests** (vorher 37). Neu dabei: ein echter MCP-Server als Fixture, gegen den Verbindungsaufbau, Tool-Liste, verschachtelte Argumente, Fehlerfälle und der Lebenszyklus getestet werden — weiterhin ohne VS-Code-Download. Dazu Prüfungen auf die Hilfe-Inhalte selbst: eindeutige IDs, vollständige Tabellenzeilen und gültiges JSON in jedem Beispiel.

## [2.9.0]

Größtes Release seit 2.0 — der Chat hat jetzt ein Gedächtnis, streamt, lässt sich stoppen, und der Agent kann sein eigenes Ergebnis prüfen.

### Behoben

* **Der Chat hatte kein Gedächtnis.** Bei jeder Anfrage wurde der Verlauf neu aufgebaut (`contents = [{ role: 'user', ... }]`), in allen drei Provider-Pfaden. "Mach das nochmal, aber mit Fehlerbehandlung" konnte das Modell deshalb nicht verstehen — die Vorgängerantwort hat es nie gesehen. Die Nachrichten lagen längst in SQLite, wurden aber nie zurückgefüttert. Jetzt gehen die letzten 20 Nachrichten (einstellbar) als echter Gesprächskontext mit.
* **"Einstellungen" löschte den Gemini-Key.** Die Seite wurde ohne Props gerendert und startete mit leerem Key-Feld; der Handler schrieb jedes Feld bedingungslos. Ein Klick auf "Speichern" — etwa nur um die Schriftart zu ändern — überschrieb den hinterlegten Key mit einem leeren String. Keys liegen jetzt in der SecretStorage und werden von dieser Seite gar nicht mehr angefasst.
* **Zwei konkurrierende Key-Felder** ("Einstellungen" und "AI Engine") schrieben beide auf `geminiApiKey` und zeigten unterschiedliche Stände. Es gibt nur noch eins, unter "AI Engine".
* **`chatFont` war eine Attrappe:** wurde gespeichert, injiziert — und nirgends benutzt. Die Einstellung wirkt jetzt tatsächlich auf den Chat, mit Live-Vorschau.
* **Fehler im Message-Handler verschwanden** in einem `console.error`. Warf die Datenbank oder ein Tool, wartete das UI endlos auf eine Antwort, die nie kam. Jede Ausnahme landet jetzt sichtbar im Chat.
* **Projektbezogene Prompt-Blöcke wurden nie zugeordnet:** der Prompt-Manager arbeitete mit `scope: 'project'` und `p.project`, die Datenbank mit `'workspace'` und `workspace`. Der Workspace-Filter blieb dadurch immer leer.
* **Das Dashboard konnte nichts senden:** `handleSend` rief `acquireVsCodeApi()` ein zweites Mal auf, was im Webview eine Exception wirft.
* **Dashboard-Statuskarten zeigten Fake-Daten** — "Bypass ON", "Auto-Accept Aktiv", "API-Key Hinterlegt" standen fest im Code, unabhängig von der echten Konfiguration. Dazu eine erfundene Log-Tabelle. Alles ersetzt durch echte Werte; die Tabelle zeigt jetzt die wirklich gespeicherten Chats.
* **Dateiname im Diff-Titel** wurde mit `split('/')` ermittelt und zeigte unter Windows den ganzen Pfad.
* **`diffContentStore` wuchs unbegrenzt:** jeder je vorgeschlagene Dateiinhalt blieb bis zum Schließen von VS Code im Speicher.
* **Die Datenbank wurde bei jeder Chat-Nachricht komplett neu geschrieben.** Jetzt gebündelt, mit sofortigem Flush beim Deaktivieren.
* Jede Session hieß "New Chat", was den Verlauf praktisch unbenutzbar machte. Titel werden jetzt nach dem ersten Austausch automatisch generiert.

### Sicherheit

* **API-Keys liegen in der SecretStorage** (OS-Keychain) statt im globalState, der als Klartext-JSON auf der Platte liegt. Bestehende Keys werden beim ersten Start automatisch migriert.
* **Keys verlassen den Extension Host nicht mehr.** Vorher wurden alle vier Keys im Klartext als `window.INITIAL_AI_SETTINGS` in das Webview-HTML geschrieben, obwohl das Webview sie nie braucht. Jetzt bekommt es nur noch `hasGeminiKey: true`.
* **CSP mit Nonce** statt `script-src 'unsafe-inline'`; alle in das HTML eingebetteten Werte werden korrekt escaped. Vorher konnte ein Anführungszeichen im Workspace-Namen das HTML zerlegen.
* **Pfad-Schutz für die Agent-Tools:** `read_file`/`write_file` nahmen `path.join(root, args.path)` ungeprüft — ein Modell kam mit `../../.ssh/id_rsa` aus dem Workspace heraus. Jetzt wird jeder Pfad gegen die Workspace-Grenze geprüft, Symlinks eingeschlossen.
* **Riskante Shell-Befehle werden immer bestätigt** (`rm -rf`, `sudo`, `dd`, Pipe-nach-Shell, `git push`, `npm publish`, Fork-Bomben …), auch bei aktivem Accept All. Abschaltbar über `codingForever.agent.confirmDangerousCommands`.
* **Accept All ist nicht mehr standardmäßig an.** Vorher durfte das Modell ab Werk ohne Rückfrage schreiben und Befehle ausführen.

### Neu

* **Streaming.** Antworten erscheinen Wort für Wort, bei allen Anbietern (SSE bei Gemini/Groq/OpenAI/Claude, NDJSON bei Ollama). Vorher starrte man bei einem großen Modell 20 Sekunden auf ein stummes UI — ohne Lade-Indikator, und der Senden-Button ließ sich beliebig oft drücken.
* **Stop-Button.** Läuft der Agent in eine Schleife, war man vorher 10 Schritte lang Zuschauer. Jetzt bricht ein Klick (oder `Coding Forever: Laufenden Agenten stoppen`) sofort ab, inklusive des laufenden HTTP-Requests.
* **Claude und OpenAI funktionieren.** Die Key-Felder gab es schon, gelesen wurden sie nie — die Anfrage landete trotzdem bei Gemini. Beide sind jetzt vollwertige Anbieter mit eigenem Streaming und Tool-Calling.
* **Vier neue Agent-Tools:**
  * `edit_file` — Suchen/Ersetzen statt Vollüberschreiben. Spart massiv Tokens und verhindert, dass das Modell eine Datei nebenbei halb neu schreibt.
  * `grep_workspace` — Regex-Suche mit Datei und Zeilennummer, statt erst 300 Dateien zu listen.
  * `get_diagnostics` — der Agent sieht seine eigenen TypeScript-/ESLint-Fehler und bessert nach, bevor er sich fertig meldet.
  * `git_diff` — uncommittete Änderungen, für Commit-Messages und Reviews.
* **`run_command` liefert jetzt die Ausgabe zurück**, statt nur ins Terminal zu feuern. Der Agent kann Tests laufen lassen und das Ergebnis auswerten. Dauerläufer (dev-Server, watch) gehen mit `background=true` weiter ins Terminal.
* **`@datei` im Chat-Eingabefeld** mit Autovervollständigung aus dem Workspace. Der angehängte Inhalt geht direkt mit, statt dass der Agent die richtige Datei selbst finden muss.
* **"Auswahl an den Chat senden"** im Editor-Kontextmenü.
* **Live-Modellliste für Gemini und Claude.** Bei Groq gab es das schon; Gemini hatte zwei fest verdrahtete IDs im Dropdown. Jetzt veraltet keine Liste mehr.
* **Echtes Markdown-Rendering** über `react-markdown` + GFM: Tabellen, verschachtelte Listen, Inline-Code, Links, Blockquotes. Vorher lief das über einen handgeschriebenen Zeilen-Parser, der nichts davon kannte.
* **Code-Blöcke mit Diff- und Übernehmen-Button** direkt am Block, statt einer Schaltfläche pro Nachricht.
* **Theme-Treue.** Das Chat-UI hatte `#0b0f19`, `#111827` und Co. fest im Code und sah in hellen Themes wie ein Fremdkörper aus. Alle Farben kommen jetzt aus den VS-Code-Variablen, Orange bleibt als Akzent. Der Syntax-Highlighter wechselt mit.
* **Neue Einstellungen:** `codingForever.agent.maxTurns`, `codingForever.agent.historyDepth`, `codingForever.agent.confirmDangerousCommands`.
* **GPU-Erkennung auf Windows und macOS** (vorher nur Linux über `lspci`).

### Intern

* **Ein Agent-Loop statt drei.** Groq, Ollama und Gemini hatten je eine fast identische Turn-Schleife mit eigener Fehlerbehandlung — genau deshalb kam der `res.ok`-Fix aus 2.8.2 nur in einem der drei Pfade an. Jetzt gibt es ein `LlmProvider`-Interface mit fünf Implementierungen und einen gemeinsamen Loop.
* `extension.ts` von 1.576 auf ~700 Zeilen heruntergebrochen: `providers/`, `agent/`, `system/`, `lib/`.
* **35 Unit-Tests** für Pfad-Schutz, Command-Prüfung, Platzhalter, Mentions, Modell-Auflösung und die Message-Konvertierung aller Anbieter — laufen ohne VS-Code-Download über `npm test`.
* Totes Gewicht raus: `src/pages/code.chat.ts` (204 Zeilen, von nirgends importiert), der ungenutzte globale `currentSessionId`, die Abhängigkeiten `@google/genai` und `groq-sdk` (beide installiert, beide nie importiert), der Beispiel-Test.
* Screenshots werden nicht mehr mitgeliefert, sondern im README über GitHub-URLs eingebunden (~730 KB kleineres Paket).

## [2.8.2]

* **Gemini-Fehler waren unsichtbar:** Im Gemini-Pfad wurde die HTTP-Antwort von Google nie auf Fehler geprüft (anders als bei Groq/Ollama). Schlug der Request fehl (falsche Modell-ID, Quota, kaputtes Tool-Schema...), kam nur ein nichtssagendes "Keine Antwort erhalten." an – die echte Fehlermeldung von Google ging verloren. Jetzt wird sie direkt angezeigt, inklusive Safety-Block-Grund, falls Google aus Sicherheitsgründen blockiert statt zu antworten.
* **Ausgeführte Prompt-Blöcke** (aus dem Prompt-Manager) liefen bisher immer über Groq, sobald irgendein Groq-Key hinterlegt war – unabhängig davon, dass der ganze Sinn der Extension "Gemini kostenlos & ohne Limit" ist. Gemini ist jetzt der echte Default, Groq springt nur ein, wenn gar kein Gemini-Key gesetzt ist.

## [2.8.1]

* Der eigentliche Bug: runChat hat die explizite Gemini-Wahl ignoriert und bei vorhandenem Groq-Key immer auf Groq umgeleitet. Jetzt nur noch Fallback, wenn wirklich gar kein Modell übergeben wurde – die Dropdown-Auswahl zählt jetzt tatsächlich, ganz gleich welche Keys hinterlegt sind.
* Die eigentliche Fehlerursache dahinter: llama-3.3-70b-versatile wurde von Groq am 16.08.2026 abgeschaltet (zusammen mit llama-3.1-8b-instant; qwen/qwen3-32b schon am 17.07.). Alle Fallback-Referenzen im Code zeigten noch auf die toten Modelle. Jetzt auf die offiziell empfohlenen Nachfolger umgestellt: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.6-27b.

## [2.8.0]

* react-syntax-highlighter mit Prism-Engine + vscDarkPlus-Theme (das gleiche Farbschema, das VS Code selbst für dunkle Themes nutzt) eingebaut. Registrierte Sprachen: TSX, TypeScript, JSX, JavaScript, Python, JSON, Bash, SQL, CSS, HTML, YAML – Keywords, Strings, JSX-Tags, Props etc. jetzt alle farblich unterschieden.
* Kleiner Nebeneffekt: Bundle wächst von ~241KB auf ~910KB (Prism-Grammatiken + Theme-Daten) – für eine lokale VS-Code-Extension völlig unkritisch, lädt trotzdem sofort.
* Einige Bugs wurden auch bereinigt.

## [2.7.2]

* **Local Model Mode (ohne Agenten-Modus):** Ohne Agent-Modus bekommt er jetzt Name und Inhalt der gerade offenen Datei direkt in den System-Prompt (gekappt bei 4000 Zeichen, damit's nicht wieder Richtung TPM-Limit ausartet) – plus die klare Ansage, nie nach einem Pfad zu fragen, sondern bei projektweiten Anfragen kurz zu sagen "dafür brauchst du Agent-Modus" statt rumzueiern.
* Für "scanne das ganze Projekt" bleibt's ohne Agent trotzdem ehrlich limitiert – er sieht ja wirklich nur die eine Datei, kann nicht zaubern. Aber für "was macht diese Funktion hier" oder ähnliche Fragen zur offenen Datei sollte er jetzt direkt antworten, ohne erst nach Grunddaten zu fragen, die er längst hätte wissen können.

## [2.7.1]

* **LM Bug:** Lokale Modelle wurden nicht erkannt. Der Bug ist jetzt behoben.

## [2.7.0]

* **AiSettings:** beim Umschalten auf "Lokale Modelle" wird jetzt tatsächlich SCAN_SYSTEM gesendet. Zeigt jetzt immer (nicht nur wenn 0 Ollama-Modelle gefunden werden) die gescannte Hardware + passende Empfehlungen mit Install-Button.
* **Dashboard:** neue "System-Monitor"-Sektion mit echten grafischen Balken für CPU-Load, RAM-Auslastung (%, GB frei), CPU-Temperatur (farbcodiert grün/orange/rot) und GPU-Name. Läuft mit einmaligem vollem Scan beim Öffnen + Live-Polling alle 4s über einen neuen, leichten SCAN_LIVE_STATS-Handler.
* **Scan System Bug:** wurde im Backend behoben.

## [2.6.1]

* **Problem:** Agent-Toggle in der UI schickt zwar agentMode mit, aber das Backend liest es nie. handleAgent baut immer den vollen Agent-System-Prompt + alle 4 Tool-Definitionen, egal was man im UI einstellt. Bei openai/gpt-oss-20b mit nur 8000 TPM Free-Tier-Limit reißt das sofort das Limit.
* **Gelöst:** handleAgent() bekommt jetzt einen echten agentMode-Parameter, msg.agentMode aus dem Frontend wird tatsächlich durchgereicht. Agent AUS = schlanker System-Prompt, keine Tools im Request (weder Groq noch Gemini) → massiv weniger Tokens. Agent AN = volle Agent-Logik + Tools.

## [2.6.0]

* **Groq Agentic Chat:** OPENAI_AGENT_TOOLS – dieselben vier Tools (list_files, read_file, write_file, run_command) wie bei Gemini, aber im OpenAI-kompatiblen tools/function-Schema, das Groq erwartet.
* **Groq-Pfad umgebaut:** statt einem einzelnen fetch-Call jetzt eine echte Agentic-Loop (max. 10 Turns, wie bei Gemini) – Modell bekommt Tools angeboten, tool_calls werden erkannt, über executeTool() ausgeführt (inkl. Diff-Anzeige vor write_file, Bestätigungs-Dialog wenn autoAccept aus ist).
* **Filter-Bug gefixt:** fetchGroqModels() schließt jetzt auch orpheus, canopylabs, playai aus – die TTS-Modelle tauchen im Dropdown nicht mehr auf.

## [2.5.0]

* **Groq Coding:** Einbindung von dem Groq SDK und allen Groq Modellen in das Modell-Menü im Chatmodul.
* Vorbereitung der Systemauslesung (Hardware) für lokale Modelle.

## [2.4.0]

* **Projektgenerator:** Neue Projekte können direkt aus VS Code mit Node.js, TypeScript, React/Vite oder Next.js erstellt werden.
* **Automatische Umgebungserkennung:** Windows, macOS und Linux sowie die passenden npm-/npx-Executables und Standardpfade werden automatisch erkannt.
* **Projektordner öffnen:** Nach erfolgreicher Erstellung öffnet die Extension den neuen Projektordner automatisch in VS Code.

## [2.3.1]

* **Fix:** Bug Gemini API Key wird nun im VS Code Storage gespeichert.

## [2.3.0]

* **Chat-History & Persistent Storage:** Alle Chat-Nachrichten werden automatisch in SQLite gespeichert und können über den History-Drawer geladen werden.
* **Strukturierte Chat-Ausgaben:** Vollständige Markdown-Unterstützung mit Headings, Code-Blöcken mit Syntax-Highlighting, Bullet-Listen und besserer visueller Struktur.
* **Verbesserte Session-Verwaltung:** Jeder Chat hat eine eindeutige Session-ID, Nachrichten werden mit Timestamps versehen und Sessions lassen sich mit einem Klick wiederherstellen.
* **Dashboard-Version-Anzeige:** Die aktuelle Extension-Version wird jetzt im Dashboard angezeigt.
* **Trash-Funktion:** Chat-Sessions können einzeln aus der History gelöscht werden.

## [2.2.2]

* **Fix:** Chat lebt wieder, war kurzzeitig nicht da wegen einem Bug mit 2 API-Keys (einmal in Settings, einmal in AI Engine). API-Key wohnt jetzt nur noch in der AI Engine.

## [2.2.1]

* **Fix:** '/' gespeicherte Prompts sind wieder verfügbar.

## [2.2.0]

* **Agenten-Modus (Agentic Power):** Der Agent agiert autonom über Tool-Calls (list_files, read_file, write_file, run_command), nutzt ein Schritt-Limit von 10 Turns und führt Aktionen dynamisch aus.
* **Visuelle Diff-Überwachung:** Vor dem Schreiben von Dateien wird über einen Provider (gemini-diff://) ein VS Code Diff-Fenster (Original ↔ Vorschlag) zur Prüfung geöffnet.
* **Chat-History & Verlauf Steuerung:** Klappbarer History-Drawer direkt im Chat-Panel.
* **Native VS Code Quick Fixes:** Integration über Code-Actions (Glühbirne bei Fehlern), um Fehlerstellen direkt an den Agenten zu übergeben.
* **Header-Status-Badges:** Integrierte Live-Statusanzeigen (Agent [ON], Bypass [ON], Accept [ON]) in der oberen Leiste.

## [2.1.0]

* Kontextbasierte Prompt-Vorschläge je nach geöffneter Datei im Editor.
* Konstruktive Planerstellung pro Projekt, Volumen und Aufgabenstellung.
* Vollständiges UI-Redesign (Buttons, Switches, Dashboard-Optimierungen).
* **Fix:** Behebung des Instanz-Crashes durch Umstellung von acquireVsCodeApi() auf den Singleton vscodeApi.ts.

## [2.0.1] - 2026-08-26

* Initiale Veröffentlichung mit Sidebar, Dashboard und direktem Gemini-Support.
* Einführung des Prompt Managers mit vordefinierten Prompts & Umstellung auf React-Frontend.
* Lokale SQLite3-Datenbankanbindung für eigene Prompts.
* Anbindung lokaler KI-Modelle (Ollama etc.) über die Einstellungen.
