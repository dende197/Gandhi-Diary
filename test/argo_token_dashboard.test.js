const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeDb, request, response } = require('./support/backend');
const backend = require('../lib/backend');
const helpers = require('../lib/helpers');
const policy = process.env.ARGO_LEGACY_AUTH_ENABLED;
afterEach(() => {
    if (policy === undefined) delete process.env.ARGO_LEGACY_AUTH_ENABLED;
    else process.env.ARGO_LEGACY_AUTH_ENABLED = policy;
});
const user = 'p:school:alice:0';
const row = { user_id: user, argo_school_code: 'school', argo_username: 'alice',
    profile_index: 0, argo_id_soggetto: 'student-1', argo_password: 'sealed' };
const future = () => new Date(Date.now() + 3600000).toISOString();
const stale = () => new Date(Date.now() - 3600000).toISOString();
function setup(options = {}) {
    let connection = { user_id: user, version: 'v1', source: 'interactive', client_id: 'known-client',
        school_code: 'SCHOOL', profile_id: 'student-1', access_token: 'old-access',
        auth_token: 'old-auth', refresh_token: 'old-refresh', expires_at: stale(), state: 'active',
        ...options.connection };
    const events = [];
    let refreshes = 0;
    const store = {
        tokenStorageEnabled: () => options.enabled !== false,
        readConnection: async () => options.missing ? null : { ...connection },
        changeConnection: async (previous, patch) => {
            events.push({ type: 'save', patch: { ...patch } });
            if (options.conflict?.(patch) || previous.version !== connection.version)
                throw Object.assign(new Error('Conflict'), { status: 409, code: 'ARGO_CONNECTION_CHANGED' });
            connection = { ...connection, ...patch, version: previous.version + 'x' };
            return { ...connection };
        },
    };
    const manager = load('lib/argo-token-dashboard.js', {
        './argo-token-store': store,
        './argo-credentials': { refreshArgoToken: async (token, client) => {
            events.push({ type: 'refresh' }); refreshes++;
            assert.equal(token, 'old-refresh');
            assert.equal(client, 'known-client');
            assert.equal(connection.state, 'refreshing');
            if (options.refreshError) throw options.refreshError;
            return { access_token: 'new-access', expires_at: future(),
                ...(options.rotate === false ? {} : { refresh_token: 'new-refresh' }) };
        } },
        './argo': {
            loadProfilesWithAccessToken: async access => {
                events.push({ type: 'profiles' });
                assert.equal(access, connection.access_token);
                assert.equal(connection.state, 'active');
                if (options.bootstrapError) throw options.bootstrapError;
                return options.profiles || [{ idSoggetto: 'student-1', token: 'new-auth', school: 'MINISTRY-ALIAS' }];
            },
            getDashboard: async headers => {
                events.push({ type: 'dashboard' });
                if (options.dashboardError && (!options.failOldOnly || connection.access_token === 'old-access'))
                    throw options.dashboardError;
                assert.ok(JSON.stringify(headers).includes(connection.access_token));
                return { tasks: [] };
            },
        },
    });
    return { load: () => manager.loadTokenDashboard(user, row), connection: () => connection,
        events, refreshes: () => refreshes, store };
}
const unauthorized = () => Object.assign(new Error('private upstream detail'), { response: { status: 401 } });
test('renewal is independent of password policy and persists rotated tokens before profile bootstrap', async () => {
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'false';
    const fixture = setup();
    const result = await fixture.load();
    assert.equal(fixture.refreshes(), 1);
    assert.deepEqual(fixture.events.map(e => e.type), ['save', 'refresh', 'save', 'profiles', 'save', 'dashboard']);
    assert.equal(fixture.connection().refresh_token, 'new-refresh');
    assert.equal(result.row.argo_access_token, 'new-access');
    assert.equal(result.row.argo_auth_token, 'new-auth');
    assert.ok(!JSON.stringify(result).includes('new-refresh'));
});
test('valid tokens avoid refresh and providers that omit rotation keep the previous refresh token', async () => {
    const active = setup({ connection: { expires_at: future() } });
    await active.load();
    assert.equal(active.refreshes(), 0);
    const unchanged = setup({ rotate: false });
    await unchanged.load();
    assert.equal(unchanged.connection().refresh_token, 'old-refresh');
});
test('bootstrap outage retains the rotated token and the next request resumes without refreshing again', async () => {
    const options = { bootstrapError: Object.assign(new Error('secret upstream response'), { response: { status: 500 } }) };
    const fixture = setup(options);
    await assert.rejects(fixture.load(), e => e.status === 503 && !e.message.includes('secret'));
    assert.equal(fixture.connection().refresh_token, 'new-refresh');
    assert.equal(fixture.connection().auth_token, null);
    options.bootstrapError = null;
    await fixture.load();
    assert.equal(fixture.refreshes(), 1);
});
test('revoked and interrupted interactive grants cannot fall back to a stored password', async () => {
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'true';
    for (const options of [
        { refreshError: Object.assign(new Error('revoked'), { status: 401, code: 'ARGO_REAUTH_REQUIRED' }) },
        { connection: { state: 'refreshing' } },
        { connection: { state: 'reauth_required' } },
        { connection: { refresh_token: null } },
    ]) {
        const fixture = setup(options);
        await assert.rejects(fixture.load(), { status: 401, code: 'ARGO_REAUTH_REQUIRED' });
        const count = fixture.refreshes();
        await assert.rejects(fixture.load(), { status: 401 });
        assert.equal(fixture.refreshes(), count);
        assert.equal(fixture.connection().state, 'reauth_required');
    }
});
test('ambiguous refresh failure is not retried with a possibly consumed token', async () => {
    const fixture = setup({ refreshError: Object.assign(new Error('secret-refresh timeout'),
        { status: 503, code: 'ARGO_REFRESH_FAILED' }) });
    await assert.rejects(fixture.load(), e => e.status === 503 && !e.message.includes('secret-refresh'));
    await assert.rejects(fixture.load(), { status: 401 });
    assert.equal(fixture.refreshes(), 1);
});
test('legacy fallback is allowed only for credential grants while password login is enabled', async () => {
    const options = { connection: { source: 'credentials', refresh_token: null } };
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'true';
    assert.equal(await setup(options).load(), null);
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'false';
    await assert.rejects(setup(options).load(), { code: 'ARGO_CREDENTIALS_DISABLED' });
});
test('a rejected valid access token is refreshed at most once', async () => {
    const recover = setup({ connection: { expires_at: future() }, dashboardError: unauthorized(), failOldOnly: true });
    await recover.load();
    assert.equal(recover.refreshes(), 1);
    const revoked = setup({ connection: { expires_at: future() }, dashboardError: unauthorized() });
    await assert.rejects(revoked.load(), { code: 'ARGO_REAUTH_REQUIRED' });
    assert.equal(revoked.refreshes(), 1);
});
test('identity mismatches stop access and refreshed profiles must contain the exact student', async () => {
    for (const connection of [{ school_code: 'different' }, { profile_id: 'sibling' }, { user_id: 'other' }]) {
        const fixture = setup({ connection });
        await assert.rejects(fixture.load(), { status: 409 });
        assert.equal(fixture.events.length, 0);
    }
    const fixture = setup({ profiles: [{ idSoggetto: 'sibling', token: 'other-token' }] });
    await assert.rejects(fixture.load(), { code: 'ARGO_REAUTH_REQUIRED' });
    assert.equal(fixture.events.some(e => e.type === 'dashboard'), false);
});
test('a stale worker must not invalidate a newer connection after losing the version check', async () => {
    const fixture = setup({ conflict: patch => patch.access_token === 'new-access' });
    await assert.rejects(fixture.load(), { code: 'ARGO_CONNECTION_CHANGED' });
    assert.equal(fixture.events.some(e => e.patch?.state === 'reauth_required'), false);
});
test('disabled or absent optional connection returns to the existing path', async () => {
    for (const options of [{ enabled: false }, { missing: true }]) {
        const fixture = setup(options);
        assert.equal(await fixture.load(), null);
        assert.equal(fixture.events.length, 0);
    }
});
test('dashboard session path uses renewable tokens before reading any stored password', async () => {
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'false';
    const db = fakeDb(c => ({ data: c.table === 'google_tokens' && c.op === 'select' ? { ...row } : null }));
    const session = load('lib/argo-session.js', {
        './backend': { ...backend, database: () => db, withLease: async (_, fn) => fn() },
        './helpers': { ...helpers, decryptArgoPassword: () => assert.fail('No password read') },
        './argo-token-dashboard': { loadTokenDashboard: async (id, original) => {
            assert.equal(id, user);
            return { dashboard: { marker: 'renewed' }, row: { ...original, argo_access_token: 'renewed-access' } };
        } },
        './argo': { getDashboard: () => assert.fail('No legacy dashboard path') },
    });
    const result = await session.loadArgoDashboard(user, { force: true });
    assert.equal(result.dashboard.marker, 'renewed');
    assert.equal(result.row.argo_access_token, 'renewed-access');
    assert.equal(db.calls.find(c => c.table === 'argo_snapshots').payload.payload.marker, 'renewed');
});
test('public login response never contains the server-side Argo refresh token', async () => {
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'true';
    const db = fakeDb(() => ({ data: null }));
    let persisted = false;
    const profile = { index: 0, name: 'Alice Rossi', class: '5D (SA)',
        school: 'SCHOOL', idSoggetto: 'student-1', token: 'auth-token' };
    const handler = load('api_internal/login.js', {
        '../lib/backend': { ...backend, database: () => db, quota: async () => {} },
        '../lib/helpers': { ...helpers, isSessionSecurityConfigured: () => true,
            generateSessionToken: async () => 'app-session-token' },
        '../lib/argo-session': { persistCredentials: async (...args) => {
            assert.equal(args[5].refresh_token, 'never-send-this-refresh-secret');
            persisted = true;
        } },
        '../lib/argo': { ...require('../lib/argo'),
            AdvancedArgo: { rawLogin: async () => ({ access_token: 'access-token',
                refresh_token: 'never-send-this-refresh-secret', profiles: [profile] }) },
            enrichProfiles: async () => [profile],
            resolveIdentityForProfile: async () => ({ name: profile.name, cls: profile.class }),
            getDashboard: async () => ({ dati: [] }),
        },
    });
    const out = response();
    await handler(request({ schoolCode: 'school', username: 'alice', password: 'test-password' }), out);
    assert.equal(out.code, 200);
    assert.equal(persisted, true);
    assert.ok(!JSON.stringify(out.body).includes('never-send-this-refresh-secret'));
    assert.ok(!JSON.stringify(out.body).includes('refresh_token'));
});
