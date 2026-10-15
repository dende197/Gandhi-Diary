const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app-bootstrap.js'), 'utf8');
const scheduler = source.slice(source.indexOf('        const AUTO_SYNC_INTERVAL_MS'), source.indexOf('        async function runSilentGoogleSync')) +
    source.slice(source.indexOf('        async function runAutomaticSyncCycle'), source.indexOf('        async function loadCircolari'));
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
    let now = Date.parse('2026-10-14T21:00:00Z'), last = now, generation = 0, next = 1;
    const timers = new Map(), events = {}, calls = { argo: 0, circulars: 0, google: 0 };
    const state = { isLoggedIn: true, user: { id: 'alice' }, didup: { connected: true } };
    const document = { visibilityState: 'visible', addEventListener: (e, fn) => { events[e] = fn; } };
    const navigator = { onLine: true };
    const window = { addEventListener: (e, fn) => { events[e] = fn; } };
    let argo = async () => { last = now; return true; }, google = async () => {};
    const context = { state, document, navigator, window,
        Date: class extends Date { static now() { return now; } },
        localStorage: { getItem: () => String(last) }, lsKey: key => key, getPersistedLastSyncAt: () => last,
        sessionManager: { load: () => ({ studentId: state.user.id }), isLoggedIn: () => state.isLoggedIn },
        ClientRuntime: { capture: () => { const epoch = generation; return () => epoch === generation; } },
        setTimeout: (fn, delay) => { const id = next++; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout: id => timers.delete(id),
        performSync: async () => { calls.argo++; return argo(); },
        loadCircolari: async () => { calls.circulars++; },
        runSilentGoogleSync: async () => { calls.google++; return google(); },
        console: { log() {}, warn() {} },
    };
    vm.runInNewContext(scheduler + '\nwindow.start=ensureAutomaticSyncScheduler;window.run=runAutomaticSyncCycle;', context);
    return { state, document, navigator, calls, timers, window,
        setLast: value => { last = value; }, now: () => now,
        setArgo: fn => { argo = fn; }, setGoogle: fn => { google = fn; },
        invalidate: () => { generation++; window.stopAutomaticSyncScheduler(); },
        fire: async name => { events[name]?.({ persisted: true }); await settle(); },
        advance: async ms => {
            const target = now + ms;
            for (let count = 0; count < 1000; count++) {
                const entry = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
                if (!entry) { now = target; await settle(); return; }
                now = entry[1].at; timers.delete(entry[0]); entry[1].fn(); await settle();
            }
            assert.fail('Timer busy loop');
        },
    };
}
test('visible app automatically refreshes Argo and circulars every minute without duplicating its scheduler', async () => {
    const f = fixture(); f.window.start(); f.window.start();
    assert.equal(f.timers.size, 1);
    await f.advance(59999); assert.equal(f.calls.argo, 0);
    await f.advance(1); assert.equal(f.calls.argo, 1); assert.equal(f.calls.circulars, 1);
    await f.advance(60000); assert.equal(f.calls.argo, 2);
    assert.equal(f.calls.google, 1, 'Google must not run every minute');
    await f.advance(240000); assert.equal(f.calls.argo, 6); assert.equal(f.calls.google, 2);
});
test('returning after hours in the background refreshes immediately and duplicate lifecycle events coalesce', async () => {
    const f = fixture(); f.window.start();
    f.document.visibilityState = 'hidden'; await f.fire('visibilitychange');
    await f.advance(6 * 3600000); assert.equal(f.calls.argo, 0);
    f.document.visibilityState = 'visible';
    await Promise.all([f.fire('visibilitychange'), f.fire('focus'), f.fire('pageshow')]);
    assert.equal(f.calls.argo, 1); assert.equal(f.timers.size, 1);
    await f.advance(60000); assert.equal(f.calls.argo, 2);
});
test('reopening briefly does not reset the deadline and reconnecting catches up automatically', async () => {
    const f = fixture(); f.window.start();
    await f.advance(20000); f.document.visibilityState = 'hidden'; await f.fire('visibilitychange');
    await f.advance(10000); f.document.visibilityState = 'visible'; await f.fire('visibilitychange');
    await f.advance(30000); assert.equal(f.calls.argo, 1);
    f.navigator.onLine = false; await f.fire('offline'); await f.advance(3600000);
    assert.equal(f.calls.argo, 1);
    f.navigator.onLine = true; await f.fire('online'); assert.equal(f.calls.argo, 2);
});
test('failed requests retry automatically, while slow requests never overlap', async () => {
    const f = fixture(); f.setArgo(async () => false); f.window.start();
    await f.advance(180000); assert.equal(f.calls.argo, 3);
    let finish; f.setArgo(() => new Promise(resolve => { finish = resolve; }));
    await f.advance(60000); assert.equal(f.calls.argo, 4);
    await f.advance(180000); await f.fire('online'); assert.equal(f.calls.argo, 4);
    finish(false); await settle(); await f.advance(1000); assert.equal(f.calls.argo, 5);
});
test('slow or failed Google synchronization never stops Argo polling or marks it disconnected', async () => {
    const f = fixture(); let finish;
    f.setGoogle(() => new Promise(resolve => { finish = resolve; })); f.window.start();
    await f.advance(6 * 60000); assert.equal(f.calls.argo, 6); assert.equal(f.calls.google, 1);
    finish(); await settle();
    f.setGoogle(async () => { throw new Error('Google unavailable'); });
    await f.advance(60000); assert.equal(f.calls.google, 2);
    assert.equal(f.state.didup.connected, true);
    await f.advance(60000); assert.equal(f.calls.argo, 8);
});
test('logout and account changes stop old work from owning the new profile scheduler', async () => {
    const f = fixture(); let finish;
    f.setArgo(() => new Promise(resolve => { finish = resolve; })); f.window.start();
    await f.advance(60000);
    f.invalidate(); f.state.isLoggedIn = false; finish(true); await settle();
    await f.advance(60000); assert.equal(f.calls.argo, 1); assert.equal(f.calls.google, 0);
    f.state.isLoggedIn = true; f.state.user.id = 'bob'; f.setLast(0);
    f.setArgo(async () => { f.setLast(f.now()); return true; }); f.window.start();
    await f.advance(1000); assert.equal(f.calls.argo, 2); assert.equal(f.calls.google, 1);
});
test('missing or future timestamps do not suppress synchronization', async () => {
    for (const last of [0, Date.parse('2099-01-01')]) {
        const f = fixture(); f.setLast(last); f.window.start(); await f.advance(1000);
        assert.equal(f.calls.argo, 1);
    }
});
