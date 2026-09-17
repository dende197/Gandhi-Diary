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
});
