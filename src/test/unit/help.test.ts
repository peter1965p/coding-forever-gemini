import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { blockText, HELP_TOPICS, searchHelp } from '../../pages/helpContent';

describe('Hilfe-Inhalte', () => {
    it('hat eindeutige IDs', () => {
        const ids = HELP_TOPICS.map(topic => topic.id);
        assert.equal(new Set(ids).size, ids.length);
    });

    it('hat ueberall Titel, Zusammenfassung und Inhalt', () => {
        for (const topic of HELP_TOPICS) {
            assert.ok(topic.title.length > 0, `${topic.id}: kein Titel`);
            assert.ok(topic.summary.length > 0, `${topic.id}: keine Zusammenfassung`);
            assert.ok(topic.body.length > 0, `${topic.id}: kein Inhalt`);
            assert.ok(topic.icon.length > 0, `${topic.id}: kein Symbol`);
        }
    });

    it('hat in jeder Tabelle gleich viele Spalten wie Kopfzellen', () => {
        for (const topic of HELP_TOPICS) {
            for (const block of topic.body) {
                if (block.kind !== 'table') { continue; }
                for (const row of block.rows) {
                    assert.equal(row.length, block.head.length,
                        `${topic.id}: Zeile "${row[0]}" passt nicht zum Tabellenkopf`);
                }
            }
        }
    });

    it('enthaelt gueltiges JSON in den Code-Beispielen', () => {
        for (const topic of HELP_TOPICS) {
            for (const block of topic.body) {
                if (block.kind !== 'code') { continue; }
                assert.doesNotThrow(() => JSON.parse(block.code), `${topic.id}: Beispiel ist kein JSON`);
            }
        }
    });
});

describe('searchHelp', () => {
    it('gibt ohne Suchbegriff alles zurueck', () => {
        assert.equal(searchHelp('').length, HELP_TOPICS.length);
        assert.equal(searchHelp('   ').length, HELP_TOPICS.length);
    });

    it('findet ueber den Titel', () => {
        const hits = searchHelp('mcp');
        assert.ok(hits.some(topic => topic.id === 'mcp'));
    });

    it('findet ueber Schlagworte, die im Text nicht vorkommen', () => {
        assert.ok(searchHelp('datenschutz').some(topic => topic.id === 'daten'));
        assert.ok(searchHelp('shortcut').some(topic => topic.id === 'befehle'));
    });

    it('findet ueber den Fliesstext', () => {
        assert.ok(searchHelp('quota').some(topic => topic.id === 'probleme'));
        assert.ok(searchHelp('symlink').some(topic => topic.id === 'sicherheit'));
    });

    it('verknuepft mehrere Begriffe mit UND', () => {
        assert.deepEqual(searchHelp('mcp dateisystem').map(t => t.id), ['mcp']);
        assert.deepEqual(searchHelp('mcp gibtsnichtxyz'), []);
    });

    it('ignoriert Gross- und Kleinschreibung', () => {
        assert.deepEqual(searchHelp('ACCEPT ALL').map(t => t.id), searchHelp('accept all').map(t => t.id));
    });

    it('liefert fuer jedes Thema mindestens einen Treffer ueber seinen Titel', () => {
        for (const topic of HELP_TOPICS) {
            const hits = searchHelp(topic.title);
            assert.ok(hits.some(hit => hit.id === topic.id), `${topic.id} findet sich nicht selbst`);
        }
    });
});

describe('blockText', () => {
    it('macht jeden Blocktyp durchsuchbar', () => {
        assert.equal(blockText({ kind: 'text', text: 'abc' }), 'abc');
        assert.equal(blockText({ kind: 'note', tone: 'info', text: 'abc' }), 'abc');
        assert.equal(blockText({ kind: 'list', items: ['a', 'b'] }), 'a b');
        assert.equal(blockText({ kind: 'code', code: '{}' }), '{}');
        assert.equal(blockText({ kind: 'table', head: ['h'], rows: [['r']] }), 'h r');
    });
});
