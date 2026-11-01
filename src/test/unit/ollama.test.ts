import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { listAllModels, resolveModel, ProviderCredentials } from '../../providers';
import {
    fetchOllamaModels, isLoopbackUrl, normalizeInstances, OllamaInstance, probeOllama, slugifyInstanceId
} from '../../providers/ollama';
import { DEFAULT_OLLAMA_INSTANCES, SettingsStore } from '../../lib/settings';

function creds(instances: OllamaInstance[]): ProviderCredentials {
    return { geminiApiKey: '', groqApiKey: '', openaiApiKey: '', claudeApiKey: '', ollamaInstances: instances };
}

/** Ein Server, der sich wie Ollama meldet. */
function startFakeOllama(models: string[]): Promise<{ url: string; close: () => Promise<void> }> {
    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/tags') {
            res.end(JSON.stringify({ models: models.map(name => ({ name })) }));
        } else if (req.url === '/api/version') {
            res.end(JSON.stringify({ version: '0.9.9' }));
        } else {
            res.writeHead(404).end();
        }
    });
    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => resolve({
            url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); })
        }));
    });
}

/** Ein Server, der Verbindungen annimmt und nie antwortet — wie ein Rechner, der gerade haengt. */
function startSilentServer(): Promise<{ url: string; close: () => Promise<void> }> {
    const server = http.createServer(() => { /* absichtlich keine Antwort */ });
    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => resolve({
            url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); })
        }));
    });
}

describe('slugifyInstanceId', () => {
    it('macht aus Namen saubere IDs ohne Doppelpunkt und Schraegstrich', () => {
        assert.equal(slugifyInstanceId('Gaming PC'), 'gaming-pc');
        assert.equal(slugifyInstanceId('Büro / Server: 2'), 'buero-server-2');
        assert.equal(slugifyInstanceId('Straße'), 'strasse');
        assert.equal(slugifyInstanceId('!!!'), 'instanz');
    });
});

describe('isLoopbackUrl', () => {
    it('erkennt den eigenen Rechner', () => {
        assert.equal(isLoopbackUrl('http://localhost:11434'), true);
        assert.equal(isLoopbackUrl('http://127.0.0.1:11434'), true);
        assert.equal(isLoopbackUrl('http://192.168.1.20:11434'), false);
        assert.equal(isLoopbackUrl('http://gaming-pc:11434'), false);
        assert.equal(isLoopbackUrl('kaputt'), false);
    });
});

describe('normalizeInstances', () => {
    it('ergaenzt Schema und Standard-Port', () => {
        const [instance] = normalizeInstances([{ name: 'PC', url: '192.168.1.20' }]);
        assert.equal(instance.url, 'http://192.168.1.20:11434');
    });

    it('behaelt einen angegebenen Port und entfernt /v1 und Schraegstriche', () => {
        const [a] = normalizeInstances([{ name: 'a', url: 'http://pc:9999/' }]);
        const [b] = normalizeInstances([{ name: 'b', url: 'http://pc:11434/v1' }]);
        assert.equal(a.url, 'http://pc:9999');
        assert.equal(b.url, 'http://pc:11434');
    });

    it('vergibt eindeutige IDs bei gleichen Namen', () => {
        const list = normalizeInstances([
            { name: 'PC', url: 'http://a' }, { name: 'PC', url: 'http://b' }, { name: 'PC', url: 'http://c' }
        ]);
        assert.deepEqual(list.map(i => i.id), ['pc', 'pc-2', 'pc-3']);
    });

    it('nimmt den Hostnamen, wenn kein Name gesetzt ist', () => {
        const [instance] = normalizeInstances([{ url: 'http://server.lan:11434' }]);
        assert.equal(instance.name, 'server.lan');
    });

    it('verwirft Eintraege ohne brauchbare Adresse und Nicht-Objekte', () => {
        assert.deepEqual(normalizeInstances([{ name: 'x' }, { name: 'y', url: '   ' }, null, 'text', 42]), []);
        assert.deepEqual(normalizeInstances('kein array'), []);
        assert.deepEqual(normalizeInstances(undefined), []);
    });

    it('schaltet nur bei echtem true ein', () => {
        const list = normalizeInstances([
            { name: 'a', url: 'http://a', enabled: true },
            { name: 'b', url: 'http://b', enabled: 'true' },
            { name: 'c', url: 'http://c' }
        ]);
        assert.deepEqual(list.map(i => i.enabled), [true, false, false]);
    });

    it('ist idempotent', () => {
        const once = normalizeInstances([{ name: 'Gaming PC', url: '10.0.0.5', enabled: true }]);
        assert.deepEqual(normalizeInstances(once), once);
    });
});

