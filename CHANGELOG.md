# Change Log

All notable changes to the "coding-forever" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
