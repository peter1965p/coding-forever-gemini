import { readErrorMessage, readNdjson } from '../lib/stream';
import { toOpenAiMessages, toOpenAiTools } from './openaiCompat';
import {
    ChatRequest, ChatResult, LlmProvider, ModelInfo, parseToolArgs, ProviderError, ToolCall
} from './types';

/** Entfernt ein versehentlich mitkopiertes /v1 aus der Ollama-Basis-URL. */
export function normalizeOllamaUrl(baseUrl: string): string {
    return (baseUrl || 'http://localhost:11434').replace(/\/+$/, '').replace(/\/v1$/, '');
}

export class OllamaProvider implements LlmProvider {
    private readonly baseUrl: string;

    /** `label` nennt die Instanz, damit man im Chat sieht, welcher Rechner antwortet. */
    constructor(baseUrl: string, readonly label: string = 'Ollama') {
        this.baseUrl = normalizeOllamaUrl(baseUrl);
    }

    async chat(req: ChatRequest): Promise<ChatResult> {
        const body: any = {
            model: req.model,
            messages: toOpenAiMessages(req.system, req.messages, false),
            stream: true
        };
        // Modelle ohne Tool-Support ignorieren das Feld bei Ollama einfach.
        if (req.tools?.length) { body.tools = toOpenAiTools(req.tools); }

        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: req.signal
            });
        } catch (e: any) {
            if (e?.name === 'AbortError') { throw e; }
            throw new ProviderError(
                `${this.label} unter ${this.baseUrl} nicht erreichbar: ${e.message}. `
                + 'Läuft "ollama serve" — und lauscht es bei einem anderen Rechner mit OLLAMA_HOST=0.0.0.0?'
            );
        }

        if (!res.ok) {
            throw new ProviderError(`${this.label} (${res.status}): ${await readErrorMessage(res)}`);
        }

        let text = '';
        const toolCalls: ToolCall[] = [];

        for await (const chunk of readNdjson(res)) {
            if (chunk.error) {
                throw new ProviderError(`${this.label}: ${chunk.error}`);
            }

            const content = chunk.message?.content;
            if (typeof content === 'string' && content.length > 0) {
                text += content;
                req.onDelta?.(content);
            }

            // Ollama liefert tool_calls komplett pro Chunk (nicht fragmentiert wie OpenAI).
            for (const call of chunk.message?.tool_calls ?? []) {
                const name = call.function?.name;
                if (!name) { continue; }
                toolCalls.push({
                    id: `ollama_${toolCalls.length}_${Date.now()}`,
                    name,
                    args: parseToolArgs(call.function?.arguments)
                });
            }
        }

        return { text, toolCalls };
    }
}

/** Wie lange ein Statuscheck auf eine Instanz wartet, bevor sie als nicht erreichbar gilt. */
export const OLLAMA_PROBE_TIMEOUT_MS = 5000;

/**
 * Installierte Modelle auflisten (/api/tags). Der Timeout ist wichtig: bei einem
 * Rechner im Netzwerk, der gerade aus ist, hängt fetch sonst minutenlang — und
 * mit ihm die komplette Modellliste aller Anbieter.
 */
export async function fetchOllamaModels(
    baseUrl: string,
    timeoutMs: number = OLLAMA_PROBE_TIMEOUT_MS
): Promise<ModelInfo[]> {
    const url = normalizeOllamaUrl(baseUrl);
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
        throw new ProviderError(`Ollama Tags-Endpoint antwortete mit ${res.status}`);
    }

    const data: any = await res.json();
    const models: ModelInfo[] = (Array.isArray(data.models) ? data.models : [])
        .map((m: any) => String(m.name || ''))
        .filter((id: string) => id.length > 0)
        .map((id: string) => ({ id }));

    models.sort((a, b) => a.id.localeCompare(b.id));
    return models;
}

/* ==========================================================
 * INSTANZEN
 * ========================================================== */