describe('Ollama gegen einen echten HTTP-Server', () => {
    let fake: Awaited<ReturnType<typeof startFakeOllama>>;
    let silent: Awaited<ReturnType<typeof startSilentServer>>;

    before(async () => {
        fake = await startFakeOllama(['qwen2.5-coder:7b', 'llama3.2:latest']);
        silent = await startSilentServer();
    });
    after(async () => { await fake.close(); await silent.close(); });

    it('liest die Modelle', async () => {
        const models = await fetchOllamaModels(fake.url);
        assert.deepEqual(models.map(m => m.id), ['llama3.2:latest', 'qwen2.5-coder:7b']);
    });

    it('meldet Erreichbarkeit, Antwortzeit, Modellzahl und Version', async () => {
        const status = await probeOllama({ id: 'x', name: 'x', url: fake.url, enabled: true });
        assert.equal(status.reachable, true);
        assert.equal(status.modelCount, 2);
        assert.equal(status.version, '0.9.9');
        assert.ok(typeof status.latencyMs === 'number');
    });

    it('gibt bei einem haengenden Rechner nach dem Timeout auf, statt ewig zu warten', async () => {
        const started = Date.now();
        const status = await probeOllama({ id: 'x', name: 'x', url: silent.url, enabled: true }, 300);
        assert.equal(status.reachable, false);
        assert.ok(/Keine Antwort/.test(status.error ?? ''), status.error);
        assert.ok(Date.now() - started < 3000, 'haette nach ~300 ms abbrechen muessen');
    });

    it('meldet einen Rechner ohne Server als nicht erreichbar', async () => {
        const status = await probeOllama({ id: 'x', name: 'x', url: 'http://127.0.0.1:1', enabled: true }, 1000);
        assert.equal(status.reachable, false);
        assert.ok(status.error);
    });

    it('listAllModels bildet eine Gruppe pro eingeschalteter Instanz', async () => {
        const groups = await listAllModels(creds([
            { id: 'lokal', name: 'Dieser Rechner', url: fake.url, enabled: true },
            { id: 'aus', name: 'Ausgeschaltet', url: fake.url, enabled: false },
            { id: 'tot', name: 'Tot', url: 'http://127.0.0.1:1', enabled: true }
        ]));
        const ollama = groups.filter(g => g.providerId === 'local');
        assert.deepEqual(ollama.map(g => g.instanceId).sort(), ['lokal', 'tot']);

        const lokal = ollama.find(g => g.instanceId === 'lokal')!;
        assert.equal(lokal.label, 'Ollama · Dieser Rechner');
        assert.equal(lokal.models.length, 2);

        const tot = ollama.find(g => g.instanceId === 'tot')!;
        assert.equal(tot.models.length, 0);
        assert.ok(/nicht erreichbar/.test(tot.hint ?? ''));
    });

    it('ein haengender Rechner haelt die Modellliste nicht auf', async () => {
        const started = Date.now();
        // Gleicher Weg wie in listAllModels, nur mit kurzem Timeout statt der 5 s.
        const results = await Promise.all([
            fetchOllamaModels(fake.url, 300),
            fetchOllamaModels(silent.url, 300).catch(() => [])
        ]);
        assert.equal(results[0].length, 2);
        assert.ok(Date.now() - started < 3000);
    });

    it('zeigt einen Hinweis, wenn keine Instanz eingeschaltet ist', async () => {
        const groups = await listAllModels(creds([
            { id: 'lokal', name: 'Lokal', url: fake.url, enabled: false }
        ]));
        const ollama = groups.filter(g => g.providerId === 'local');
        assert.equal(ollama.length, 1);
        assert.equal(ollama[0].models.length, 0);
        assert.ok(ollama[0].hint);
    });
});

describe('resolveModel mit mehreren Ollama-Instanzen', () => {
    const instances: OllamaInstance[] = [
        { id: 'lokal', name: 'Dieser Rechner', url: 'http://localhost:11434', enabled: true },
        { id: 'gaming-pc', name: 'Gaming PC', url: 'http://192.168.1.20:11434', enabled: true },
        { id: 'alt', name: 'Alter Server', url: 'http://192.168.1.30:11434', enabled: false }
    ];

    it('waehlt die Instanz aus der Modell-ID', () => {
        const resolved = resolveModel('ollama:gaming-pc:qwen2.5-coder:32b', creds(instances));
        assert.equal(resolved.providerId, 'local');
        assert.equal(resolved.instanceId, 'gaming-pc');
        assert.equal(resolved.model, 'qwen2.5-coder:32b');
        assert.equal(resolved.provider.label, 'Ollama · Gaming PC');
    });

    it('nimmt bei einer alten local:-ID die erste eingeschaltete Instanz', () => {
        const resolved = resolveModel('local:llama3.2', creds(instances));
        assert.equal(resolved.instanceId, 'lokal');
    });

    it('verweigert eine ausgeschaltete Instanz mit klarer Anweisung', () => {
        assert.throws(() => resolveModel('ollama:alt:llama3.2', creds(instances)), /ausgeschaltet/);
    });

    it('meldet eine nicht mehr vorhandene Instanz', () => {
        assert.throws(() => resolveModel('ollama:geloescht:llama3.2', creds(instances)), /gibt es nicht mehr/);
    });

    it('meldet fehlende Instanzen bei alter ID ohne Treffer', () => {
        assert.throws(() => resolveModel('local:llama3.2', creds([])), /Keine Ollama-Instanz/);
    });
});

