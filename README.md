# Coding Forever

![Version](https://img.shields.io/badge/version-2.2.0-orange.svg)
![VSCode](https://img.shields.io/badge/VS%20Code-1.80%2B-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Direct Gemini Flash Integration without Limits** — Die ultimative VS Code Extension für ungedrosselte KI-Entwicklung, angetrieben direkt von der Google Gemini API. Coding wie Du es willst!

---

## Author

* **Peter Päffgen**
* Senior Fullstack Architect
* 40 Jahre am Puls der IT | KI-gestützte Multilevel-Entwicklung | Individuelle KI-Beratung
* **Web:** [https://www.paeffgen-it.de](https://www.paeffgen-it.de)
* **Dev:** [https://github.com/peter1965p](https://github.com/peter1965p)

---

## Features

* **Autonomer Agenten-Modus:** KI führt Datei-Analysen, Erstellungen und Terminal-Befehle selbstständig im Projekt aus.
* **Visuelle Diff-Überwachung:** Volle Kontrolle vor Code-Übernahmen durch native VS Code Diff-Ansichten (`gemini-diff://`).
* **Chat-History Drawer & Header-Badges:** Synchronisierte Verlaufssteuerung und visuelle Status-Badges (`Agent [ON]`, `Bypass [ON]`, `Accept [ON]`) direkt in der Live-Headerleiste.
* **Direkte API-Anbindung:** Kein unnötiges Abo und keine künstlichen Limits – direkter Zugriff auf Gemini Flash und Pro Modelle.
* **Flexibles Engine-Management:** Nutzen von Google Gemini oder Einbindung lokaler Modelle (z. B. Ollama) über SQLite-Datenbank-Anbindung.
* **Sicherheitsfilter & Modi:** Dynamic Bypass Mode und Auto-Accept direkt über UI-Switches oder Einstellungen steuerbar.
* **Prompt Manager:** Lokaler SQLite3-basierter Manager mit vordefinierten Prompts & eigenen Vorlagen per Kontext-Variablen (`{selection}`, `{file}`).
* **Native VS Code Quick Fixes:** Direktes Korrigieren von Editor-Fehlern via Code-Actions (Glühbirne) mit einem Klick im Chat.

---

## Verwendung

1. Installiere die Extension in VS Code, mit: ext install PeterPaeffgen.coding-forever
2. Öffne das **Coding Forever** Icon in der Activity Bar.
3. Trage über das Zahnrad deinen Google Gemini API Key ein ([Hier kostenlos erstellen](https://aistudio.google.com/api-keys)).
4. Wähle dein gewünschtes Modell aus und starte das autonome Coding!

---

## Changelog

### 2.2.2
* **Fix**: Chat lebt wieder, war kurzzeitig nicht da wegen einem Bug. Das Problem mit den 2 API-Keys einmal in Settings und zum anderen in AI Engine. Dies habe ich nun behoben und mich dazu entschieden den API-KEY in die AI Engine zu platzieren. Dort gehört er auch von der Logik her hin.

### 2.2.1
* **Fix**: '/' gespeicherte Prompts sind wieder verfügbar

### 2.2.0
* **Agenten-Modus (Agentic Power):** Der Agent agiert autonom über Tool-Calls (`list_files`, `read_file`, `write_file`, `run_command`), nutzt ein Schritt-Limit von 10 Turns und führt Aktionen dynamisch aus.
* **Visuelle Diff-Überwachung (Visual Diffing):** Vor dem Schreiben von Dateien wird über einen Provider (`gemini-diff://`) ein VS Code Diff-Fenster (Original ↔ Vorschlag) zur Prüfung geöffnet.
* **Chat-History & Verlauf Steuerung:** Klappbarer History-Drawer direkt im Chat-Panel. Der Native Header-Button (`codingForever.openHistory`) fokussiert die Sidebar und toggelt den Verlauf global.
* **Native VS Code Quick Fixes:** Integration über Code-Actions (Glühbirne bei Fehlern), um Fehlerstellen direkt an den Agenten zu übergeben.
* **Header-Status-Badges:** Integrierte Live-Statusanzeigen (`Agent [ON]`, `Bypass [ON]`, `Accept [ON]`) in der oberen Leiste bei eingeklappter History.

### 2.1.0
* Kontextbasierte Prompt-Vorschläge je nach geöffneter Datei im Editor.
* Konstruktive Planerstellung pro Projekt, Volumen und Aufgabenstellung.
* Vollständiges UI-Redesign (Buttons, Switches, Dashboard-Optimierungen).
* **Fix:** Behebung des Instanz-Crashes durch Umstellung von `acquireVsCodeApi()` auf den Singleton `vscodeApi.ts`.

### 2.0.1
* Initiale Veröffentlichung mit Sidebar, Dashboard und direktem Gemini-Support.
* Einführung des **Prompt Managers** mit vordefinierten Prompts & Umstellung auf React-Frontend.
* Lokale SQLite3-Datenbankanbindung für eigene Prompts.
* Anbindung lokaler KI-Modelle (Ollama etc.) über die Einstellungen.

---

## Preview

### Overview
![Chat](media/Chat.png)

### Dashboard
![Dashboard](media/Dashboard.png)

### Prompt Manager
![Prompt Manager](media/PromptManager.png)

### AI Engine
![AI Engine](media/AIEngine.png)

### Global Settings
![Einstellungen](media/Einstellungen.png)