/**
 * Ein konfigurierter Ollama-Server. Meist der eigene Rechner, bei schwacher
 * Hardware aber ein stärkerer im Netzwerk — deshalb mehrere, einzeln schaltbar.
 */
export interface OllamaInstance {
    /** Stabile Kennung, Teil der Modell-ID im Dropdown (`ollama:<id>:<modell>`). */
    id: string;
    name: string;
    url: string;
    enabled: boolean;
}

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/** "Gaming PC" → "gaming-pc". Ohne ':' und '/', weil die ID in Modell-IDs steckt. */
export function slugifyInstanceId(name: string): string {
    const slug = name
        .toLowerCase()
        // Umlaute vor dem Entfernen der Akzente ausschreiben: "Büro" → "buero", nicht "buro".
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'instanz';
}

/** Ob die Adresse auf den eigenen Rechner zeigt — nur dort passen Hardware-Empfehlungen. */
export function isLoopbackUrl(url: string): boolean {
    try {
        const host = new URL(normalizeOllamaUrl(url)).hostname.toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    } catch {
        return false;
    }
}

/**
 * Macht aus beliebiger Eingabe (Webview, alte Einstellungen) eine saubere Liste:
 * gültige http(s)-Adressen, eindeutige IDs, keine Duplikate, Standard-Port ergänzt.
 */
export function normalizeInstances(raw: unknown): OllamaInstance[] {
    if (!Array.isArray(raw)) { return []; }

    const out: OllamaInstance[] = [];
    const used = new Set<string>();

    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') { continue; }
        const candidate = entry as Partial<OllamaInstance>;

        let url = String(candidate.url ?? '').trim();
        if (!url) { continue; }
        // "192.168.1.20" oder "gaming-pc:11434" ohne Schema ist eine häufige Eingabe.
        if (!/^https?:\/\//i.test(url)) { url = `http://${url}`; }

        try {
            const parsed = new URL(url);
            if (!parsed.port && parsed.protocol === 'http:') { parsed.port = '11434'; }
            url = normalizeOllamaUrl(parsed.toString());
        } catch {
            continue;
        }

        const name = String(candidate.name ?? '').trim() || new URL(url).hostname;

        // Eindeutige ID: gewünschte behalten, sonst aus dem Namen ableiten, Kollisionen nummerieren.
        const base = slugifyInstanceId(String(candidate.id ?? '').trim() || name);
        let id = base;
        for (let n = 2; used.has(id); n++) { id = `${base}-${n}`; }
        used.add(id);

        out.push({ id, name, url, enabled: candidate.enabled === true });
    }

    return out;
}

export interface OllamaStatus {
    id: string;
    reachable: boolean;
    latencyMs?: number;
    modelCount?: number;
    version?: string;
    error?: string;
}

/** Erreichbarkeit, Antwortzeit und Modellzahl einer Instanz — für den Schalter im Dashboard. */
export async function probeOllama(
    instance: OllamaInstance,
    timeoutMs: number = OLLAMA_PROBE_TIMEOUT_MS
): Promise<OllamaStatus> {
    const started = Date.now();
    try {
        const models = await fetchOllamaModels(instance.url, timeoutMs);
        const latencyMs = Date.now() - started;

        let version: string | undefined;
        try {
            const res = await fetch(`${normalizeOllamaUrl(instance.url)}/api/version`, {
                signal: AbortSignal.timeout(timeoutMs)
            });
            if (res.ok) { version = String(((await res.json()) as any).version ?? '') || undefined; }
        } catch { /* Version ist nett, aber nicht nötig */ }

        return { id: instance.id, reachable: true, latencyMs, modelCount: models.length, version };
    } catch (e: any) {
        const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        return {
            id: instance.id,
            reachable: false,
            error: timedOut
                ? `Keine Antwort innerhalb von ${timeoutMs / 1000} s`
                : String(e?.cause?.code ?? e?.message ?? e)
        };
    }
}
