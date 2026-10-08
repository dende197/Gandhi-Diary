const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./support/backend');
const backend = require('../lib/backend');
const { LEGACY_CLIENT_ID } = require('../lib/argo-credentials');
const originalPolicy = process.env.ARGO_LEGACY_AUTH_ENABLED;
afterEach(() => {
    if (originalPolicy === undefined) delete process.env.ARGO_LEGACY_AUTH_ENABLED;
    else process.env.ARGO_LEGACY_AUTH_ENABLED = originalPolicy;
});

test('refresh uses only the known token endpoint and client, with no password, cookies or redirects', async t => {
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'false';
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-07T10:00:00Z') });
    const requestedAt = Date.now();
    let calls = 0;
    const adapter = load('lib/argo-credentials.js', {
        axios: {
            create: () => assert.fail('Refresh must not create the credential cookie client'),
            post: async (url, body, options) => {
                calls++;
                assert.equal(url, 'https://auth.portaleargo.it/oauth2/token');
                assert.deepEqual([...body.keys()].sort(), ['client_id', 'grant_type', 'refresh_token']);
                assert.equal(body.get('grant_type'), 'refresh_token');
                assert.equal(body.get('refresh_token'), 'old-refresh-token');
                assert.equal(body.get('client_id'), LEGACY_CLIENT_ID);
                assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
                assert.equal(Object.keys(options.headers).length, 1);
                assert.equal(options.timeout, 15000);
                assert.equal(options.maxRedirects, 0);
                assert.equal(options.signal, backend.signal());
                assert.ok(options.signal instanceof AbortSignal);
                assert.equal(options.jar, undefined);
                t.mock.timers.tick(5000);
                return { status: 200, data: { access_token: 'new-access', token_type: 'Bearer',
                    refresh_token: 'rotated-refresh', expires_in: 1800 } };
            },
        },
    });
    const tokens = await backend.deadline(() => adapter.refreshArgoToken('old-refresh-token', LEGACY_CLIENT_ID));
    assert.equal(calls, 1);
    assert.equal(tokens.access_token, 'new-access');
    assert.equal(tokens.refresh_token, 'rotated-refresh');
    assert.equal(tokens.client_id, LEGACY_CLIENT_ID);
    assert.equal(Date.parse(tokens.expires_at), requestedAt + 1800000);
    assert.equal(Date.now(), requestedAt + 5000);
});

test('unknown client or malformed refresh token fails before any upstream request', async () => {
    const adapter = load('lib/argo-credentials.js', {
        axios: { post: () => assert.fail('Invalid token provenance must not reach the token endpoint') },
    });
    for (const client of [undefined, '', 'another-client', { client_id: LEGACY_CLIENT_ID }]) {
        await assert.rejects(adapter.refreshArgoToken('refresh-token', client),
            { status: 401, code: 'ARGO_REAUTH_REQUIRED' });
    }
    for (const token of [undefined, '', 'with space', 'with\nnewline', 'non-ascii-é', 'x'.repeat(16385), {}]) {
        await assert.rejects(adapter.refreshArgoToken(token, LEGACY_CLIENT_ID),
            { status: 401, code: 'ARGO_REAUTH_REQUIRED' });
    }
});

test('a provider that does not rotate refresh tokens leaves the refresh field absent', async () => {
    for (const tokenType of [undefined, 'Bearer', 'bearer', 'BEARER']) {
        const adapter = load('lib/argo-credentials.js', {
            axios: { post: async () => ({ data: { access_token: 'new-access', token_type: tokenType, expires_in: '30' } }) },
        });
        const tokens = await adapter.refreshArgoToken('keep-existing-refresh', LEGACY_CLIENT_ID);
        assert.equal(Object.hasOwn(tokens, 'refresh_token'), false);
        assert.equal(tokens.client_id, LEGACY_CLIENT_ID);
        assert.equal(tokens.access_token, 'new-access');
    }
});

test('malformed access token, unsupported token type and redirect response fail safely', async () => {
    const responses = [
        { data: {} },
        { data: { access_token: {} } },
        { data: { access_token: 'invalid\r\ntoken' } },
        { data: { access_token: 'x'.repeat(16385) } },
        { data: { access_token: 'access', token_type: 'MAC' } },
        { data: { access_token: 'access', token_type: {} } },
        { data: { access_token: 'access', token_type: null } },
        { data: { access_token: 'access', refresh_token: '' } },
        { data: { access_token: 'access', refresh_token: null } },
        { data: { access_token: 'access', refresh_token: 'invalid\nrefresh' } },
        { status: 302, headers: { location: 'https://other.example/' }, data: { access_token: 'access' } },
    ];
    for (const response of responses) {
        const adapter = load('lib/argo-credentials.js', { axios: { post: async () => response } });
        await assert.rejects(adapter.refreshArgoToken('refresh', LEGACY_CLIENT_ID),
            { status: 503, code: 'ARGO_REFRESH_FAILED' });
    }
});

