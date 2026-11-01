import {
    AgentMessage, ChatResult, LlmProvider, ProviderError, ToolDef, ToolsUnsupportedError
} from '../providers/types';

export interface AgentRunOptions {
    provider: LlmProvider;
    model: string;
    system: string;
    /** Vorheriger Gesprächsverlauf — ohne den hatte der Chat kein Gedächtnis. */
    history: AgentMessage[];
    prompt: string;
    tools: ToolDef[] | null;
    maxTurns: number;
    signal: AbortSignal;
    /**
     * Führt einen Tool-Aufruf aus. Der Loop kennt den Unterschied zwischen
     * eingebauten und MCP-Tools bewusst nicht — das Routing macht der Aufrufer.
     */
    executeTool(name: string, args: Record<string, any>): Promise<any>;
    /** Beschriftung für die Statuszeile, bevor das Tool läuft. */
    toolStatusLabel(name: string, args: Record<string, any>): string;
    /** Ein neuer Assistant-Block beginnt (pro Turn einer). */
    onTurnStart(): void;
    /** Gestreamtes Text-Fragment. */
    onDelta(text: string): void;
    /** Turn fertig — der komplette Text dieses Blocks. */
    onTurnEnd(text: string): void;
    onStatus(text: string): void;
}

export interface AgentRunResult {
    /** Aller Text aller Turns, für Titel-Generierung und Protokoll. */
    text: string;
    aborted: boolean;
    turns: number;
}

export function isAbortError(error: unknown): boolean {
    return (error as any)?.name === 'AbortError';
}

/**
 * Ein einziger Loop für alle Anbieter. Vorher existierte diese Schleife dreimal
 * (Gemini/Groq/Ollama) in extension.ts, jeweils mit eigener Fehlerbehandlung —
 * weshalb Fixes regelmäßig nur in einem der drei Pfade ankamen.
 */
export async function runAgentLoop(opts: AgentRunOptions): Promise<AgentRunResult> {
    const messages: AgentMessage[] = [...opts.history, { role: 'user', content: opts.prompt }];
    let tools = opts.tools;
    let allText = '';

    for (let turn = 0; turn < opts.maxTurns; turn++) {
        if (opts.signal.aborted) { return { text: allText, aborted: true, turns: turn }; }

        opts.onTurnStart();
        let turnText = '';
        const onDelta = (fragment: string) => {
            turnText += fragment;
            opts.onDelta(fragment);
        };

        let result: ChatResult;
        try {
            result = await opts.provider.chat({
                model: opts.model,
                system: opts.system,
                messages,
                tools,
                signal: opts.signal,
                onDelta
            });
        } catch (error) {
            if (isAbortError(error)) {
                opts.onTurnEnd(turnText);
                return { text: allText + turnText, aborted: true, turns: turn };
            }

            // Lehnt das Modell nur Function-Calling ab, läuft der Rest weiter.
            if (error instanceof ToolsUnsupportedError && tools) {
                opts.onTurnEnd(turnText);
                opts.onStatus(
                    `ℹ️ ${opts.provider.label} akzeptiert für ${opts.model} keine eigenen Tools `
                    + '– Anfrage läuft ohne Datei-/Terminal-Zugriff weiter.'
                );
                tools = null;
                turn--;
                continue;
            }

            opts.onTurnEnd(turnText);
            throw error;
        }

        allText += (allText && result.text ? '\n\n' : '') + result.text;
        opts.onTurnEnd(result.text);

        if (result.toolCalls.length === 0) {
            if (!result.text.trim()) {
                opts.onStatus('⚠️ Das Modell hat eine leere Antwort geliefert.');
            }
            return { text: allText, aborted: false, turns: turn + 1 };
        }

        messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });

        for (const call of result.toolCalls) {
            if (opts.signal.aborted) { return { text: allText, aborted: true, turns: turn + 1 }; }

            opts.onStatus(opts.toolStatusLabel(call.name, call.args));
            const toolResult = await opts.executeTool(call.name, call.args);

            messages.push({
                role: 'tool',
                content: JSON.stringify(toolResult),
                toolCallId: call.id,
                toolName: call.name
            });
        }
    }

    opts.onStatus(
        `⚠️ Maximale Anzahl an Schritten (${opts.maxTurns}) erreicht, ohne abzuschließen. `
        + 'Das Limit lässt sich in den Einstellungen unter codingForever.agent.maxTurns erhöhen.'
    );
    return { text: allText, aborted: false, turns: opts.maxTurns };
}

/**
 * Kurzen Chat-Titel vom Modell erzeugen. Vorher hieß jede Session "New Chat",
 * was den Verlauf praktisch unbenutzbar machte.
 */
export async function generateChatTitle(
    provider: LlmProvider,
    model: string,
    userPrompt: string,
    answer: string,
    signal: AbortSignal
): Promise<string> {
    const fallback = userPrompt.replace(/\s+/g, ' ').trim().slice(0, 48) || 'Neuer Chat';

    try {
        const result = await provider.chat({
            model,
            system: 'Du erzeugst Überschriften für Chat-Verläufe. Antworte mit maximal fünf Wörtern '
                + 'auf Deutsch, ohne Anführungszeichen, ohne Satzzeichen am Ende, ohne Erklärung.',
            messages: [{
                role: 'user',
                content: `Frage: ${userPrompt.slice(0, 500)}\n\nAntwort: ${answer.slice(0, 500)}\n\nÜberschrift:`
            }],
            tools: null,
            signal
        });

        const title = result.text
            .replace(/[\r\n]+/g, ' ')
            .replace(/^["'„“\s]+|["'“”\s.:!?]+$/g, '')
            .trim();

        // Manche kleinen Modelle liefern statt eines Titels einen ganzen Absatz.
        if (!title || title.length > 60 || title.split(/\s+/).length > 8) { return fallback; }
        return title;
    } catch (error) {
        if (error instanceof ProviderError || isAbortError(error)) { return fallback; }
        return fallback;
    }
}
