const crypto = require('crypto');

const SESSION_TOKEN_HEX_LENGTH = 64;
const SESSION_TOKEN_REGEX = /^[0-9a-fA-F]{64}$/;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Checks if session security is properly configured with a 32-byte (64 hex char) secret key.
 */
function isSessionSecurityConfigured() {
    const key = process.env.SESSION_HMAC_KEY || process.env.ARGO_ENCRYPTION_KEY || '';
    return key.length === SESSION_TOKEN_HEX_LENGTH && /^[0-9a-fA-F]+$/.test(key);
}

/**
 * Retrieves and validates the AES-256 key for Argo password encryption.
 */
function _getEncryptionKey() {
    const keyHex = process.env.ARGO_ENCRYPTION_KEY || '';
    if (!keyHex) {
        throw new Error('ARGO_ENCRYPTION_KEY is not set. Configure a 64-character hex key in Vercel environment variables.');
    }
    if (keyHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(keyHex)) {
        throw new Error('ARGO_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).');
    }
    return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts an Argo password using AES-256-GCM.
 * Output format: enc:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
function encryptArgoPassword(plaintext) {
    if (!plaintext) return null;
    const key = _getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an Argo password stored in AES-256-GCM format.
 * Rejects any plaintext passwords (must start with enc:).
 */
function decryptArgoPassword(stored) {
    if (!stored) return null;
    if (!stored.startsWith('enc:')) {
        console.error('❌ Argo password is stored in plaintext format. Plaintext passwords are no longer accepted. Run migration to encrypt existing records.');
        return null;
    }
    const key = _getEncryptionKey();
    try {
        const parts = stored.slice(4).split(':');
        if (parts.length !== 3) throw new Error('invalid format');
        const iv = Buffer.from(parts[0], 'hex');
        const tag = Buffer.from(parts[1], 'hex');
        const ciphertext = Buffer.from(parts[2], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (e) {
        console.error('⚠️ Argo password decryption failed:', e.message);
        return null;
    }
}

/**
 * Retrieves the signing key for session HMACs.
 */
function _getSessionKey() {
    const key = process.env.SESSION_HMAC_KEY || process.env.ARGO_ENCRYPTION_KEY || '';
    if (!key || key.length !== SESSION_TOKEN_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(key)) return null;
    return Buffer.from(key, 'hex');
}

/**
 * Generates an HMAC-SHA256 session token with a 24-hour time window.
 */
function generateSessionToken(pid) {
    const key = _getSessionKey();
    if (!key) return null;
    const timeWindow = Math.floor(Date.now() / SESSION_TTL_MS);
    return crypto.createHmac('sha256', key)
        .update('g-connect-session:' + pid + ':' + timeWindow)
        .digest('hex');
}

/**
 * Verifies the X-Session-Token header against the expected token for userId.
 * Accepts tokens from the current time window and previous time window (graceful 24-48h overlap).
 */
function verifySessionToken(req, userId) {
    const key = _getSessionKey();
    if (!key) return false;
    const provided = (req && req.headers ? req.headers['x-session-token'] : '') || '';
    const trimmed = String(provided).trim();
    if (!trimmed || !SESSION_TOKEN_REGEX.test(trimmed)) return false;
    const providedBuf = Buffer.from(trimmed, 'hex');
    const currentWindow = Math.floor(Date.now() / SESSION_TTL_MS);
    for (const window of [currentWindow, currentWindow - 1]) {
        const expected = crypto.createHmac('sha256', key)
            .update('g-connect-session:' + userId + ':' + window)
            .digest('hex');
        const expectedBuf = Buffer.from(expected, 'hex');
        if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
            return true;
        }
    }
    return false;
}

/**
 * Normalizes a user ID to its canonical lowercase form with whitespace removed.
 */
function normalizeUserId(userId) {
    return String(userId || '').toLowerCase().replace(/\s+/g, '');
}

module.exports = {
    SESSION_TOKEN_HEX_LENGTH,
    SESSION_TOKEN_REGEX,
    SESSION_TTL_MS,
    isSessionSecurityConfigured,
    encryptArgoPassword,
    decryptArgoPassword,
    generateSessionToken,
    verifySessionToken,
    normalizeUserId
};
