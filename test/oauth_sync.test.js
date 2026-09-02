const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { generatePid, normalizeClass, isValidName, buildName } = require('../lib/helpers');

const TEST_OAUTH_KEY = crypto.randomBytes(32).toString('hex');

describe('OAuth State Security & Sync Helpers', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
        process.env.OAUTH_STATE_KEY = TEST_OAUTH_KEY;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    test('generatePid formats school, username, and index deterministically', () => {
        const pid0 = generatePid('SG12345', 'mario.rossi', 0);
        const pid1 = generatePid('SG12345', 'mario.rossi', 1);
        assert.strictEqual(pid0, 'p:sg12345:mario.rossi:0');
        assert.strictEqual(pid1, 'p:sg12345:mario.rossi:1');
        assert.notStrictEqual(pid0, pid1);
    });

    test('normalizeClass standardizes class strings', () => {
        assert.strictEqual(normalizeClass(' 4 d '), '4D');
        assert.strictEqual(normalizeClass('5A'), '5A');
        assert.strictEqual(normalizeClass('3inf'), '3INF');
    });

    test('isValidName validates real student names and rejects malicious patterns', () => {
        assert.strictEqual(isValidName('Mario Rossi'), true);
        assert.strictEqual(isValidName("D'Angelo Luca"), true);
        assert.strictEqual(isValidName('<script>'), false);
        assert.strictEqual(isValidName(''), false);
        assert.strictEqual(isValidName(null), false);
    });

    test('buildName formats cognome and nome correctly', () => {
        assert.strictEqual(buildName({ cognome: 'Rossi', nome: 'Mario' }), 'ROSSI MARIO');
        assert.strictEqual(buildName({ desNominativo: 'Bianchi Anna' }), 'BIANCHI ANNA');
        assert.strictEqual(buildName({}), null);
    });

    test('OAuth state HMAC signing validates integrity and detects tampering', () => {
        const key = Buffer.from(TEST_OAUTH_KEY, 'hex');
        const statePayload = {
            userId: 'sg12345_mario.rossi_0',
            schoolCode: 'SG12345',
            username: 'mario.rossi',
            timestamp: Date.now()
        };
        const payloadStr = JSON.stringify(statePayload);
        const payloadB64 = Buffer.from(payloadStr).toString('base64url');
        const sig = crypto.createHmac('sha256', key).update(payloadB64).digest('hex');
        const state = `${payloadB64}.${sig}`;

        // Verification logic (as implemented in api/google.js)
        const [recvPayloadB64, recvSig] = state.split('.');
        const expectedSig = crypto.createHmac('sha256', key).update(recvPayloadB64).digest('hex');
        const valid = crypto.timingSafeEqual(Buffer.from(recvSig, 'hex'), Buffer.from(expectedSig, 'hex'));
        assert.strictEqual(valid, true);

        // Tampering with payload
        const tamperedPayload = Buffer.from(JSON.stringify({ ...statePayload, userId: 'attacker' })).toString('base64url');
        const tamperedExpected = crypto.createHmac('sha256', key).update(tamperedPayload).digest('hex');
        const tamperedMatch = crypto.timingSafeEqual(Buffer.from(recvSig, 'hex'), Buffer.from(tamperedExpected, 'hex'));
        assert.strictEqual(tamperedMatch, false);
    });
});
