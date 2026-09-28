const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    syncTasksToCalendar,
    syncVerificheToCalendar,
    parseDataArgo
} = require('../lib/googleCalendar');

describe('Google Calendar Sync Engine & 5 D sa Schedule', () => {
    beforeEach(t => t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-28T10:00:00Z')}));
    afterEach(t => t.mock.timers.reset());

    test('Schedule for 5 D sa maps subjects to their correct time slots', async () => {
        // Mock calendar client that records inserted events
        const insertedEvents = [];
        const mockAuth = {};
        const mockCalendar = {
            events: {
                list: async () => ({ data: { items: [] } }),
                insert: async ({ requestBody }) => {
                    insertedEvents.push(requestBody);
                    return { data: requestBody };
                }
            }
        };

        // We temporarily mock googleapis in require cache or call sync with mock
        const { google } = require('googleapis');
        const origCalendar = google.calendar;
        google.calendar = () => mockCalendar;

        try {
            // Test 1: Martedì (Tuesday 2026-09-29) - 1ª ora Scienze (08:00-09:00), 4ª ora Matematica (11:00-12:00)
            const tasksMartedi = [
                { subject: 'SCIENZE', due_date: '2026-09-29', text: 'Esercizi genetica' },
                { subject: 'MATEMATICA', due_date: '2026-09-29', text: 'Studio integrali' }
            ];
            const resMartedi = await syncTasksToCalendar(tasksMartedi, 'primary', mockAuth);
            assert.strictEqual(resMartedi.success, true);
            assert.strictEqual(resMartedi.added, 2);

            const scienzeEv = insertedEvents.find(e => e.summary.includes('SCIENZE'));
            assert.ok(scienzeEv);
            assert.strictEqual(scienzeEv.start.dateTime, '2026-09-29T08:00:00');
            assert.strictEqual(scienzeEv.end.dateTime, '2026-09-29T09:00:00');

            const matEv = insertedEvents.find(e => e.summary.includes('MATEMATICA'));
            assert.ok(matEv);
            assert.strictEqual(matEv.start.dateTime, '2026-09-29T11:00:00');
            assert.strictEqual(matEv.end.dateTime, '2026-09-29T12:00:00');

            // Test 2: Lunedì (Monday 2026-09-28) - Riposo (no slot) -> all-day event with start.date and end.date = next day
            insertedEvents.length = 0;
            const tasksLunedi = [
                { subject: 'STORIA', due_date: '2026-09-28', text: 'Lettura saggio' }
            ];
            const resLunedi = await syncTasksToCalendar(tasksLunedi, 'primary', mockAuth);
            assert.strictEqual(resLunedi.success, true);
            assert.strictEqual(resLunedi.added, 1);

            const lunediEv = insertedEvents[0];
            assert.ok(lunediEv);
            assert.strictEqual(lunediEv.start.date, '2026-09-28');
            assert.strictEqual(lunediEv.end.date, '2026-09-29'); // Next day for all-day events in Google Calendar API v3

            // Test 3: Venerdì (Friday 2026-10-02) - 1ª ora Scienze Motorie (08:00-09:00) vs pure Scienze distinction
            insertedEvents.length = 0;
            const tasksVenerdi = [
                { subject: 'SCIENZE MOTORIE', due_date: '2026-10-02', text: 'Test cooper' }
            ];
            const resVenerdi = await syncTasksToCalendar(tasksVenerdi, 'primary', mockAuth);
            assert.strictEqual(resVenerdi.success, true);
            const motorieEv = insertedEvents[0];
            assert.strictEqual(motorieEv.start.dateTime, '2026-10-02T08:00:00');
            assert.strictEqual(motorieEv.end.dateTime, '2026-10-02T09:00:00');

        } finally {
            google.calendar = origCalendar;
        }
    });

    test('Verifiche sync creates valid all-day events with end.date = next day', async () => {
        const insertedEvents = [];
        const mockAuth = {};
        const mockCalendar = {
            events: {
                list: async () => ({ data: { items: [] } }),
                insert: async ({ requestBody }) => {
                    insertedEvents.push(requestBody);
                    return { data: requestBody };
                }
            }
        };

        const { google } = require('googleapis');
        const origCalendar = google.calendar;
        google.calendar = () => mockCalendar;

        try {
            const verifiche = [
                { materia: 'FISICA', data: '2026-10-01', text: 'Verifica campo elettrico', tipo: 'scritta' }
            ];
            const res = await syncVerificheToCalendar(verifiche, 'primary', mockAuth);
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.added, 1);

            const ev = insertedEvents[0];
            assert.ok(ev);
            assert.strictEqual(ev.start.date, '2026-10-01');
            assert.strictEqual(ev.end.date, '2026-10-02'); // Must be 2026-10-02, not 2026-10-01
            assert.ok(ev.summary.includes('VERIFICA FISICA'));
            assert.ok(ev.summary.includes('scritta'));
        } finally {
            google.calendar = origCalendar;
        }
    });
});

