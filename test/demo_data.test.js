const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const demoDataModule = require('../demo-data.js');

test('G-Connect Demo / Mock Data Engine Suite', async (t) => {
    const { ENABLE_DEMO_DATA, DEMO_DATA, applyDemoDataIfEnabled, clearDemoData } = demoDataModule;

    await t.test('Module exports required interface and flag is disabled by default', () => {
        assert.strictEqual(typeof ENABLE_DEMO_DATA, 'boolean');
        assert.strictEqual(ENABLE_DEMO_DATA, false, 'Demo data should be disabled by default to restore pure backend');
        assert.ok(DEMO_DATA, 'DEMO_DATA must be defined');
        assert.strictEqual(typeof applyDemoDataIfEnabled, 'function');
        assert.strictEqual(typeof clearDemoData, 'function');
    });

    await t.test('DEMO_DATA.voti contains all 11 canonical subjects', () => {
        const canonicalSubjects = [
            'Italiano',
            'Storia Triennio',
            'Disegno e Storia Dell\'Arte Triennio',
            'Filosofia',
            'Educazione Civica',
            'Inglese',
            'Informatica',
            'Scienze Naturali',
            'Fisica',
            'Matematica',
            'Scienze Motorie e Sportive'
        ];
        const subjectSet = new Set(DEMO_DATA.voti.map(v => v.materia));
        for (const subj of canonicalSubjects) {
            assert.ok(subjectSet.has(subj), `DEMO_DATA.voti missing canonical subject: ${subj}`);
        }
    });

    await t.test('DEMO_DATA.voti contains exclusively current 2026/27 votes with no historical 2025/26 votes', () => {
        const votes2026 = DEMO_DATA.voti.filter(v => v.data && v.data.startsWith('2026-09'));
        const votes2025 = DEMO_DATA.voti.filter(v => v.data && (v.data.startsWith('2025') || v.data.startsWith('2026-01') || v.data.startsWith('2026-05')));
        assert.ok(votes2026.length >= 15, 'Must have realistic votes for current school year 2026/27');
        assert.strictEqual(votes2025.length, 0, 'Must NOT contain any historical 2025/26 votes');
    });

    await t.test('DEMO_DATA.voti includes both passing grades and failing grades for recovery testing', () => {
        const failingVotes = DEMO_DATA.voti.filter(v => typeof v.valore === 'number' && v.valore < 6);
        const passingVotes = DEMO_DATA.voti.filter(v => typeof v.valore === 'number' && v.valore >= 6);
        assert.ok(failingVotes.length >= 2, 'Should include at least 2 failing grades for recovery and goal testing');
        assert.ok(passingVotes.length >= 12, 'Should include ample passing grades');
    });

    await t.test('DEMO_DATA.tasks, verifiche, activities, and assenzeData are populated', () => {
        assert.ok(Array.isArray(DEMO_DATA.tasks) && DEMO_DATA.tasks.length >= 5, 'Tasks must be populated');
        assert.ok(Array.isArray(DEMO_DATA.verifiche) && DEMO_DATA.verifiche.length >= 3, 'Verifiche must be populated');
        assert.ok(Array.isArray(DEMO_DATA.classActivities) && DEMO_DATA.classActivities.length >= 3, 'Activities must be populated');
        assert.ok(DEMO_DATA.assenzeData, 'assenzeData must be populated');
        assert.strictEqual(DEMO_DATA.assenzeData.totaleAssenze, 1);
        assert.strictEqual(DEMO_DATA.assenzeData.totaleRitardi, 1);
        assert.strictEqual(DEMO_DATA.assenzeData.totaleUscite, 1);
    });

    await t.test('applyDemoDataIfEnabled returns false when flag is disabled (no force)', () => {
        const state = { voti: [], tasks: [], verifiche: [], classActivities: [], assenzeData: null };
        const applied = applyDemoDataIfEnabled(state);
        assert.strictEqual(applied, false, 'Should not apply demo data when flag is disabled');
        assert.strictEqual(state.voti.length, 0, 'State must remain empty');
    });

    await t.test('applyDemoDataIfEnabled hydrates state with force=true and STRICTLY preserves real circolari', () => {
        const realCircolari = [
            { id: 999, title: 'Circolare Reale n. 42', link: 'https://istitutogandhi.edu.it/circ42' }
        ];
        const state = {
            voti: [],
            tasks: [],
            verifiche: [],
            classActivities: [],
            assenzeData: null,
            circolari: realCircolari
        };

        const applied = applyDemoDataIfEnabled(state, true);
        assert.strictEqual(applied, true);
        assert.ok(state.voti.length > 0, 'Voti should be populated');
        assert.ok(state.tasks.length > 0, 'Tasks should be populated');
        assert.ok(state.verifiche.length > 0, 'Verifiche should be populated');
        assert.ok(state.classActivities.length > 0, 'Class activities should be populated');
        assert.ok(state.assenzeData !== null, 'Assenze data should be populated');

        // CRITICAL: Circolari MUST remain untouched!
        assert.strictEqual(state.circolari, realCircolari, 'Real circolari must be strictly preserved');
        assert.strictEqual(state.circolari.length, 1);
        assert.strictEqual(state.circolari[0].title, 'Circolare Reale n. 42');
    });

    await t.test('clearDemoData cleans state and local storage', () => {
        const state = {
            voti: [{ id: 'fake' }],
            tasks: [{ id: 'fake' }],
            verifiche: [{ id: 'fake' }],
            classActivities: [{ id: 'fake' }],
            assenzeData: { totaleAssenze: 1 }
        };
        clearDemoData(state);
        assert.strictEqual(state.voti.length, 0);
        assert.strictEqual(state.tasks.length, 0);
        assert.strictEqual(state.verifiche.length, 0);
        assert.strictEqual(state.classActivities.length, 0);
        assert.strictEqual(state.assenzeData, null);
    });

    await t.test('purgeAllDemoData purges demo items from state while preserving real items', () => {
        const { purgeAllDemoData } = demoDataModule;
        assert.strictEqual(typeof purgeAllDemoData, 'function');
        const state = {
            voti: [
                { id: 'v26-ita-1', materia: 'Italiano', valore: 8 },
                { id: 'real-voto-101', materia: 'Matematica', valore: 9 }
            ],
            tasks: [
                { id: 'task-demo-today-1', text: 'Demo task' },
                { id: 'real-task-202', text: 'Real task' }
            ],
            verifiche: [
                { id: 'verif-demo-1', subject: 'Fisica' },
                { id: 'real-verif-303', subject: 'Italiano' }
            ],
            classActivities: [
                { id: 'act-demo-1', title: 'Demo act' },
                { id: 'real-act-404', title: 'Real act' }
            ],
            assenzeData: {
                totaleAssenze: 1,
                totaleRitardi: 1,
                totaleUscite: 1,
                oreAssenzaTotali: 5,
                daGiustificare: 0
            }
        };

        purgeAllDemoData(state);

        assert.strictEqual(state.voti.length, 1, 'Only real vote must remain');
        assert.strictEqual(state.voti[0].id, 'real-voto-101');
        assert.strictEqual(state.tasks.length, 1, 'Only real task must remain');
        assert.strictEqual(state.tasks[0].id, 'real-task-202');
        assert.strictEqual(state.verifiche.length, 1, 'Only real verifica must remain');
        assert.strictEqual(state.verifiche[0].id, 'real-verif-303');
        assert.strictEqual(state.classActivities.length, 1, 'Only real activity must remain');
        assert.strictEqual(state.classActivities[0].id, 'real-act-404');
        assert.strictEqual(state.assenzeData, null, 'Demo assenze must be nulled');
    });
});
