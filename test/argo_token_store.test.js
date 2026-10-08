const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeDb } = require('./support/backend');
const backend = require('../lib/backend');
const { LEGACY_CLIENT_ID } = require('../lib/argo-credentials');
const env = { ...process.env };
afterEach(() => {
    for (const name of ['ARGO_TOKEN_REFRESH_ENABLED', 'ARGO_ENCRYPTION_KEY']) {
        if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
    }
});
const user = 'p:school:alice:0';
const login = { client_id: LEGACY_CLIENT_ID, access_token: 'secret-access',
    refresh_token: 'secret-refresh', expires_at: '2026-11-01T10:00:00Z' };
const profile = { idSoggetto: 'student-1', token: 'secret-auth' };
function setup() {
    process.env.ARGO_TOKEN_REFRESH_ENABLED = 'true';
    process.env.ARGO_ENCRYPTION_KEY = 'ab'.repeat(32);
    let stored;
    const db = fakeDb(c => {
        assert.equal(c.table, 'argo_token_connections');
        if (c.op === 'upsert') stored = { ...c.payload };
        if (c.op === 'update') {
            if (!c.filters.every(([, key, value]) => stored[key] === value)) return { data: null };
            stored = { ...stored, ...c.payload };
        }
        return { data: stored };
    });
    const store = load('lib/argo-token-store.js', { './backend': { ...backend, database: () => db } });
    return { store, db, stored: () => stored };
}
test('token storage is opt-in and invalid flag values fail without database access', async () => {
    const store = load('lib/argo-token-store.js', {
        './backend': { ...backend, database: () => assert.fail('No database access') },
    });
    delete process.env.ARGO_TOKEN_REFRESH_ENABLED;
    assert.equal(store.tokenStorageEnabled(), false);
    assert.equal(await store.readConnection(user), null);
    await store.storeCredentialConnection(user, 'school', {}, {});
    for (const value of ['', 'TRUE', '1', 'yes']) {
        process.env.ARGO_TOKEN_REFRESH_ENABLED = value;
        assert.throws(() => store.tokenStorageEnabled(), { code: 'ARGO_AUTH_POLICY_INVALID' });
    }
});
test('tokens are encrypted in a separate table and round-trip only within the same account and field', async () => {
    const { store, db, stored } = setup();
    await store.storeCredentialConnection(user, 'school', login, profile);
    const serialized = JSON.stringify(db.calls);
    for (const secret of [login.access_token, login.refresh_token, profile.token])
        assert.ok(!serialized.includes(secret));
    const result = await store.readConnection(user);
    assert.equal(result.access_token, login.access_token);
    assert.equal(result.refresh_token, login.refresh_token);
    assert.equal(result.auth_token, profile.token);
    assert.equal(result.school_code, 'SCHOOL');
    assert.equal(result.profile_id, 'student-1');
    assert.equal(result.access_token_encrypted, undefined);
    const original = { ...stored() };
    stored().user_id = 'p:school:bob:0';
    await assert.rejects(store.readConnection('p:school:bob:0'), { code: 'ARGO_TOKEN_STORAGE_FAILED' });
    Object.assign(stored(), original, { auth_token_encrypted: original.access_token_encrypted });
    await assert.rejects(store.readConnection(user), { code: 'ARGO_TOKEN_STORAGE_FAILED' });
});
test('versioned writes reject stale renewals and a fresh grant clears an old refresh token', async () => {
    const { store, stored } = setup();
    await store.storeCredentialConnection(user, 'school', login, profile);
    const first = await store.readConnection(user);
    const claimed = await store.changeConnection(first, { state: 'refreshing', last_error: null });
    assert.notEqual(claimed.version, first.version);
    await assert.rejects(store.changeConnection(first, { access_token: 'stale-token' }),
        { status: 409, code: 'ARGO_CONNECTION_CHANGED' });
    assert.equal((await store.readConnection(user)).access_token, login.access_token);
    await store.storeCredentialConnection(user, 'school', { ...login, refresh_token: undefined }, profile);
    assert.equal(stored().refresh_token_encrypted, null);
    assert.equal(stored().state, 'active');
    await assert.rejects(store.changeConnection(claimed, { state: 'reauth_required' }), { status: 409 });
});
test('malformed tokens, changed encryption key and database failure never expose token material', async () => {
    const { store, db } = setup();
    await store.storeCredentialConnection(user, 'school', login, profile);
    process.env.ARGO_ENCRYPTION_KEY = 'cd'.repeat(32);
    await assert.rejects(store.readConnection(user), { code: 'ARGO_TOKEN_STORAGE_FAILED' });
    process.env.ARGO_ENCRYPTION_KEY = 'ab'.repeat(32);
    const calls = db.calls.length;
    await assert.rejects(store.storeCredentialConnection(user, 'school', { ...login, access_token: 'bad\ntoken' }, profile),
        { code: 'ARGO_TOKEN_STORAGE_FAILED' });
    assert.equal(db.calls.length, calls);
    const failing = load('lib/argo-token-store.js', { './backend': { ...backend,
        database: () => fakeDb(() => ({ error: { message: 'secret-refresh database detail' } })) } });
    await assert.rejects(failing.readConnection(user), error => {
        assert.equal(error.code, 'ARGO_TOKEN_STORAGE_FAILED');
        assert.ok(!error.message.includes('secret-refresh'));
        return true;
    });
});
test('connection updates cannot change identity, provenance or client', async () => {
    const { store } = setup();
    await store.storeCredentialConnection(user, 'school', login, profile);
    const connection = await store.readConnection(user);
    for (const field of ['user_id', 'source', 'profile_id', 'client_id', 'school_code'])
        await assert.rejects(store.changeConnection(connection, { [field]: 'injected' }), { status: 500 });
});
