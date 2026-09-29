const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict'),
    crypto = require('node:crypto');
const { fakeDb } = require('./support/backend');
const supabase = require('../lib/supabase');
const auth = require('../lib/auth');
const TEST_ARGO_KEY = crypto.randomBytes(32).toString('hex');
describe('Opaque sessions and authenticated encryption', () => {
    let original, originalGet, rows;
    beforeEach(() => {
        original = { ...process.env };
        process.env.ARGO_ENCRYPTION_KEY = TEST_ARGO_KEY;
        originalGet = supabase.getSupabase;
        rows = [];
        supabase.getSupabase = () =>
            fakeDb((c) => {
                const matches = rows.filter((r) => c.filters.every(([, key, v]) => r[key] === v));
                if (c.op === 'insert') rows.push(c.payload);
                if (c.op === 'update') matches.forEach((r) => Object.assign(r, c.payload));
                return { data: c.op === 'select' ? matches[0] || null : null, error: null };
            });
    });
    afterEach(() => {
        process.env = original;
        supabase.getSupabase = originalGet;
    });
    test('per-device random tokens, only digests persisted', async () => {
        const a = await auth.generateSessionToken('Alice'),
            b = await auth.generateSessionToken('Alice');
        assert.match(a, /^[0-9a-f]{64}$/);
        assert.notEqual(a, b);
        assert.equal(rows[0].user_id, 'alice');
        assert.notEqual(rows[0].token_hash, a);
        assert.equal(await auth.verifySessionToken({ headers: { 'x-session-token': a } }, 'alice'), true);
        assert.equal(await auth.verifySessionToken({ headers: { 'x-session-token': a } }, 'bob'), false);
    });
    test('logout revokes one device and all-devices logout revokes remaining credentials', async () => {
        const a = await auth.generateSessionToken('alice'),
            b = await auth.generateSessionToken('alice');
        const req = { headers: { 'x-session-token': a } };
        await auth.revokeSession(req, 'alice');
        assert.equal(await auth.verifySessionToken(req, 'alice', 14), false);
        assert.equal(await auth.verifySessionToken({ headers: { 'x-session-token': b } }, 'alice'), true);
        await auth.revokeSession(req, 'alice', true);
        assert.equal(await auth.verifySessionToken({ headers: { 'x-session-token': b } }, 'alice'), false);
    });
    test('expired access can refresh, but absolute expiry cannot be extended', async () => {
        const t = await auth.generateSessionToken('alice'),
            req = { headers: { 'x-session-token': t } };
        rows[0].expires_at = new Date(Date.now() - 1).toISOString();
        assert.equal(await auth.verifySessionToken(req, 'alice'), false);
        assert.equal(await auth.verifySessionToken(req, 'alice', 14), true);
        rows[0].expires_at = new Date(Date.now() + 86400000).toISOString();
        rows[0].refresh_expires_at = new Date(Date.now() - 1).toISOString();
        assert.equal(await auth.verifySessionToken(req, 'alice'), false);
        assert.equal(await auth.verifySessionToken(req, 'alice', 14), false);
    });
    test('malformed or legacy unregistered tokens fail closed', async () => {
        for (const token of ['', 'a', 'g'.repeat(64), 'ab'.repeat(32)])
            assert.equal(
                await auth.verifySessionToken({ headers: { 'x-session-token': token } }, 'alice'),
                false,
            );
    });
    test('database outage is not successful authentication', async () => {
        supabase.getSupabase = () => fakeDb(() => ({ error: { message: 'unavailable' } }));
        await assert.rejects(
            () => auth.verifySessionToken({ headers: { 'x-session-token': 'ab'.repeat(32) } }, 'alice'),
            { status: 503 },
        );
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
        const tamperedCiphertext = parts[3].slice(0, -2) + (parts[3].endsWith('ff') ? '00' : 'ff');
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
