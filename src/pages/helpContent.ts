/**
 * Inhalt des Hilfe-Tabs — bewusst als reine Daten, getrennt von der Darstellung.
 * So lässt sich die Suche testen, ohne React zu rendern.
 */

export type HelpBlock =
    | { kind: 'text'; text: string }
    | { kind: 'list'; items: string[] }
    | { kind: 'table'; head: string[]; rows: string[][] }
    | { kind: 'code'; code: string }
    | { kind: 'note'; tone: 'info' | 'warn'; text: string };

export interface HelpTopic {
    id: string;
    icon: string;
    title: string;
    summary: string;
    /** Zusätzliche Suchbegriffe, die im Text nicht wörtlich vorkommen. */
    keywords: string[];
    body: HelpBlock[];
}

export const HELP_TOPICS: HelpTopic[] = [
    {
        id: 'schnellstart',
        icon: '🚀',
        title: 'Schnellstart',
        summary: 'In drei Schritten zur ersten Antwort.',
        keywords: ['anfang', 'einrichten', 'setup', 'installation', 'erste schritte', 'api key'],
        body: [
            { kind: 'list', items: [
                '**Key hinterlegen** — unter *AI Engine* mindestens einen Anbieter eintragen. '
                    + 'Gemini und Groq haben beide ein kostenloses Kontingent.',
                '**Modell wählen** — unten links im Chat. Die Liste wird live beim Anbieter abgefragt.',
                '**Loslegen** — Frage eintippen, Enter. Für Aufgaben im Projekt den Schalter *Agent* an.'
            ] },
            { kind: 'note', tone: 'info', text:
                'Ohne Key geht auch *Lokale Modelle* über Ollama — komplett offline und ohne Anmeldung.' },
            { kind: 'note', tone: 'warn', text:
                'Beim ersten Mal **Accept All ausgelassen** lassen. Dann zeigt dir der Agent jede '
                + 'Änderung erst als Diff und wartet auf dein OK. Einschalten, wenn du weißt, wie er arbeitet.' }
        ]
    },
    {
        id: 'chat',
        icon: '💬',
        title: 'Chat bedienen',
        summary: 'Tastatur, Schrägstrich-Befehle, Dateien anhängen.',
        keywords: ['eingabe', 'enter', 'tastatur', 'slash', 'at', 'verlauf', 'history', 'stop', 'abbrechen'],
        body: [
            { kind: 'table', head: ['Eingabe', 'Wirkung'], rows: [
                ['`Enter`', 'Absenden'],
                ['`Shift` + `Enter`', 'Zeilenumbruch'],
                ['`/`', 'Prompt-Bibliothek öffnen — tippen filtert, Enter übernimmt den ersten Treffer'],
                ['`@`', 'Datei aus dem Projekt anhängen; ihr Inhalt geht direkt mit'],
                ['`Esc`', 'Vorschlagsliste schließen']
            ] },
            { kind: 'text', text:
                'Während eine Antwort läuft, wird aus *Senden* ein **Stop**. Das bricht Modell und '
                + 'laufenden Request sofort ab — auch mitten in einem Agent-Durchlauf.' },
            { kind: 'text', text:
                'Jeder Code-Block hat vier Schaltflächen: **Diff** gegen die offene Datei, '
                + '**Übernehmen** in den Editor, **Herunterladen** und **Kopieren**.' },
            { kind: 'text', text:
                'Der Verlauf liegt pro Projekt lokal in SQLite. Das Uhr-Symbol oben öffnet ihn, '
                + 'Titel werden nach dem ersten Austausch automatisch vergeben.' }
        ]
    },
    {
        id: 'agent',
        icon: '🤖',
        title: 'Agent-Modus & Werkzeuge',
        summary: 'Was der Agent selbst tun kann — und wann du ihn besser auslässt.',
        keywords: ['tools', 'werkzeuge', 'dateien', 'terminal', 'grep', 'diagnostics', 'git'],
        body: [
            { kind: 'text', text:
                'Mit eingeschaltetem **Agent** bekommt das Modell Werkzeuge und arbeitet selbstständig: '
                + 'suchen, lesen, ändern, Tests laufen lassen, eigene Fehler nachbessern.' },
            { kind: 'table', head: ['Werkzeug', 'Zweck'], rows: [
                ['`grep_workspace`', 'Regex-Suche mit Datei und Zeilennummer'],
                ['`list_files`', 'Projektstruktur, optional ein Unterordner'],
                ['`read_file`', 'Datei lesen'],
                ['`edit_file`', 'Eine eindeutige Stelle ersetzen — spart Tokens'],
                ['`write_file`', 'Datei anlegen oder komplett neu schreiben'],
                ['`get_diagnostics`', 'TypeScript- und ESLint-Fehler, damit der Agent sich selbst prüft'],
                ['`git_diff`', 'Uncommittete Änderungen'],
                ['`run_command`', 'Befehl ausführen und die Ausgabe auswerten']
            ] },
            { kind: 'text', text:
                '**Ohne Agent** hat das Modell keinen Datei- oder Terminal-Zugriff und bekommt nur die '
                + 'gerade offene Datei mit. Das ist deutlich sparsamer — gut für kurze Fragen oder '
                + 'wenn das Tageskontingent knapp wird.' },
            { kind: 'note', tone: 'info', text:
                'Dauerläufer wie ein dev-Server gehören mit `background=true` ins Terminal, sonst '
                + 'läuft der Befehl nach zwei Minuten in einen Timeout.' }
        ]
    },
    {
        id: 'sicherheit',
        icon: '🛡️',
        title: 'Kontrolle & Sicherheit',
        summary: 'Accept All, Diffs, riskante Befehle, Workspace-Grenze.',
        keywords: ['accept all', 'diff', 'bestätigung', 'rm -rf', 'gefährlich', 'secretstorage', 'schutz'],
        body: [
            { kind: 'text', text:
                '**Accept All aus** (Standard): Jede Dateiänderung wird erst als Diff gezeigt und '
                + 'einzeln freigegeben. **Accept All an**: Der Agent schreibt ohne Rückfrage durch.' },
            { kind: 'text', text: 'Unabhängig davon gelten immer drei Grenzen:' },
            { kind: 'list', items: [
                '**Workspace-Grenze** — jeder Pfad wird geprüft, auch gegen Symlinks, die aus dem '
                    + 'Projekt herausführen. `../../.ssh/id_rsa` wird abgelehnt.',
                '**Riskante Befehle** — `rm -rf`, `sudo`, `dd`, `git push`, `npm publish`, '
                    + 'Pipe-nach-Shell und ähnliches werden *immer* bestätigt, auch bei Accept All. '
                    + 'Abschaltbar über `codingForever.agent.confirmDangerousCommands`.',
                '**API-Keys** liegen im Schlüsselbund des Systems (SecretStorage) und werden nie an '
                    + 'das Chat-Fenster übertragen.'
            ] }
        ]
    },
    {
        id: 'anbieter',
        icon: '⚡',
        title: 'Anbieter & Modelle',
        summary: 'Fünf Engines, ein Dropdown — und welche wofür taugt.',
        keywords: ['gemini', 'groq', 'claude', 'openai', 'ollama', 'lokal', 'modell', 'key', 'token', 'remote', 'netzwerk', 'zweiter rechner', 'gpu server'],
        body: [
            { kind: 'table', head: ['Anbieter', 'Stärke', 'Key holen'], rows: [
                ['Gemini', 'Großzügiges Gratis-Kontingent', 'aistudio.google.com/apikey'],
                ['Groq', 'Sehr schnell, kostenloses Tier', 'console.groq.com/keys'],
                ['Claude', 'Stark bei langen Agent-Läufen', 'console.anthropic.com'],
                ['OpenAI', 'GPT- und o-Serie', 'platform.openai.com/api-keys'],
                ['Ollama', 'Eigene Modelle, kein Key nötig', '—']
            ] },
            { kind: 'text', text:
                'Alle fünf streamen und beherrschen Werkzeuge. Welche Modelle verfügbar sind, wird '
                + 'live beim Anbieter abgefragt — die Liste veraltet also nicht.' },
            { kind: 'text', text:
                '**Ollama kann mehrere Rechner.** Ist dein eigener zu schwach, trägst du einen stärkeren im '
                + 'Netzwerk als weitere Instanz ein. Im **Dashboard** schaltest du jede Instanz mit einem Klick '
                + 'ein oder aus; eingeschaltete erscheinen als eigene Gruppe im Modell-Dropdown '
                + '(„Ollama · Gaming PC“).' },
            { kind: 'list', items: [
                'Auf dem anderen Rechner: `OLLAMA_HOST=0.0.0.0 ollama serve` und Port `11434` in der Firewall freigeben.',
                'Hier unter *AI Engine → Ollama-Instanzen* die Adresse eintragen, z. B. `http://192.168.1.20:11434`.',
                'Auch mit dem Befehl **Ollama-Instanzen umschalten** aus der Befehlspalette lassen sie sich wechseln.'
            ] },
            { kind: 'note', tone: 'warn', text:
                'Die Verbindung zu einem Rechner im Netzwerk ist unverschlüsselt und ungeschützt. Nur in einem '
                + 'Netz verwenden, dem du vertraust — und nie ungeschützt ins Internet freigeben.' },
            { kind: 'note', tone: 'info', text:
                'Die Modell-Auswahl im Dropdown gilt. Es wird nie stillschweigend auf einen anderen '
                + 'Anbieter umgeleitet; fehlt der Key, sagt die Fehlermeldung genau das.' }
        ]
    },
    {
        id: 'mcp',
        icon: '🔌',
        title: 'MCP-Server einrichten',
        summary: 'Externe Werkzeuge: Dateisystem, GitHub, Datenbanken, Websuche. (ReVa/Ghidra: eigenes Thema)',
        keywords: ['model context protocol', 'server', 'npx', 'stdio', 'http', 'tools erweitern'],
        body: [
            { kind: 'text', text:
                'Über das **Model Context Protocol** bekommt der Agent beliebige weitere Werkzeuge. '
                + 'Eingetragen wird unter *AI Engine → MCP Server*, im selben Format wie bei Claude Desktop:' },
            { kind: 'code', code: JSON.stringify({
                mcpServers: {
                    filesystem: {
                        command: 'npx',
                        args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/peter/Dev']
                    },
                    github: {
                        command: 'npx',
                        args: ['-y', '@modelcontextprotocol/server-github'],
                        env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_...' }
                    }
                }
            }, null, 2) },
            { kind: 'list', items: [
                'Speichern startet die Server automatisch; **Verbinden / Neu laden** erzwingt es.',
                'Unterstützt werden **stdio** (`command`) und **Streamable HTTP** (`url`), dazu '
                    + '`env`, `cwd`, `args` und `disabled`.',
                'Die Tools erscheinen im Chat als `mcp__<server>__<tool>` und funktionieren bei allen Anbietern.',
                'Schlägt ein Server fehl, steht die Ursache neben seinem Namen — Details im Protokoll.'
            ] },
            { kind: 'note', tone: 'warn', text:
                'Ein MCP-Server ist ein Programm, das mit deinen Rechten auf deinem Rechner startet. '
                + 'Trage nur Server ein, denen du vertraust.' }
        ]
    },
    {
        id: 'rea',
        icon: '🔬',
        title: 'Reverse Engineering mit ReVa (Ghidra)',
        summary: 'Binärdateien von der KI analysieren lassen — über den ReVa-MCP-Server.',
        keywords: [
            'rea', 'reva', 'ghidra', 'reverse engineering', 'reverse engineering assistant',
            'dekompilieren', 'decompile', 'binary', 'binärdatei', 'malware', 'disassembler'
        ],
        body: [
            { kind: 'text', text:
                '**ReVa** (Reverse Engineering Assistant) ist ein MCP-Server für **Ghidra**. Der Agent bekommt '
                + 'damit viele kleine Werkzeuge, um ein geöffnetes Programm zu untersuchen: Funktionen auflisten, '
                + 'dekompilieren, Querverweise verfolgen, Strings lesen — und Funktionen umbenennen oder kommentieren.' },
            { kind: 'text', text: '**Vorbereitung**' },
            { kind: 'list', items: [
                'ReVa als Erweiterung in Ghidra installieren (Projektseite: github.com/cyberkaida/reverse-engineering-assistant).',
                'Ghidra starten und ein **Projekt öffnen** — ReVa lauscht nur, solange Ghidra läuft. '
                    + 'Standard ist `localhost` auf Port `8080`; der Port lässt sich in Ghidra ändern.'
            ] },
            { kind: 'text', text:
                '**Einrichtung in Coding Forever** — unter *AI Engine → MCP Server* eintragen. '
                + 'ReVa nutzt Streamable HTTP, also eine `url`:' },
            { kind: 'code', code: JSON.stringify({
                mcpServers: { reva: { url: 'http://localhost:8080/mcp/message' } }
            }, null, 2) },
            { kind: 'text', text:
                'Statt der GUI-Variante gibt es einen **Headless-Modus** ohne Ghidra-Fenster. Dort startet der '
                + 'Client einen Befehl; installiert wird er einmalig mit `uv tool install reverse-engineering-assistant`:' },
            { kind: 'code', code: JSON.stringify({
                mcpServers: { reva: { command: 'mcp-reva' } }
            }, null, 2) },
            { kind: 'text', text:
                'Danach auf **Verbinden / Neu laden** klicken. Steht der Server mit grünem Punkt und seiner '
                + 'Tool-Anzahl da, ist er bereit — im Chat erscheinen die Werkzeuge als `mcp__reva__…`.' },
            { kind: 'text', text: '**Arbeiten damit**' },
            { kind: 'list', items: [
                '**Agent einschalten** — ohne Agent-Modus bekommt das Modell keine Werkzeuge.',
                'Konkret fragen: „Welche Funktion verarbeitet die Netzwerk-Eingabe, und was macht sie?“ '
                    + 'funktioniert besser als „analysiere das Programm“.',
                'Die Analyse braucht viele Schritte. Stelle `codingForever.agent.maxTurns` auf **30 bis 40**; '
                    + 'bei den voreingestellten 12 bricht der Agent mitten drin ab.',
                'Mit **Accept All aus** fragt Coding Forever vor schreibenden Werkzeugen (Umbenennen, Kommentieren) '
                    + 'einzeln nach — das schützt dein Ghidra-Projekt vor unbeabsichtigten Änderungen.'
            ] },
            { kind: 'table', head: ['Stolperstelle', 'Was hilft'], rows: [
                ['Server bleibt rot',
                    'Läuft Ghidra mit geöffnetem Projekt? Stimmt der Port? Details im *Protokoll*.'],
                ['Antwort bricht ab oder wirkt abgeschnitten',
                    'Werkzeug-Ergebnisse über 24.000 Zeichen werden gekürzt — große Funktionen ggf. in Teilen abfragen lassen.'],
                ['Fehler wegen Token-Limit oder „zu viele Tools“',
                    'ReVa bringt viele Werkzeuge mit, die bei jeder Anfrage mitgehen. Kleine Gratis-Kontingente '
                    + '(z. B. Groq mit `gpt-oss-20b`) stoßen schnell an die Grenze; Gemini oder Claude kommen damit besser zurecht.'],
                ['Ein Werkzeug dauert sehr lange',
                    'Ein Aufruf bricht nach 120 Sekunden ab. Bei großen Binärdateien die Frage enger fassen.']
            ] },
            { kind: 'note', tone: 'warn', text:
                'ReVa lauscht standardmäßig nur auf `localhost`. Wer es für andere Rechner öffnet, sollte die '
                + 'Authentifizierung per API-Key von ReVa aktivieren — die Header dafür lassen sich in der '
                + 'Server-Konfiguration unter `headers` mitgeben.' }
        ]
    },
    {
        id: 'prompts',
        icon: '📚',
        title: 'Prompt-Bibliothek',
        summary: 'Eigene Vorlagen mit Platzhaltern, global oder pro Projekt.',
        keywords: ['vorlagen', 'selection', 'file', 'platzhalter', 'bausteine'],
        body: [
            { kind: 'text', text:
                'Unter *Prompt Library* legst du wiederkehrende Anweisungen ab. Im Chat holst du sie '
                + 'mit `/` hervor.' },
            { kind: 'table', head: ['Platzhalter', 'Wird ersetzt durch'], rows: [
                ['`{selection}`', 'Die Markierung im Editor — oder die ganze Datei, wenn nichts markiert ist'],
                ['`{file}`', 'Pfad der offenen Datei']
            ] },
            { kind: 'text', text:
                'Ersetzt wird erst beim Absenden. So bleibt im Eingabefeld sichtbar, welche Vorlage '
                + 'du benutzt. Blöcke mit Geltungsbereich *Workspace* erscheinen nur in diesem Projekt.' }
        ]
    },
    {
        id: 'befehle',
        icon: '⌨️',
        title: 'Befehle',
        summary: 'Alles aus der Befehlspalette erreichbar.',
        keywords: ['command palette', 'strg shift p', 'tastenkürzel', 'shortcut', 'kontextmenü'],
        body: [
            { kind: 'text', text:
                'Befehlspalette mit `Strg` + `Shift` + `P` (macOS: `Cmd` + `Shift` + `P`), dann '
                + '„Coding Forever" tippen.' },
            { kind: 'table', head: ['Befehl', 'Wirkung'], rows: [
                ['Chat Tab öffnen', 'Chat als voller Editor-Tab statt in der Seitenleiste'],
                ['Auswahl an den Chat senden', 'Markierten Code übergeben (auch im Rechtsklick-Menü)'],
                ['Laufenden Agenten stoppen', 'Bricht den aktiven Durchlauf ab'],
                ['MCP-Server neu verbinden', 'Startet die konfigurierten Server neu'],
                ['Protokoll anzeigen', 'Ausgabekanal mit den MCP-Meldungen'],
                ['Node-Projekt erstellen', 'Node, TypeScript, React/Vite oder Next.js'],
                ['Ollama-Instanzen umschalten', 'Wählt, welche Ollama-Rechner aktiv sind'],
                ['Nach Updates suchen', 'Prüft das neueste GitHub-Release']
            ] },
            { kind: 'text', text:
                'Fehler im Editor lassen sich über die Glühbirne („Mit Coding Forever beheben") direkt '
                + 'an den Chat geben.' }
        ]
    },
    {
        id: 'einstellungen',
        icon: '⚙️',
        title: 'Einstellungen',
        summary: 'Was wo eingestellt wird.',
        keywords: ['konfiguration', 'maxturns', 'historydepth', 'schriftgröße', 'schriftart'],
        body: [
            { kind: 'text', text:
                'Darstellung und Keys stecken in den Tabs *Einstellungen* und *AI Engine*. '
                + 'Das Verhalten des Agenten liegt in den VS-Code-Einstellungen unter `codingForever`:' },
            { kind: 'table', head: ['Einstellung', 'Standard', 'Bedeutung'], rows: [
                ['`agent.maxTurns`', '12', 'Maximale Werkzeug-Schritte pro Anfrage'],
                ['`agent.historyDepth`', '20', 'Nachrichten als Gesprächskontext — `0` schaltet das Gedächtnis ab'],
                ['`agent.confirmDangerousCommands`', 'an', 'Rückfrage bei riskanten Befehlen, auch bei Accept All'],
                ['`projectsDirectory`', '—', 'Basisordner für neue Projekte']
            ] },
            { kind: 'text', text:
                'Schriftart und -größe des Chats stehen im Tab *Einstellungen*; die Größe skaliert '
                + 'Text und Abstände gemeinsam.' }
        ]
    },
    {
        id: 'daten',
        icon: '🔒',
        title: 'Wo liegen meine Daten?',
        summary: 'Keys, Chats und was an wen geht.',
        keywords: ['datenschutz', 'privacy', 'telemetrie', 'speicherort', 'sqlite', 'löschen'],
        body: [
            { kind: 'list', items: [
                '**API-Keys** — im Schlüsselbund des Betriebssystems (VS Code SecretStorage). '
                    + 'Nicht im Klartext auf der Platte, nicht im Chat-Fenster.',
                '**Chat-Verlauf und Prompts** — lokal in einer SQLite-Datei im globalStorage der Extension.',
                '**Telemetrie** — keine. Coding Forever sendet nichts an eigene Server.',
                '**An den Anbieter** geht nur, was du schickst: deine Nachricht, der Gesprächsverlauf, '
                    + 'die offene Datei und das, was der Agent über seine Werkzeuge liest.'
            ] },
            { kind: 'note', tone: 'info', text:
                'Einzelne Chats löschst du im Verlaufs-Drawer über das Papierkorb-Symbol.' }
        ]
    },
    {
        id: 'probleme',
        icon: '🩺',
        title: 'Wenn etwas nicht geht',
        summary: 'Die häufigsten Fehlerbilder und ihre Ursache.',
        keywords: ['fehler', 'troubleshooting', 'hilfe', 'geht nicht', 'quota', 'rate limit', 'leer'],
        body: [
            { kind: 'table', head: ['Symptom', 'Ursache & Lösung'], rows: [
                ['„Kein … API-Key hinterlegt"',
                    'Der gewählte Anbieter hat keinen Key. Unter *AI Engine* eintragen oder ein anderes Modell wählen.'],
                ['Antwort bleibt leer',
                    'Meist ein Sicherheitsfilter oder ein Limit beim Anbieter. Die Meldung nennt den Grund im Klartext.'],
                ['`429` oder „quota"',
                    'Tageskontingent erschöpft. Auf einen anderen Anbieter wechseln oder Agent-Modus aus, das spart deutlich.'],
                ['Agent dreht sich im Kreis',
                    '**Stop** drücken. `agent.maxTurns` begrenzt die Schritte; ein genauerer Auftrag hilft mehr als ein höheres Limit.'],
                ['MCP-Server verbindet nicht',
                    '*Protokoll* öffnen. Meist fehlt das Paket (`npx -y` davor) oder eine Variable in `env`.'],
                ['Modell-Liste bleibt leer',
                    'Key falsch oder kein Netz. Bei Ollama prüfen, ob `ollama serve` läuft.'],
                ['Ollama-Rechner „nicht erreichbar“',
                    'Bei einem anderen Rechner muss Ollama mit `OLLAMA_HOST=0.0.0.0` laufen und Port `11434` in der Firewall offen sein. Erreichbarkeit prüft das Dashboard.'],
                ['Chat zu groß oder zu klein',
                    '*Einstellungen* → Größe. Der Regler skaliert Text und Abstände gemeinsam.']
            ] },
            { kind: 'text', text:
                'Bleibt es dabei: *Protokoll anzeigen* aus der Befehlspalette, und die Meldung mit in '
                + 'ein GitHub-Issue packen.' }
        ]
    }
];

/** Durchsucht Titel, Zusammenfassung, Schlagworte und Fließtext. */
export function searchHelp(query: string, topics: HelpTopic[] = HELP_TOPICS): HelpTopic[] {
    const needle = query.trim().toLowerCase();
    if (!needle) { return topics; }

    const terms = needle.split(/\s+/);
    return topics.filter(topic => {
        const haystack = [
            topic.title,
            topic.summary,
            topic.keywords.join(' '),
            topic.body.map(blockText).join(' ')
        ].join(' ').toLowerCase();
        return terms.every(term => haystack.includes(term));
    });
}

/** Der durchsuchbare Text eines Blocks. */
export function blockText(block: HelpBlock): string {
    switch (block.kind) {
        case 'text': return block.text;
        case 'note': return block.text;
        case 'list': return block.items.join(' ');
        case 'code': return block.code;
        case 'table': return [...block.head, ...block.rows.flat()].join(' ');
        default: return '';
    }
}
