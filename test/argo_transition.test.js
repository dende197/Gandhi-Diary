const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { load, fakeDb, request, response } = require('./support/backend');
const backend = require('../lib/backend');
const helpers = require('../lib/helpers');
const { credentialTokenExpiry } = require('../lib/argo-credentials');

const originalPolicy = process.env.ARGO_LEGACY_AUTH_ENABLED;
afterEach(() => {
    if (originalPolicy === undefined) delete process.env.ARGO_LEGACY_AUTH_ENABLED;
    else process.env.ARGO_LEGACY_AUTH_ENABLED = originalPolicy;
});
const alice = 'p:school:alice:0';
const row = () => ({ user_id: alice, argo_school_code: 'school', argo_username: 'alice',
    profile_index: 0, argo_password: 'encrypted', argo_access_token: 'access',
    argo_auth_token: 'profile-token', argo_id_soggetto: 'student-1',
    argo_tokens_expiry: new Date(Date.now() + 3600000).toISOString() });
const service = db => ({ ...backend, database: () => db, withLease: async (_, fn) => fn() });

test('credential adapter preserves PKCE, token exchange and provider expiry without returning refresh secrets', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-06T10:00:00Z') });
    delete process.env.ARGO_LEGACY_AUTH_ENABLED;
    let challenge, verifier, passwordRequests = 0, tokenRequests = 0;
    const before = Date.now();
    const client = {
        get: async url => {
            const params = new URL(url).searchParams;
            challenge = params.get('code_challenge');
            assert.equal(params.get('code_challenge_method'), 'S256');
            assert.ok(params.get('state'));
            return { request: { res: { responseUrl: 'https://www.portaleargo.it/auth/sso/login?login_challenge=abc123' } } };
        },
        post: async (url, body) => {
            if (url.endsWith('/sso/login')) {
                passwordRequests++;
                assert.equal(body.get('username'), 'alice');
                assert.equal(body.get('password'), 'test-only-password');
                assert.equal(body.get('famiglia_customer_code'), 'SCHOOL');
                return { headers: { location: 'it.argosoft.didup.famiglia.new://login-callback?code=test-code' } };
            }
            tokenRequests++;
            t.mock.timers.tick(5000);
            assert.equal(body.get('grant_type'), 'authorization_code');
            assert.equal(body.get('code'), 'test-code');
            verifier = body.get('code_verifier');
            return { data: { access_token: 'test-token', expires_in: 1800,
                refresh_token: 'not-an-authorized-refresh-integration' } };
        },
    };
    const adapter = load('lib/argo-credentials.js', {
        axios: { create: () => client }, 'axios-cookiejar-support': { wrapper: value => value },
    });
    const login = await adapter.authenticateWithCredentials('SCHOOL', 'alice', 'test-only-password');
    assert.equal(passwordRequests, 1);
    assert.equal(tokenRequests, 1);
    assert.equal(crypto.createHash('sha256').update(verifier).digest('base64url'), challenge);
    assert.equal(login.access_token, 'test-token');
    assert.equal(login.refresh_token, undefined);
    assert.equal(Date.parse(login.expires_at), before + 1800000);
    assert.equal(Date.now(), before + 5000);
});

test('token lifetime respects provider TTL, zero, and the existing fallback ceiling', () => {
    const now = Date.parse('2026-10-06T10:00:00Z');
    for (const value of [30, '30']) assert.equal(Date.parse(credentialTokenExpiry(value, now)), now + 30000);
    assert.equal(Date.parse(credentialTokenExpiry(0, now)), now);
    assert.equal(Date.parse(credentialTokenExpiry(86400, now)), now + 6 * 3600000);
    for (const value of [undefined, null, '', 'invalid', false, -1, Infinity])
        assert.equal(Date.parse(credentialTokenExpiry(value, now)), now + 6 * 3600000);
});

test('disabled credential adapter makes no network request', async () => {
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'false';
    const adapter = load('lib/argo-credentials.js', {
        axios: { create: () => assert.fail('No upstream client may be created') },
    });
    await assert.rejects(adapter.authenticateWithCredentials('school', 'alice', 'password'),
        { status: 403, code: 'ARGO_CREDENTIALS_DISABLED' });
});

test('login and profile resolution reject credentials before database or upstream access', async () => {
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'false';
    for (const file of ['api_internal/login.js', 'api_internal/resolve-profile.js']) {
        const handler = load(file, {
            '../lib/backend': { ...backend, quota: () => assert.fail('No quota/database access') },
            '../lib/argo': { AdvancedArgo: { rawLogin: () => assert.fail('No upstream login') } },
        });
        const res = response();
        await handler(request({ schoolCode: 'school', username: 'alice', password: 'password' }), res);
        assert.equal(res.code, 403);
        assert.equal(res.body.code, 'ARGO_CREDENTIALS_DISABLED');
    }
});

test('manual credential stop preserves existing valid tokens but never decrypts a password for a worker', async () => {
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'false';
    const account = row();
    let upstreamRejects = false, reads = 0;
    const db = fakeDb(c => ({ data: c.table === 'google_tokens' && c.op === 'select' ? account : null, error: null }));
    const session = load('lib/argo-session.js', {
        './backend': service(db),
        './helpers': { ...helpers, decryptArgoPassword: () => assert.fail('Password must remain sealed') },
        './argo': {
            getDashboard: async () => {
                reads++;
                if (upstreamRejects) throw Object.assign(new Error('expired'), { status: 401 });
                return { dati: [] };
            },
            AdvancedArgo: { rawLogin: () => assert.fail('No background credential login') },
        },
    });
    await session.loadArgoDashboard(alice, { force: true });
    assert.equal(reads, 1);
    upstreamRejects = true;
    await assert.rejects(session.loadArgoDashboard(alice, { force: true }), { code: 'ARGO_CREDENTIALS_DISABLED' });
    account.argo_tokens_expiry = '2000-01-01T00:00:00Z';
    await assert.rejects(session.loadArgoDashboard(alice, { force: true }), { code: 'ARGO_CREDENTIALS_DISABLED' });
    assert.equal(reads, 2);
});

test('persisted credentials keep the existing app identity and provider expiry without touching Google tokens', async () => {
    delete process.env.ARGO_LEGACY_AUTH_ENABLED;
    const account = row();
    const db = fakeDb(c => ({ data: c.table === 'google_tokens' && c.op === 'select' ? account : null, error: null }));
    const session = load('lib/argo-session.js', {
        './backend': service(db),
        './helpers': { ...helpers, encryptArgoPassword: () => 'encrypted-test-only' },
        './argo': { resolveIdentityForProfile: async () => ({ cls: '5D' }) },
    });
    const expiry = '2026-10-06T11:30:00.000Z';
    await session.persistCredentials(alice, 'school', 'alice', 'password', 0,
        { access_token: 'new-access', expires_at: expiry }, { token: 'new-profile', idSoggetto: 'student-1', class: '5D' });
    const change = db.calls.find(c => c.table === 'google_tokens' && c.op === 'update');
    assert.equal(change.payload.argo_tokens_expiry, expiry);
    assert.ok(change.filters.some(f => f[1] === 'user_id' && f[2] === alice));
    assert.equal(Object.hasOwn(change.payload, 'refresh_token'), false);
    assert.equal(Object.hasOwn(change.payload, 'access_token'), false);
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'false';
    db.calls.length = 0;
    await assert.rejects(session.persistCredentials(alice, 'school', 'alice', 'password', 0,
        {}, {}), { code: 'ARGO_CREDENTIALS_DISABLED' });
    assert.equal(db.calls.length, 0);
});
