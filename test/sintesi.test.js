const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { getGeminiApiKey, hasGeminiKey, generateWithGemini } = require('../lib/gemini');
const sintesiHandler = require('../api_internal/circolari/sintesi');

describe('Gemini Integration & Circolari Sintesi Handler', () => {
    const origEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...origEnv };
    });

    test('getGeminiApiKey retrieves keys in order of precedence', () => {
        delete process.env.GEMINI_API_KEY_SINTESI;
        delete process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY_PLANNER;
        assert.strictEqual(getGeminiApiKey(), '');
        assert.strictEqual(hasGeminiKey(), false);

        process.env.GEMINI_API_KEY_PLANNER = 'key_planner';
        assert.strictEqual(getGeminiApiKey(), 'key_planner');
        assert.strictEqual(hasGeminiKey(), true);

        process.env.GEMINI_API_KEY = 'key_general';
        assert.strictEqual(getGeminiApiKey(), 'key_general');

        process.env.GEMINI_API_KEY_SINTESI = 'key_sintesi';
        assert.strictEqual(getGeminiApiKey(), 'key_sintesi');
    });

    test('generateWithGemini returns error if no API key is set', async () => {
        delete process.env.GEMINI_API_KEY_SINTESI;
        delete process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY_PLANNER;

        const res = await generateWithGemini({ prompt: 'test' });
        assert.strictEqual(res.success, false);
        assert.ok(res.error.includes('non configurata'));
    });

    test('sintesiHandler rejects non-POST methods with 405', async () => {
        let statusCode = 0;
        let responseData = null;
        const req = { method: 'GET', headers: {} };
        const res = {
            status(code) {
                statusCode = code;
                return this;
            },
            json(data) {
                responseData = data;
                return this;
            },
            setHeader() {}
        };

        await sintesiHandler(req, res);
        assert.strictEqual(statusCode, 405);
    });

    test('sintesiHandler rejects missing link with 400', async () => {
        let statusCode = 0;
        let responseData = null;
        const req = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: {}
        };
        const res = {
            status(code) {
                statusCode = code;
                return this;
            },
            json(data) {
                responseData = data;
                return this;
            },
            setHeader() {}
        };

        await sintesiHandler(req, res);
        assert.strictEqual(statusCode, 400);
        assert.strictEqual(responseData.errorType, 'badRequest');
    });

    test('sintesiHandler rejects non-whitelisted domain (SSRF protection)', async () => {
        let statusCode = 0;
        let responseData = null;
        const req = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: { link: 'https://evil.com/malicious.pdf' }
        };
        const res = {
            status(code) {
                statusCode = code;
                return this;
            },
            json(data) {
                responseData = data;
                return this;
            },
            setHeader() {}
        };

        await sintesiHandler(req, res);
        assert.strictEqual(statusCode, 400);
        assert.strictEqual(responseData.error, 'Link non consentito');
    });

    test('sintesiHandler does NOT block with 403 when session token is absent', async () => {
        // Configure session key so isSessionSecurityConfigured() returns true
        process.env.SESSION_HMAC_KEY = 'a'.repeat(64);

        let statusCode = 0;
        let responseData = null;
        const req = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            // Missing session token and user id
            body: { link: 'https://evil.com/not-allowed.pdf' }
        };
        const res = {
            status(code) {
                statusCode = code;
                return this;
            },
            json(data) {
                responseData = data;
                return this;
            },
            setHeader() {}
        };

        await sintesiHandler(req, res);
        // It should reject with 400 for bad link (SSRF), NOT 403 unauthorized!
        assert.strictEqual(statusCode, 400);
        assert.strictEqual(responseData.error, 'Link non consentito');
    });
});