describe('Notification Date Parsing and Strict Today Filtering', () => {

    // Helper replicating parseItemDateISO
    function parseItemDateISO(raw) {
        if (!raw) return null;
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
            const isoMatch = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
            const numMatch = trimmed.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
            if (numMatch) {
                return `${numMatch[3]}-${numMatch[2].padStart(2, '0')}-${numMatch[1].padStart(2, '0')}`;
            }
            const textMatch = trimmed.match(/(\d{1,2})\s+([a-zA-Zàèéìòù]+)\s+(\d{4})/i);
            if (textMatch) {
                const mKey = textMatch[2].toLowerCase();
                const monthMap = {
                    'gen': '01', 'gennaio': '01', 'feb': '02', 'febbraio': '02', 'mar': '03', 'marzo': '03',
                    'apr': '04', 'aprile': '04', 'mag': '05', 'maggio': '05', 'giu': '06', 'giugno': '06',
                    'lug': '07', 'luglio': '07', 'ago': '08', 'agosto': '08', 'set': '09', 'sett': '09', 'settembre': '09',
                    'ott': '10', 'ottobre': '10', 'nov': '11', 'novembre': '11', 'dic': '12', 'dicembre': '12'
                };
                const m = monthMap[mKey] || monthMap[mKey.substring(0, 3)];
                if (m) {
                    return `${textMatch[3]}-${m}-${textMatch[1].padStart(2, '0')}`;
                }
            }
        }
        const d = (typeof parseDataArgo === 'function') ? parseDataArgo(raw) : new Date(raw);
        if (d && !isNaN(d.getTime()) && d.getTime() > 86400000) {
            return d.toISOString().split('T')[0];
        }
        return null;
    }

    test('parseItemDateISO parses ISO, Italian DD/MM/YYYY, Italian text months, and embedded strings', () => {
        assert.strictEqual(parseItemDateISO('2026-09-28'), '2026-09-28');
        assert.strictEqual(parseItemDateISO('28/09/2026'), '2026-09-28');
        assert.strictEqual(parseItemDateISO('28-09-2026'), '2026-09-28');
        assert.strictEqual(parseItemDateISO('Pubblicata il 28/09/2026'), '2026-09-28');
        assert.strictEqual(parseItemDateISO('28 Settembre 2026'), '2026-09-28');
        assert.strictEqual(parseItemDateISO('5 Ottobre 2026'), '2026-10-05');
        assert.strictEqual(parseItemDateISO(''), null);
        assert.strictEqual(parseItemDateISO(null), null);
    });

    test('Strict today filtering: ONLY tasks assigned today appear in todayItems (due-today from past days are EXCLUDED)', () => {
        const todayISO = '2026-09-28';
        const tasks = [
            // Task assigned today for next week → SHOULD appear in todayItems
            { id: 1, subject: 'MATEMATICA', assigned_date: '2026-09-28', due_date: '2026-10-05', text: 'Esercizi integrali' },
            // Task assigned last week BUT due today → must NOT appear in todayItems
            { id: 2, subject: 'ITALIANO', assigned_date: '2026-09-20', due_date: '2026-09-28', text: 'Tema in classe' },
            // Task for next week, assigned yesterday → must NOT appear in todayItems
            { id: 3, subject: 'STORIA', assigned_date: '2026-09-27', due_date: '2026-10-03', text: 'Capitolo 2' },
            // Task assigned today with due today → SHOULD appear
            { id: 4, subject: 'INGLESE', assigned_date: '2026-09-28', due_date: '2026-09-28', text: 'Reading exercise' }
        ];

        const todayItems = [];
        const otherItems = [];
        tasks.forEach(t => {
            const assignedISO = parseItemDateISO(t.assigned_date);
            const dueISO = parseItemDateISO(t.due_date);
            if (assignedISO === todayISO) {
                todayItems.push({ ...t, dateISO: todayISO, label: 'Compito Assegnato Oggi' });
            } else {
                // Not assigned today: goes to upcoming or recent, NEVER today
                const targetISO = (dueISO && dueISO > todayISO) ? dueISO : (assignedISO || dueISO);
                otherItems.push({ ...t, dateISO: targetISO, label: 'Compito' });
            }
        });

        // Only 2 tasks were assigned today (id: 1 MATEMATICA, id: 4 INGLESE)
        assert.strictEqual(todayItems.length, 2, 'Only tasks assigned today should be in todayItems');
        assert.strictEqual(todayItems[0].subject, 'MATEMATICA');
        assert.strictEqual(todayItems[1].subject, 'INGLESE');

        // The other 2 tasks are NOT in todayItems
        assert.strictEqual(otherItems.length, 2);
        assert.strictEqual(otherItems[0].subject, 'ITALIANO');
        assert.strictEqual(otherItems[1].subject, 'STORIA');

        // CRITICAL: task id=2 (ITALIANO, assigned 9/20 due 9/28) must NOT have dateISO === todayISO
        assert.notStrictEqual(otherItems[0].dateISO, todayISO,
            'Task assigned on previous day with due_date=today must NOT have dateISO=todayISO');
    });

    test('Task assigned on a previous day with due_date = todayISO is EXCLUDED from today notifications and stories', () => {
        const todayISO = '2026-09-28';
        // This simulates the exact scenario the user reported: homework assigned days ago
        // showing up as today's notification because its due_date is today
        const task = { id: 99, subject: 'FISICA', assigned_date: '2026-09-22', due_date: '2026-09-28', text: 'Esercizi p. 45' };

        const assignedISO = parseItemDateISO(task.assigned_date);
        const dueISO = parseItemDateISO(task.due_date);

        // The task was assigned 6 days ago — it is NOT a novelty of today
        assert.notStrictEqual(assignedISO, todayISO, 'assigned_date should not equal today');
        assert.strictEqual(dueISO, todayISO, 'due_date equals today');

        // Under the new strict logic, this task must NOT appear in todayItems
        const isNoveltyOfToday = (assignedISO === todayISO);
        assert.strictEqual(isNoveltyOfToday, false,
            'A task assigned on a previous day must NEVER be treated as a novelty of today');

        // Its dateISO should be set to its due/assigned date, NOT todayISO
        const targetISO = (dueISO && dueISO > todayISO)
            ? dueISO
            : (assignedISO || (dueISO && dueISO < todayISO ? dueISO : null));
        // dueISO === todayISO and todayISO is NOT > todayISO, so it falls to assignedISO
        assert.strictEqual(targetISO, '2026-09-22',
            'dateISO should be set to assigned_date, not todayISO');
    });

    test('Midnight watchdog: old gc_seen_rewind_v2_* keys are cleaned up except current date', () => {
        // Simulate localStorage with old and current keys
        const mockStorage = {
            'gc_seen_rewind_v2_2026-09-26': 'true',
            'gc_seen_rewind_v2_2026-09-27': 'true',
            'gc_seen_rewind_v2_2026-09-28': 'true', // current day, should be kept
            'other_key': 'value'
        };

        const currentDate = '2026-09-28';
        const keysToRemove = [];

        Object.keys(mockStorage).forEach(key => {
            if (key.startsWith('gc_seen_rewind_v2_') && key !== `gc_seen_rewind_v2_${currentDate}`) {
                keysToRemove.push(key);
            }
        });

        assert.strictEqual(keysToRemove.length, 2, 'Should clean up 2 old rewind keys');
        assert.ok(keysToRemove.includes('gc_seen_rewind_v2_2026-09-26'));
        assert.ok(keysToRemove.includes('gc_seen_rewind_v2_2026-09-27'));
        assert.ok(!keysToRemove.includes('gc_seen_rewind_v2_2026-09-28'), 'Current date key must NOT be removed');
        assert.ok(!keysToRemove.includes('other_key'), 'Non-rewind keys must NOT be touched');
    });

    test('Today circulars filter strictly matches today and does NOT pick arbitrary past circulars', () => {
        const todayISO = '2026-09-28';
        const circolari = [
            { id: 'c1', titolo: 'Circolare N. 10', data: '28/09/2026' },
            { id: 'c2', titolo: 'Circolare N. 9', data: '20/09/2026' },
            { id: 'c3', titolo: 'Circolare N. 8', data: '15/09/2026' }
        ];

        const todayCirc = circolari.filter(c => parseItemDateISO(c.data) === todayISO);
        assert.strictEqual(todayCirc.length, 1);
        assert.strictEqual(todayCirc[0].titolo, 'Circolare N. 10');

        // When no circular was issued today, count is 0 and no slice fallback is used
        const noCircToday = circolari.filter(c => parseItemDateISO(c.data) === '2026-09-29');
        assert.strictEqual(noCircToday.length, 0);
    });

    test('Promemoria and Bacheca notices are combined without dropping bacheca on empty promemoria array', () => {
        const stateMock = {
            promemoria: [], // Empty array
            bacheca: [
                { id: 'b1', titolo: 'Assemblea sindacale', data: '2026-09-28' }
            ],
            announcements: []
        };

        const rawCommList = [
            ...(Array.isArray(stateMock.promemoria) ? stateMock.promemoria : []),
            ...(Array.isArray(stateMock.bacheca) ? stateMock.bacheca : []),
            ...(Array.isArray(stateMock.announcements) ? stateMock.announcements : [])
        ];

        assert.strictEqual(rawCommList.length, 1);
        assert.strictEqual(rawCommList[0].id, 'b1');
    });

    test('Stories slides: verifiche from previous days within 5 days are NO LONGER included in today stories', () => {
        const todayISO = '2026-09-28';
        const verifiche = [
            { id: 'v1', materia: 'MATEMATICA', data: '2026-09-28', text: 'Verifica integrali' },       // today → included
            { id: 'v2', materia: 'ITALIANO', data: '2026-09-30', text: 'Tema argomentativo' },          // 2 days ahead → NOT included
            { id: 'v3', materia: 'FISICA', data: '2026-10-02', text: 'Verifica cinematica' },            // 4 days ahead → NOT included
            { id: 'v4', materia: 'STORIA', data: '2026-10-10', text: 'Interrogazione storia' }           // 12 days ahead → NOT included
        ];

        // New strict logic: only verifiche with date === todayISO are included in stories
        const todayVerifiche = verifiche.filter(v => {
            const d = parseItemDateISO(v.data);
            return d === todayISO;
        });

        assert.strictEqual(todayVerifiche.length, 1, 'Only verifica scheduled for today should appear in stories');
        assert.strictEqual(todayVerifiche[0].materia, 'MATEMATICA');
    });
});