/** Minimaler Ersatz fuer den ExtensionContext. */
function fakeContext(initial: Record<string, unknown> = {}) {
    const store = new Map<string, unknown>(Object.entries(initial));
    return {
        store,
        context: {
            globalState: {
                get: (key: string) => store.get(key),
                update: async (key: string, value: unknown) => {
                    if (value === undefined) { store.delete(key); } else { store.set(key, value); }
                }
            },
            secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined }
        } as any
    };
}

describe('SettingsStore: Ollama-Migration', () => {
    it('uebernimmt die alte Einzel-Instanz samt Adresse und Schalterstellung', async () => {
        const { context, store } = fakeContext({
            localEnabled: true, baseUrl: 'http://192.168.1.20:11434', modelName: 'llama3.2'
        });
        const settings = new SettingsStore(context);
        await settings.migrateOllama();

        const [instance] = settings.getPreferences().ollamaInstances;
        assert.equal(instance.url, 'http://192.168.1.20:11434');
        assert.equal(instance.enabled, true);
        assert.equal(instance.id, 'lokal');
        // Alte Schluessel werden aufgeraeumt.
        assert.equal(store.has('baseUrl'), false);
        assert.equal(store.has('localEnabled'), false);
        assert.equal(store.has('modelName'), false);
    });

    it('bleibt ausgeschaltet, wenn Ollama vorher aus war', async () => {
        const { context } = fakeContext({ localEnabled: false, baseUrl: 'http://localhost:11434' });
        const settings = new SettingsStore(context);
        await settings.migrateOllama();
        assert.equal(settings.getPreferences().ollamaInstances[0].enabled, false);
    });

    it('fasst eine bestehende neue Liste nicht an', async () => {
        const existing = [{ id: 'pc', name: 'PC', url: 'http://pc:11434', enabled: true }];
        const { context } = fakeContext({ ollamaInstances: existing, baseUrl: 'http://alt:11434' });
        const settings = new SettingsStore(context);
        await settings.migrateOllama();
        assert.deepEqual(settings.getPreferences().ollamaInstances, existing);
    });

    it('legt fuer Neuinstallationen eine ausgeschaltete Instanz an', () => {
        const { context } = fakeContext();
        const settings = new SettingsStore(context);
        assert.deepEqual(settings.getPreferences().ollamaInstances, DEFAULT_OLLAMA_INSTANCES);
        assert.equal(settings.getPreferences().ollamaInstances[0].enabled, false);
    });

    it('laesst eine absichtlich geleerte Liste leer', async () => {
        const { context } = fakeContext();
        const settings = new SettingsStore(context);
        await settings.updatePreferences({ ollamaInstances: [] });
        assert.deepEqual(settings.getPreferences().ollamaInstances, []);
    });

    it('normalisiert beim Speichern, statt dem Webview zu vertrauen', async () => {
        const { context } = fakeContext();
        const settings = new SettingsStore(context);
        await settings.updatePreferences({
            ollamaInstances: [{ id: '../boese:id', name: 'X', url: '10.0.0.9', enabled: true }] as any
        });
        const [instance] = settings.getPreferences().ollamaInstances;
        assert.equal(instance.url, 'http://10.0.0.9:11434');
        assert.ok(!/[:/]/.test(instance.id), `ID enthaelt Sonderzeichen: ${instance.id}`);
    });

    it('schaltet eine einzelne Instanz um', async () => {
        const { context } = fakeContext({
            ollamaInstances: [
                { id: 'a', name: 'A', url: 'http://a:11434', enabled: false },
                { id: 'b', name: 'B', url: 'http://b:11434', enabled: false }
            ]
        });
        const settings = new SettingsStore(context);
        const next = await settings.setOllamaInstanceEnabled('b', true);
        assert.deepEqual(next.map(i => i.enabled), [false, true]);
        assert.deepEqual(settings.getPreferences().ollamaInstances.map(i => i.enabled), [false, true]);
    });
});
