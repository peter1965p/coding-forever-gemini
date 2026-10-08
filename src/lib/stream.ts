/**
 * Minimale Stream-Leser für die Antworten der LLM-Endpunkte.
 * Node 18+ (und damit der VS Code Extension Host) liefert bei fetch einen
 * WHATWG-ReadableStream — den lesen wir hier zeilenweise aus.
 */

/** Liest einen fetch-Response Zeile für Zeile. */
export async function* readLines(res: Response): AsyncGenerator<string> {
    const body: any = res.body;
    if (!body?.getReader) { return; }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) { break; }
            buffer += decoder.decode(value, { stream: true });

            let newline: number;
            while ((newline = buffer.indexOf('\n')) >= 0) {
                yield buffer.slice(0, newline).replace(/\r$/, '');
                buffer = buffer.slice(newline + 1);
            }
        }
    } finally {
        try { reader.releaseLock(); } catch { /* Stream schon geschlossen */ }
    }

    if (buffer.trim().length > 0) { yield buffer; }
}

/** Server-Sent Events: gibt die geparsten JSON-Payloads der data:-Zeilen zurück. */
export async function* readSse(res: Response): AsyncGenerator<any> {
    for await (const line of readLines(res)) {
        if (!line.startsWith('data:')) { continue; }
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') { continue; }
        try {
            yield JSON.parse(payload);
        } catch {
            // Ein einzelner unparsbarer Chunk darf den Stream nicht abbrechen.
        }
    }
}

/** NDJSON (Ollama): eine vollständige JSON-Zeile pro Chunk, ohne data:-Präfix. */
export async function* readNdjson(res: Response): AsyncGenerator<any> {
    for await (const line of readLines(res)) {
        const trimmed = line.trim();
        if (!trimmed) { continue; }
        try {
            yield JSON.parse(trimmed);
        } catch {
            // dito
        }
    }
}

/** Fehlertext aus einer nicht-ok Antwort ziehen, egal ob JSON oder Plaintext. */
export async function readErrorMessage(res: Response): Promise<string> {
    const raw = await res.text().catch(() => '');
    if (!raw) { return res.statusText || `HTTP ${res.status}`; }
    try {
        const data = JSON.parse(raw);
        return data?.error?.message || data?.error || data?.message || raw.slice(0, 400);
    } catch {
        return raw.slice(0, 400);
    }
}