test('invalid grant and unauthorized require reauthentication; outages and other errors remain retryable', async () => {
    for (const [status, providerCode, expectedStatus, expectedCode] of [
        [400, 'invalid_grant', 401, 'ARGO_REAUTH_REQUIRED'],
        [401, 'unauthorized', 401, 'ARGO_REAUTH_REQUIRED'],
        [400, 'invalid_client', 503, 'ARGO_REFRESH_FAILED'],
        [429, 'rate_limited', 503, 'ARGO_REFRESH_FAILED'],
        [500, 'server_error', 503, 'ARGO_REFRESH_FAILED'],
        [undefined, undefined, 503, 'ARGO_REFRESH_FAILED'],
    ]) {
        const adapter = load('lib/argo-credentials.js', {
            axios: { post: async () => {
                throw Object.assign(new Error('private-refresh-secret in unsafe provider error'), {
                    response: status === undefined ? undefined : { status,
                        data: { error: providerCode, error_description: 'private-refresh-secret' } },
                    config: { data: 'refresh_token=private-refresh-secret' },
                });
            } },
        });
        await assert.rejects(adapter.refreshArgoToken('private-refresh-secret', LEGACY_CLIENT_ID), error => {
            assert.equal(error.status, expectedStatus);
            assert.equal(error.code, expectedCode);
            assert.equal(error.response, undefined);
            assert.equal(error.config, undefined);
            assert.ok(!error.message.includes('private-refresh-secret'));
            assert.ok(!JSON.stringify(error).includes('private-refresh-secret'));
            return true;
        });
    }
});

test('profile bootstrap works with a real token independently of credential login policy', async () => {
    process.env.ARGO_LEGACY_AUTH_ENABLED = 'false';
    let calls = 0;
    const argo = load('lib/argo.js', {
        './argo-credentials': { authenticateWithCredentials: () => assert.fail('No password login') },
        axios: { post: async (url, body, options) => {
            calls++;
            assert.equal(url, 'https://www.portaleargo.it/appfamiglia/api/rest/login');
            assert.equal(options.headers.Authorization, 'Bearer parent-token');
            assert.equal(body['x-auth-token-corrente'], null);
            return { data: { data: [
                { idSoggetto: 'subject-a', token: 'profile-a', codMin: 'SC001', username: 'parent',
                    alunno: { nome: 'Mario', cognome: 'Rossi', desClasse: '5D' } },
                { prgAlunno: 'subject-b', token: 'profile-b',
                    alunno: { nome: 'Anna', cognome: 'Rossi', desClasse: '3C' } },
            ] } };
        } },
    });
    const profiles = await argo.loadProfilesWithAccessToken('parent-token', { school: 'SC002', username: 'parent-fallback' });
    assert.equal(calls, 1);
    assert.equal(profiles.length, 2);
    assert.equal(profiles[0].idSoggetto, 'subject-a');
    assert.equal(profiles[0].school, 'SC001');
    assert.equal(profiles[0].username, 'parent');
    assert.equal(profiles[0].token, 'profile-a');
    assert.equal(profiles[0].index, 0);
    assert.equal(profiles[1].idSoggetto, 'subject-b');
    assert.equal(profiles[1].school, 'SC002');
    assert.equal(profiles[1].username, 'parent-fallback');
    assert.equal(profiles[1].index, 1);
    for (const value of [undefined, {}, '', 'bad\nheader'])
        await assert.rejects(argo.loadProfilesWithAccessToken(value), { code: 'ARGO_REAUTH_REQUIRED' });
    assert.equal(calls, 1);
});

test('legacy login composes the same profile bootstrap and keeps refresh metadata internal', async () => {
    const jar = {};
    const metadata = { access_token: 'legacy-access', refresh_token: 'legacy-refresh',
        client_id: LEGACY_CLIENT_ID, expires_at: '2026-10-07T11:00:00.000Z', jar };
    let authentications = 0;
    const argo = load('lib/argo.js', {
        './argo-credentials': { authenticateWithCredentials: async (...args) => {
            authentications++;
            assert.deepEqual(args, ['SC001', 'alice', 'password']);
            return metadata;
        } },
        axios: { post: async (_, __, options) => {
            assert.equal(options.headers.Authorization, 'Bearer legacy-access');
            return { data: { data: [{ idSoggetto: 'student', token: 'profile-token' }] } };
        } },
    });
    const login = await argo.AdvancedArgo.rawLogin('SC001', 'alice', 'password');
    assert.equal(authentications, 1);
    for (const [key, value] of Object.entries(metadata)) assert.equal(login[key], value);
    assert.equal(login.profiles[0].school, 'SC001');
    assert.equal(login.profiles[0].username, 'alice');
});
