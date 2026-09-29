const { test } = require('node:test'),
    assert = require('node:assert/strict');
const { load, fakeDb, response, request } = require('./support/backend');
const helpers = require('../lib/helpers'),
    backend = require('../lib/backend'),
    argo = require('../lib/argo');
const alice = 'p:school:alice:0';
const authHelpers = { ...helpers, verifySessionToken: async () => true };
const service = (db) => ({
    ...backend,
    database: () => db,
    withLease: async (k, fn) => fn(),
    quota: async () => {},
});
function calendarFake(overrides = {}) {
    const inserts = [],
        patches = [],
        deletes = [];
    const events = {
        list: async () => ({ data: { items: [] } }),
        insert: async ({ requestBody }) => {
            inserts.push(requestBody);
            return { data: requestBody };
        },
        patch: async (req) => {
            patches.push(req);
            return { data: req.requestBody };
        },
        delete: async (req) => {
            deletes.push(req);
        },
        ...overrides,
    };
    return {
        inserts,
        patches,
        deletes,
        lib: load('lib/googleCalendar.js', { googleapis: { google: { calendar: () => ({ events }) } } }),
    };
}
test('B01 rejects conflicting supplied identity before reading Argo', async () => {
    let reads = 0;
    const handler = load('api_internal/sync.js', {
        '../lib/helpers': authHelpers,
        '../lib/argo-session': {
            ...require('../lib/argo-session'),
            loadArgoDashboard: async () => {
                reads++;
            },
        },
    });
    const out = response();
    await handler(request({ userId: alice, schoolCode: 'school', username: 'bob' }), out);
    assert.equal(out.code, 403);
    assert.equal(reads, 0);
});
test('B02/B03 Google sync uses only authenticated identity, ignores alternate account/vault inputs', async () => {
    let used;
    const handler = load('api/google.js', {
        '../lib/helpers': authHelpers,
        '../lib/google-sync': {
            syncGoogleUser: async (user) => {
                used = user;
                return { success: true };
            },
        },
    });
    const out = response();
    await handler(
        request(
            { userId: alice, schoolCode: 'school', username: 'bob', profileIndex: 1 },
            { action: 'sync' },
        ),
        out,
    );
    assert.equal(out.code, 200);
    assert.equal(used, alice);
});
test('B03 save-argo cannot persist arbitrary client credentials', async () => {
    const db = fakeDb(() => ({ data: { argo_password: 'existing' }, error: null }));
    const handler = load('api/google.js', { '../lib/helpers': authHelpers, '../lib/backend': service(db) });
    const out = response();
    await handler(
        request({ userId: alice, username: 'bob', password: 'attacker' }, { action: 'save-argo' }),
        out,
    );
    assert.equal(out.code, 200);
    assert.ok(
        db.calls.every(
            (c) => c.op === 'select' && c.filters.some((f) => f[1] === 'user_id' && f[2] === alice),
        ),
    );
});
test('B07 disconnect clears Google fields and preserves stored Argo credentials', async () => {
    const db = fakeDb(() => ({ data: { argo_password: 'encrypted' }, error: null }));
    const handler = load('api/google.js', { '../lib/helpers': authHelpers, '../lib/backend': service(db) });
    const out = response();
    await handler(request({ userId: alice }, { action: 'disconnect' }), out);
    assert.equal(out.code, 200);
    assert.ok(!db.calls.some((c) => c.op === 'delete'));
    const change = db.calls.find((c) => c.op === 'update');
    assert.equal(change.payload.refresh_token, null);
    assert.ok(!Object.hasOwn(change.payload, 'argo_password'));
});
test('B08 Argo-only row is not reported Google connected', async () => {
    const db = fakeDb(() => ({
        data: { argo_password: 'encrypted', updated_at: '2026-01-01' },
        error: null,
    }));
    const handler = load('api/google.js', { '../lib/helpers': authHelpers, '../lib/backend': service(db) });
    const out = response();
    await handler(request({}, { action: 'status', userId: alice }, 'GET'), out);
    assert.equal(out.body.connected, false);
    assert.equal(out.body.lastSync, null);
});
test('B10 valid cached Argo session avoids another login even when password is stored', async () => {
    const row = {
        user_id: alice,
        argo_school_code: 'school',
        argo_username: 'alice',
        profile_index: 0,
        argo_password: 'encrypted',
        argo_access_token: 'a',
        argo_auth_token: 'b',
        argo_tokens_expiry: new Date(Date.now() + 60000).toISOString(),
    };
    const db = fakeDb((c) => ({
        data: c.table === 'google_tokens' && c.op === 'select' ? row : null,
        error: null,
    }));
    let dashboards = 0,
        logins = 0;
    const lib = load('lib/argo-session.js', {
        './backend': service(db),
        './argo': {
            getDashboard: async () => {
                dashboards++;
                return { dati: [] };
            },
            AdvancedArgo: {
                rawLogin: async () => {
                    logins++;
                },
            },
        },
    });
    await lib.loadArgoDashboard(alice);
    assert.equal(dashboards, 1);
    assert.equal(logins, 0);
});
test('B11 Google route reports partial synchronization as failure', async () => {
    const handler = load('api/google.js', {
        '../lib/helpers': authHelpers,
        '../lib/google-sync': { syncGoogleUser: async () => ({ success: false, errors: ['429'] }) },
    });
    const out = response();
    await handler(request({ userId: alice }, { action: 'sync' }), out);
    assert.equal(out.code, 502);
    assert.equal(out.body.success, false);
});
test('B12 long subjects and different text produce distinct Calendar IDs', async () => {
    const { lib, inserts } = calendarFake();
    const result = await lib.syncTasksToCalendar(
        ['First exercise', 'Different exercise'].map((text) => ({
            subject: 'Disegno e Storia Dell’arte Triennio',
            due_date: '2099-01-01',
            text,
        })),
        'primary',
        {},
    );
    assert.equal(result.added, 2);
    assert.notEqual(inserts[0].id, inserts[1].id);
});
test('B13 Calendar pages are followed and existing events are reused', async () => {
    let pages = 0;
    const { lib, inserts, patches } = calendarFake({
        list: async ({ pageToken }) => {
            pages++;
            return {
                data: pageToken
                    ? { items: [{ id: 'existing', summary: '[M]: exercise', start: { date: '2099-01-01' } }] }
                    : { items: [], nextPageToken: 'next' },
            };
        },
    });
    await lib.syncTasksToCalendar(
        [{ subject: 'M', due_date: '2099-01-01', text: 'exercise' }],
        'primary',
        {},
    );
    assert.equal(pages, 2);
    assert.equal(inserts.length, 0);
    assert.equal(patches[0].eventId, 'existing');
});
test('B14 concurrent Calendar inserts converge on a single deterministic event', async () => {
    const events = new Map();
    let patches = 0;
    const { lib } = calendarFake({
        insert: async ({ requestBody: b }) => {
            if (events.has(b.id)) throw Object.assign(new Error('Duplicate'), { code: 409 });
            events.set(b.id, b);
            return { data: b };
        },
        patch: async ({ eventId, requestBody }) => {
            patches++;
            events.set(eventId, requestBody);
        },
    });
    const tasks = [{ id: 'same', subject: 'M', due_date: '2099-01-01', text: 'exercise' }];
    const results = await Promise.all([
        lib.syncTasksToCalendar(tasks, 'primary', {}),
        lib.syncTasksToCalendar(tasks, 'primary', {}),
    ]);
    assert.ok(results.every((r) => r.success));
    assert.equal(events.size, 1);
    assert.equal(patches, 1);
});
test('B15 date/text changes update stable source ID; authoritative removal deletes owned events', async () => {
    const first = calendarFake();
    await first.lib.syncTasksToCalendar(
        [{ source_id: 'original', subject: 'M', due_date: '2099-01-01', text: 'old' }],
        'primary',
        {},
    );
    const old = first.inserts[0];
    const c = calendarFake({ list: async () => ({ data: { items: [old] } }) });
    const result = await c.lib.syncTasksToCalendar(
        [{ source_id: 'original', subject: 'M', due_date: '2099-01-02', text: 'new' }],
        'primary',
        {},
        null,
        { authoritative: true },
    );
    assert.equal(result.updated, 1);
    assert.equal(c.patches[0].eventId, old.id);
    assert.equal(c.deletes.length, 0);
    await c.lib.syncTasksToCalendar([], 'primary', {}, null, { authoritative: false });
    assert.equal(c.deletes.length, 0);
    await c.lib.syncTasksToCalendar([], 'primary', {}, null, { authoritative: true });
    assert.equal(c.deletes.length, 1);
});
test('B16 failed reminder deletion reports failure', async () => {
    const c = calendarFake({
        list: async () => ({
            data: { items: [{ id: 'x', extendedProperties: { private: { reminderSlot: '18' } } }] },
        }),
        delete: async () => {
            throw Error('503');
        },
    });
    const result = await c.lib.syncUnjustifiedAttendanceReminders({ assenze: [] }, 'primary', {});
    assert.equal(result.success, false);
    assert.equal(result.errors.length, 1);
});
test('B17 daily dashboard merge preserves complementary fields', async () => {
    const lib = load('lib/argo.js', {
        axios: {
            post: async () => ({
                data: {
                    dati: [
                        { datGiorno: '2026-09-28', voti: [{ id: 'a', codVoto: 8 }] },
                        { datGiorno: '2026-09-28', compiti: [{ desCompito: 'exercise' }] },
                    ],
                },
            }),
        },
    });
    const d = await lib.getDashboard({}, { enableBackfill: false });
    assert.equal(d.dati.length, 1);
    assert.equal(d.dati[0].voti.length, 1);
    assert.equal(d.dati[0].compiti.length, 1);
});
test('B18 malformed later collection does not discard valid homework', () => {
    const tasks = argo.extractHomeworkFromDashboard({
        dati: [
            { datGiorno: '2026-09-28', compiti: [{ desCompito: 'Studiare', desMateria: 'M' }] },
            { datGiorno: '2026-09-29', registro: { unexpected: 'object' } },
        ],
    });
    assert.equal(tasks.length, 1);
});
test('B19/B20 relative dates follow publication date and explicit years are preserved', () => {
    const vs = argo.extractVerificheFromDashboard({
        dati: [{ datGiorno: '2026-12-31', promemoria: [{ testo: 'Verifica domani', desMateria: 'M' }] }],
    });
    assert.equal(vs[0].data, '2027-01-01');
    for (const month of ['gennaio', 'gen', 'gen.']) {
        const tasks = argo.extractHomeworkFromDashboard({
            dati: [
                {
                    datGiorno: '2026-09-28',
                    compiti: [{ desCompito: `Studiare per il 15 ${month} 2028`, desMateria: 'M' }],
                },
            ],
        });
        assert.equal(tasks[0].due_date, '2028-01-15');
    }
});
test('B21 distinct grades retain IDs; repeated same assessment is deduplicated', () => {
    const a = { id: 'a', desMateria: 'M', codVoto: 7, data: '2026-09-28', tipo: 'orale' },
        b = { ...a, id: 'b', tipo: 'scritto' };
    const gs = argo.extractGradesFromDashboard({ dati: [{ voti: [a, b, a] }] });
    assert.equal(gs.length, 2);
    assert.notEqual(gs[0].id, gs[1].id);
});
test('B22 structured duration wins and scheduled daily hours replace generic fallback', () => {
    const a = argo.extractAssenzeFromDashboard({
        dati: [{ datGiorno: '2026-09-28', assenze: [{ codEvento: 'R', numOre: 3 }] }],
    });
    assert.equal(a.oreAssenzaTotali, 3);
    const b = argo.extractAssenzeFromDashboard(
        { dati: [{ datGiorno: '2026-09-28', assenze: [{ codEvento: 'A' }] }] },
        { schedule: { lunedi: [{ inizio: '08:00', fine: '12:00' }] } },
    );
    assert.equal(b.oreAssenzaTotali, 4);
});
test('B23 ISO timezone justification is recognized', () => {
    for (const suffix of ['Z', '.123Z', '+02:00'])
        assert.equal(
            helpers.resolveAttendanceJustification({ datGiustificazione: `2026-09-28T10:00:00${suffix}` })
                .giustificata,
            true,
        );
});
test('B24 nested dashboard class is detected', () => {
    assert.equal(
        argo.extractClassFromDashboard({
            data: { dati: [{ compiti: [{ desClasse: '5D', desCorso: 'Scienze Applicate' }] }] },
        })?.formatted,
        '5D (SA)',
    );
});
test('B25 manual tests load without a planner row', async () => {
    const db = fakeDb((c) => ({
        data: c.table === 'manual_verifiche' ? [{ id: 'manual' }] : null,
        error: null,
    }));
    const handler = load('api_internal/sync.js', {
        '../lib/backend': service(db),
        '../lib/helpers': authHelpers,
        '../lib/argo-session': {
            assertIdentity() {},
            loadArgoDashboard: async () => ({ row: {}, dashboard: { dati: [] } }),
        },
    });
    const out = response();
    await handler(request({ userId: alice, schoolCode: 'school', username: 'alice' }), out);
    assert.equal(out.code, 200);
    assert.equal(out.body.planner.manualVerifiche[0].id, 'manual');
    assert.equal(out.body.planner.version, 0);
});
test('B26 returned Supabase error fails request', async () => {
    await assert.rejects(
        () => backend.checked(Promise.resolve({ data: null, error: { message: 'write failed' } })),
        { status: 503 },
    );
});
test('B28 class invalid dates and unknown enums give 400 without writing', async () => {
    const key = `SCHOOL:${helpers.getCurrentSchoolYearKey()}:5D`;
    const db = fakeDb((c) => ({
        data:
            c.table === 'verified_memberships'
                ? { class_key: key, class_name: '5D', verified_at: new Date().toISOString() }
                : { name: 'Alice' },
        error: null,
    }));
    const handler = load('api_internal/class-representative/index.js', {
        '../../lib/backend': service(db),
        '../../lib/helpers': authHelpers,
    });
    const out = response();
    await handler(
        request({
            action: 'create_proposal',
            class: '5D',
            type: 'assembly',
            targetDate: 'invalid',
            reason: 'test',
        }),
        out,
    );
    assert.equal(out.code, 400);
    assert.ok(!db.calls.some((c) => c.op === 'rpc'));
});
test('B29 cache is keyed by document URL, has expiry, and never trusts client ID', async () => {
    const rows = new Map(),
        db = fakeDb((c) => {
            if (c.op === 'upsert') rows.set(c.payload.key, c.payload);
            return { data: rows.get(c.filters.find((f) => f[1] === 'key')?.[2]), error: null };
        });
    const cache = load('lib/sintesiCache.js', { './backend': service(db) });
    await cache.setSintesiInCache('https://school/doc1', 'one');
    assert.equal(await cache.getSintesiFromCache('https://school/doc1'), 'one');
    assert.equal(await cache.getSintesiFromCache('https://school/doc2'), null);
    [...rows.values()][0].expires_at = '2000-01-01';
    assert.equal(await cache.getSintesiFromCache('https://school/doc1'), null);
});
test('B30/B31/B32 CORS rejects unrelated tenants, redaction covers tokens, Francesco is valid', () => {
    for (const origin of ['https://unrelated.github.io', 'https://unrelated.vercel.app']) {
        const out = response();
        helpers.setCorsHeaders({ headers: { origin } }, out);
        assert.equal(out.headers['Access-Control-Allow-Origin'], undefined);
    }
    const value = helpers.redact({
        accessToken: 'secret',
        refresh_token: 'secret',
        argo_password: 'secret',
        'x-session-token': 'secret',
    });
    assert.ok(Object.values(value).every((v) => v === '<redacted>'));
    assert.equal(helpers.isValidName('Francesco Rossi'), true);
});
test('B33 migration utility loads without dotenv', () => {
    assert.equal(typeof require('../scripts/encrypt_legacy_passwords').run, 'function');
});
test('B34 deadline aborts work before later writes and awaits settlement', async () => {
    let mutated = false,
        settled = false;
    await assert.rejects(
        () =>
            backend.deadline(async () => {
                await new Promise((resolve) => setTimeout(resolve, 15));
                settled = true;
                backend.signal().throwIfAborted();
                mutated = true;
            }, 1),
        { status: 504 },
    );
    assert.equal(settled, true);
    assert.equal(mutated, false);
});
test('B35 planner rejects blind and stale snapshots', async () => {
    const db = fakeDb(() => ({ data: [], error: null }));
    const handler = load('api_internal/planner/[user_id].js', {
        '../../lib/helpers': authHelpers,
        '../../lib/backend': service(db),
    });
    for (const [body, code] of [
        [{ plannedTasks: {} }, 428],
        [{ plannedTasks: {}, version: 0 }, 409],
    ]) {
        const out = response();
        await handler(request(body, { user_id: alice }, 'PUT'), out);
        assert.equal(out.code, code);
    }
});
test('B36 reordered profiles preserve subject identity; missing subject never falls back to first child', () => {
    const { selectProfile } = require('../lib/argo-session');
    const profiles = [
        { index: 0, idSoggetto: 'B' },
        { index: 1, idSoggetto: 'A' },
    ];
    assert.equal(selectProfile(profiles, { profile_index: 0, argo_id_soggetto: 'A' }).idSoggetto, 'A');
    assert.throws(() => selectProfile(profiles, { profile_index: 0, argo_id_soggetto: 'missing' }), {
        status: 409,
    });
});
test('B37 watch totals and detail hours agree, unknown annual total stays unknown', async () => {
    const db = fakeDb(() => ({ data: [], error: null }));
    const handler = load('api_internal/watch-summary/[user_id].js', {
        '../../lib/helpers': authHelpers,
        '../../lib/backend': service(db),
        '../../lib/supabase': { getSupabase: () => db },
        '../../lib/argo-session': {
            loadArgoDashboard: async () => ({
                row: {},
                dashboard: { dati: [{ datGiorno: '2026-09-28', assenze: [{ codEvento: 'A', numOre: 4 }] }] },
            }),
        },
    });
    const out = response();
    await handler(request({}, { user_id: alice }, 'GET'), out);
    assert.equal(out.body.data.assenze.oreTotali, 4);
    assert.equal(out.body.data.listAssenze[0].ore, 4);
    assert.equal(out.body.data.assenze.percentuale, null);
});
test('B39 anonymous summary request cannot invoke paid models', async () => {
    let calls = 0;
    const handler = load('api_internal/circolari/sintesi.js', {
        '../../lib/helpers': { ...helpers, verifySessionToken: async () => false },
        '../../lib/gemini': {
            hasGeminiKey: () => true,
            generateWithGemini: async () => {
                calls++;
            },
        },
    });
    const out = response();
    await handler(request({ link: 'https://www.liceogandhi.edu.it/fictional' }), out);
    assert.equal(out.code, 403);
    assert.equal(calls, 0);
});
test('B26/B27 Google refresh persistence is awaited, schedule saved, partial failures have no success timestamp', async () => {
    let listener;
    class OAuth {
        setCredentials() {}
        on(event, fn) {
            listener = fn;
        }
    }
    const db = fakeDb((c) => ({
        data:
            c.op === 'select'
                ? { refresh_token: 'google-refresh' }
                : c.op === 'update'
                  ? [{ user_id: alice }]
                  : null,
        error: null,
    }));
    const lib = load('lib/google-sync.js', {
        './backend': service(db),
        googleapis: { google: { auth: { OAuth2: OAuth } } },
        './argo-session': { loadArgoDashboard: async () => ({ dashboard: { dati: [] } }) },
        './googleCalendar': {
            syncTasksToCalendar: async () => {
                listener({ access_token: 'fresh' });
                return { success: false, errors: ['quota'] };
            },
            syncVerificheToCalendar: async () => ({ success: true, errors: [] }),
            syncUnjustifiedAttendanceReminders: async () => ({ success: true, errors: [] }),
        },
    });
    const r = await lib.syncGoogleUser(alice, { classSchedule: { lunedi: [] } });
    assert.equal(r.success, false);
    assert.ok(db.calls.some((c) => c.payload?.class_schedule));
    assert.ok(db.calls.some((c) => c.payload?.access_token === 'fresh'));
    assert.ok(!db.calls.some((c) => c.payload?.last_google_sync));
});
test('B09/B11 cron selects connected users only and counts partial sync as failure', async () => {
    const old = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-secret';
    try {
        const db = fakeDb((c) => ({ data: c.op === 'select' ? [{ user_id: alice }] : [], error: null }));
        const handler = load('api/cron-sync.js', {
            '../lib/backend': service(db),
            '../lib/google-sync': { syncGoogleUser: async () => ({ success: false }) },
        });
        const out = response(),
            req = request({}, { force: '1' }, 'GET');
        req.headers.authorization = 'Bearer test-secret';
        await handler(req, out);
        assert.equal(out.code, 502);
        assert.equal(out.body.results.failed, 1);
        assert.equal(out.body.results.succeeded, 0);
        assert.ok(
            db.calls.some(
                (c) => c.op === 'select' && c.filters.some((f) => f[0] === 'not' && f[1] === 'refresh_token'),
            ),
        );
    } finally {
        if (old === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = old;
    }
});
test('B18 malformed activity object does not suppress later valid tests', () => {
    const vs = argo.extractVerificheFromDashboard({
        dati: [
            {
                datGiorno: '2026-12-31',
                attivita: { unexpected: true },
                promemoria: [{ testo: 'Verifica domani', desMateria: 'M' }],
            },
        ],
    });
    assert.equal(vs.length, 1);
    assert.equal(vs[0].data, '2027-01-01');
});
