const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// Generate test keys (64 hex characters each)
const TEST_ARGO_KEY = crypto.randomBytes(32).toString('hex');
const TEST_SESSION_KEY = crypto.randomBytes(32).toString('hex');

describe('Authentication & Session Token Security (lib/auth.js)', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
        process.env.ARGO_ENCRYPTION_KEY = TEST_ARGO_KEY;
        process.env.SESSION_HMAC_KEY = TEST_SESSION_KEY;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    test('generateSessionToken generates a 64-character hex HMAC', () => {
        const { generateSessionToken } = require('../lib/auth');
        const token = generateSessionToken('sg12345_mariorossi_0');
        assert.ok(token);
        assert.strictEqual(typeof token, 'string');
        assert.strictEqual(token.length, 64);
        assert.match(token, /^[0-9a-fA-F]{64}$/);
    });

    test('generateSessionToken produces deterministic tokens within the same time window', () => {
        const { generateSessionToken } = require('../lib/auth');
        const token1 = generateSessionToken('sg12345_mariorossi_0');
        const token2 = generateSessionToken('sg12345_mariorossi_0');
        assert.strictEqual(token1, token2);
    });

    test('generateSessionToken produces different tokens for different user IDs', () => {
        const { generateSessionToken } = require('../lib/auth');
        const tokenA = generateSessionToken('user_a');
        const tokenB = generateSessionToken('user_b');
        assert.notStrictEqual(tokenA, tokenB);
    });

    test('verifySessionToken succeeds with valid token in x-session-token header', () => {
        const { generateSessionToken, verifySessionToken } = require('../lib/auth');
        const userId = 'sg12345_mariorossi_0';
        const token = generateSessionToken(userId);
        const req = {
            headers: {
                'x-session-token': token
            }
        };
        assert.strictEqual(verifySessionToken(req, userId), true);
    });

    test('verifySessionToken rejects invalid or tampered tokens', () => {
        const { generateSessionToken, verifySessionToken } = require('../lib/auth');
        const userId = 'sg12345_mariorossi_0';
        const token = generateSessionToken(userId);
        // Tamper with the last character
        const tampered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
        const req = {
            headers: {
                'x-session-token': tampered
            }
        };
        assert.strictEqual(verifySessionToken(req, userId), false);
    });

    test('verifySessionToken rejects non-hex or invalid-length strings without crashing', () => {
        const { verifySessionToken } = require('../lib/auth');
        const req1 = { headers: { 'x-session-token': 'short_token' } };
        const req2 = { headers: { 'x-session-token': 'g'.repeat(64) } };
        const req3 = { headers: {} };
        assert.strictEqual(verifySessionToken(req1, 'user'), false);
        assert.strictEqual(verifySessionToken(req2, 'user'), false);
        assert.strictEqual(verifySessionToken(req3, 'user'), false);
    });

    test('verifySessionToken allows grace period for tokens from previous 24h window', () => {
        const { verifySessionToken, SESSION_TTL_MS } = require('../lib/auth');
        const key = Buffer.from(TEST_SESSION_KEY, 'hex');
        const userId = 'sg12345_mariorossi_0';
        const previousWindow = Math.floor(Date.now() / SESSION_TTL_MS) - 1;
        const prevToken = crypto.createHmac('sha256', key)
            .update('g-connect-session:' + userId + ':' + previousWindow)
            .digest('hex');

        const req = { headers: { 'x-session-token': prevToken } };
        assert.strictEqual(verifySessionToken(req, userId), true);
    });

    test('verifySessionToken rejects expired tokens (older than 48h / 2 windows)', () => {
        const { verifySessionToken, SESSION_TTL_MS } = require('../lib/auth');
        const key = Buffer.from(TEST_SESSION_KEY, 'hex');
        const userId = 'sg12345_mariorossi_0';
        const expiredWindow = Math.floor(Date.now() / SESSION_TTL_MS) - 2;
        const expiredToken = crypto.createHmac('sha256', key)
            .update('g-connect-session:' + userId + ':' + expiredWindow)
            .digest('hex');

        const req = { headers: { 'x-session-token': expiredToken } };
        assert.strictEqual(verifySessionToken(req, userId), false);
    });

    test('encryptArgoPassword and decryptArgoPassword round-trip correctly', () => {
        const { encryptArgoPassword, decryptArgoPassword } = require('../lib/auth');
        const original = 'MyS3cr3tP@ssw0rd!#';
        const encrypted = encryptArgoPassword(original);
        assert.ok(encrypted);
        assert.ok(encrypted.startsWith('enc:'));
        const decrypted = decryptArgoPassword(encrypted);
        assert.strictEqual(decrypted, original);
    });

    test('decryptArgoPassword rejects unencrypted plaintext passwords', () => {
        const { decryptArgoPassword } = require('../lib/auth');
        const plaintext = 'unencrypted_plaintext_password';
        const result = decryptArgoPassword(plaintext);
        assert.strictEqual(result, null);
    });

    test('decryptArgoPassword rejects tampered authentication tags or ciphertexts', () => {
        const { encryptArgoPassword, decryptArgoPassword } = require('../lib/auth');
        const encrypted = encryptArgoPassword('SecretPassword123');
        const parts = encrypted.split(':');
        // Alter ciphertext byte
        const tamperedCiphertext = parts[3].slice(0, -2) + 'ff';
        const tampered = `enc:${parts[1]}:${parts[2]}:${tamperedCiphertext}`;
        const result = decryptArgoPassword(tampered);
        assert.strictEqual(result, null);
    });

    test('normalizeUserId trims whitespace and converts to lowercase', () => {
        const { normalizeUserId } = require('../lib/auth');
        assert.strictEqual(normalizeUserId('  SG12345_Mario Rossi_0  '), 'sg12345_mariorossi_0');
        assert.strictEqual(normalizeUserId(''), '');
        assert.strictEqual(normalizeUserId(null), '');
    });
});
