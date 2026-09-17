const { test, describe } = require('node:test');
const assert = require('node:assert');
const { extractHomeworkFromDashboard } = require('../lib/argo');

describe('Homework Scraping & Parsing Engine (lib/argo.js)', () => {
    test('extracts homework from root-level compiti array', () => {
        const dashboard = {
            compiti: [
                {
                    desMateria: 'Matematica',
                    compito: 'Esercizi pag. 104 n. 1, 2, 3',
                    dataConsegna: '2026-09-21',
                    datGiorno: '2026-09-17'
                }
            ]
        };
        const tasks = extractHomeworkFromDashboard(dashboard);
        assert.strictEqual(tasks.length, 1);
        assert.strictEqual(tasks[0].subject, 'Matematica');
        assert.strictEqual(tasks[0].materia, 'Matematica');
        assert.strictEqual(tasks[0].due_date, '2026-09-21');
        assert.strictEqual(tasks[0].datCompito, '2026-09-21');
        assert.strictEqual(tasks[0].text, 'Esercizi pag. 104 n. 1, 2, 3');
        assert.strictEqual(tasks[0].done, false);
    });

    test('extracts homework when compiti is a plain string inside registro', () => {
        const dashboard = {
            dati: [
                {
                    datGiorno: '2026-09-17',
                    registro: [
                        {
                            materia: 'Italiano',
                            compiti: 'Studiare Divina Commedia Canto V per il 22/09'
                        }
                    ]
                }
            ]
        };
        const tasks = extractHomeworkFromDashboard(dashboard);
        assert.strictEqual(tasks.length, 1);
        assert.strictEqual(tasks[0].subject, 'Italiano');
        assert.strictEqual(tasks[0].due_date, '2026-09-22');
        assert.strictEqual(tasks[0].assigned_date, '2026-09-17');
    });

    test('extracts homework from attivitaPianificate in daily blocks', () => {
        const dashboard = {
            dati: [
                {
                    datGiorno: '2026-09-17',
                    attivitaPianificate: [
                        {
                            desMateria: 'Fisica',
                            desAttivita: 'Problemi di termodinamica n. 15-20',
                            datGiorno: '2026-09-23'
                        }
                    ]
                }
            ]
        };
        const tasks = extractHomeworkFromDashboard(dashboard);
        assert.strictEqual(tasks.length, 1);
        assert.strictEqual(tasks[0].subject, 'Fisica');
        assert.strictEqual(tasks[0].due_date, '2026-09-23');
        assert.strictEqual(tasks[0].text, 'Problemi di termodinamica n. 15-20');
    });

    test('resolves relative date "per domani" accurately', () => {
        const dashboard = {
            dati: [
                {
                    datGiorno: '2026-09-17',
                    registro: [
                        {
                            materia: 'Filosofia',
                            compiti: 'Ripasso Kant per domani'
                        }
                    ]
                }
            ]
        };
        const tasks = extractHomeworkFromDashboard(dashboard);
        assert.strictEqual(tasks.length, 1);
        assert.strictEqual(tasks[0].subject, 'Filosofia');
        assert.strictEqual(tasks[0].due_date, '2026-09-18');
        assert.strictEqual(tasks[0].assigned_date, '2026-09-17');
    });

    test('recovers tasks from lesson attivita containing homework keywords', () => {
        const dashboard = {
            dati: [
                {
                    datGiorno: '2026-09-17',
                    registro: [
                        {
                            materia: 'Inglese',
                            attivita: 'Spiegazione Romanticismo. Compiti per casa: leggere pag 55-60 ed esercizi 1 e 2 per il 24/09.'
                        }
                    ]
                }
            ]
        };
        const tasks = extractHomeworkFromDashboard(dashboard);
        assert.strictEqual(tasks.length, 1);
        assert.strictEqual(tasks[0].subject, 'Inglese');
        assert.strictEqual(tasks[0].due_date, '2026-09-24');
    });

    test('deduplicates identical tasks gracefully', () => {
        const dashboard = {
            dati: [
                {
                    datGiorno: '2026-09-17',
                    compiti: [
                        { desMateria: 'Storia', desCompito: 'Studiare cap. 4', dataConsegna: '2026-09-20' }
                    ],
                    registro: [
                        { materia: 'Storia', compiti: [{ desCompito: 'Studiare cap. 4', dataConsegna: '2026-09-20' }] }
                    ]
                }
            ]
        };
        const tasks = extractHomeworkFromDashboard(dashboard);
        assert.strictEqual(tasks.length, 1);
    });

    test('returns empty array when dashboard data is empty or invalid', () => {
        assert.deepStrictEqual(extractHomeworkFromDashboard(null), []);
        assert.deepStrictEqual(extractHomeworkFromDashboard(undefined), []);
        assert.deepStrictEqual(extractHomeworkFromDashboard({}), []);
        assert.deepStrictEqual(extractHomeworkFromDashboard({ dati: [] }), []);
    });

    test('canonicalizes DidUp subject names for Storia, Italiano, Matematica, Inglese', () => {
        const dashboard = {
            dati: [
                {
                    datGiorno: '2026-09-17',
                    compiti: [
                        { desMateria: 'STORIA', desCompito: 'Studiare cap. 3 Rivoluzione Francese', dataConsegna: '2026-09-22' },
                        { desMateria: 'LINGUA E LETTERATURA ITALIANA', desCompito: 'Analisi Canto V Inferno', dataConsegna: '2026-09-22' },
                        { desMateria: 'MATEMATICA', desCompito: 'Esercizi pag. 45 n. 1-10', dataConsegna: '2026-09-23' },
                        { desMateria: 'LINGUA E CULTURA STRANIERA (INGLESE)', desCompito: 'Reading comprehension Unit 3', dataConsegna: '2026-09-23' }
                    ]
                }
            ]
        };
        const tasks = extractHomeworkFromDashboard(dashboard);
        assert.strictEqual(tasks.length, 4);

        const storia = tasks.find(t => t.text.includes('Rivoluzione Francese'));
        assert.ok(storia, 'Storia task should exist');
        assert.strictEqual(storia.subject, 'Storia Triennio');
        assert.strictEqual(storia.materia, 'Storia Triennio');
        assert.strictEqual(storia.raw_materia, 'STORIA');

        const italiano = tasks.find(t => t.text.includes('Canto V'));
        assert.ok(italiano, 'Italiano task should exist');
        assert.strictEqual(italiano.subject, 'Italiano');
        assert.strictEqual(italiano.materia, 'Italiano');
        assert.strictEqual(italiano.raw_materia, 'LINGUA E LETTERATURA ITALIANA');

        const matematica = tasks.find(t => t.text.includes('pag. 45'));
        assert.ok(matematica, 'Matematica task should exist');
        assert.strictEqual(matematica.subject, 'Matematica');
        assert.strictEqual(matematica.materia, 'Matematica');
        assert.strictEqual(matematica.raw_materia, 'MATEMATICA');

        const inglese = tasks.find(t => t.text.includes('Unit 3'));
        assert.ok(inglese, 'Inglese task should exist');
        assert.strictEqual(inglese.subject, 'Inglese');
        assert.strictEqual(inglese.materia, 'Inglese');
        assert.strictEqual(inglese.raw_materia, 'LINGUA E CULTURA STRANIERA (INGLESE)');
    });

    test('detects subject from text when materia is generic (AVVISO)', () => {
        const dashboard = {
            dati: [
                {
                    datGiorno: '2026-09-17',
                    promemoria: [
                        { desAnnotazioni: 'Compiti di matematica: esercizi pag 80 per il 24/09', materia: 'AVVISO' }
                    ]
                }
            ]
        };
        const tasks = extractHomeworkFromDashboard(dashboard);
        assert.strictEqual(tasks.length, 1);
        assert.strictEqual(tasks[0].subject, 'Matematica');
        assert.strictEqual(tasks[0].due_date, '2026-09-24');
    });
});
