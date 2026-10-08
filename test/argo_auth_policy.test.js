const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { assertLegacyAuthEnabled, getAuthMethods } = require('../lib/argo-auth-policy');
const auth = require('../api/auth');
const { request, response } = require('./support/backend');

describe('Argo authentication methods and credential policy', () => {
    let original;
    beforeEach(() => {
        original = process.env.ARGO_LEGACY_AUTH_ENABLED;
        delete process.env.ARGO_LEGACY_AUTH_ENABLED;
    });
    afterEach(() => {
        if (original === undefined) delete process.env.ARGO_LEGACY_AUTH_ENABLED;
        else process.env.ARGO_LEGACY_AUTH_ENABLED = original;
    });

    test('an unset flag preserves existing access without claiming federated support', () => {
        assert.doesNotThrow(assertLegacyAuthEnabled);
        assert.deepEqual(getAuthMethods(), {
            credentials: { enabled: true },
            spid: { enabled: false },
            cie: { enabled: false },
            federated: { status: 'requires_provider_integration' },
        });
    });

    test('explicit settings are read at use time and surrounding whitespace is accepted', () => {
        process.env.ARGO_LEGACY_AUTH_ENABLED = ' false\n';
        assert.throws(assertLegacyAuthEnabled, {
            status: 403,
            code: 'ARGO_CREDENTIALS_DISABLED',
            message: 'Accesso con credenziali disabilitato. Il collegamento Argo richiede una modalità di accesso abilitata.',
        });
        assert.equal(getAuthMethods().credentials.enabled, false);
        process.env.ARGO_LEGACY_AUTH_ENABLED = '\ttrue ';
        assert.doesNotThrow(assertLegacyAuthEnabled);
        assert.equal(getAuthMethods().credentials.enabled, true);
    });

    test('misconfiguration never silently enables credential login', () => {
        for (const value of ['', ' ', 'TRUE', 'False', '0', '1', 'yes', 'disabled']) {
            process.env.ARGO_LEGACY_AUTH_ENABLED = value;
            assert.throws(assertLegacyAuthEnabled, { status: 503, code: 'ARGO_AUTH_POLICY_INVALID' });
            assert.throws(getAuthMethods, { status: 503, code: 'ARGO_AUTH_POLICY_INVALID' });
        }
    });

    test('public GET methods requires no session and contains only nonsecret capabilities', async () => {
        const req = request({}, { action: 'methods' }, 'GET');
        req.headers = { origin: 'https://dende197.github.io' };
        const res = response();
        await auth(req, res);
        assert.equal(res.code, 200);
        assert.equal(res.headers['Cache-Control'], 'no-store');
        assert.equal(res.headers.Vary, 'Origin');
        assert.deepEqual(res.body, { success: true, ...getAuthMethods() });
    });

    test('disabling credentials reports all login methods unavailable, without fake fallback', async () => {
        process.env.ARGO_LEGACY_AUTH_ENABLED = 'false';
        const res = response();
        await auth(request({}, { action: 'methods' }, 'GET'), res);
        assert.equal(res.code, 200);
        for (const method of ['credentials', 'spid', 'cie']) assert.equal(res.body[method].enabled, false);
        assert.equal(res.body.federated.status, 'requires_provider_integration');
    });

    test('a malformed flag produces a noncached service error, not misleading capabilities', async () => {
        process.env.ARGO_LEGACY_AUTH_ENABLED = 'invalid-secret-like-value';
        const res = response();
        await auth(request({}, { action: 'methods' }, 'GET'), res);
        assert.equal(res.code, 503);
        assert.equal(res.headers['Cache-Control'], 'no-store');
        assert.equal(res.body.code, 'ARGO_AUTH_POLICY_INVALID');
        assert.equal(res.body.credentials, undefined);
        assert.ok(!JSON.stringify(res.body).includes(process.env.ARGO_LEGACY_AUTH_ENABLED));
    });

    test('methods permits CORS preflight and rejects mutation methods', async () => {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
            const res = response();
            await auth(request({}, { action: 'methods' }, method), res);
            assert.equal(res.code, 405);
            assert.equal(res.headers.Allow, 'GET, OPTIONS');
            assert.equal(res.headers['Cache-Control'], 'no-store');
        }
        const res = response();
        await auth(request({}, { action: 'methods' }, 'OPTIONS'), res);
        assert.equal(res.code, 204);
        assert.equal(res.headers['Cache-Control'], 'no-store');
        assert.equal(res.headers.Vary, 'Origin');
    });
});
