const crypto = require('crypto');

const SESSION_TOKEN_HEX_LENGTH = 64;
const SESSION_TOKEN_REGEX = /^[0-9a-fA-F]{64}$/;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Checks if session security is properly configured with a 32-byte (64 hex char) secret key.
 */
function isSessionSecurityConfigured() {
    const key = process.env.ARGO_ENCRYPTION_KEY || '';
    return key.length === SESSION_TOKEN_HEX_LENGTH && /^[0-9a-fA-F]+$/.test(key);
}

/**
 * Retrieves and validates the AES-256 key for Argo password encryption.
 */
function _getEncryptionKey() {
    const keyHex = process.env.ARGO_ENCRYPTION_KEY || '';
    if (!keyHex) {
        throw new Error(
            'ARGO_ENCRYPTION_KEY is not set. Configure a 64-character hex key in Vercel environment variables.',
        );
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
        console.error(
            '❌ Argo password is stored in plaintext format. Plaintext passwords are no longer accepted. Run migration to encrypt existing records.',
        );
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

// Opaque, per-device sessions. Only a digest is stored; legacy stateless HMACs
// deliberately stop working after this migration and require a fresh login.
function sessionDigest(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
async function generateSessionToken(pid) {
    const { getSupabase } = require('./supabase');
    const db = getSupabase();
    if (!db) throw Object.assign(new Error('Database sessioni non disponibile'), { status: 503 });
    const token = crypto.randomBytes(32).toString('hex');
    const { error } = await db.from('app_sessions').insert({
        token_hash: sessionDigest(token),
        user_id: normalizeUserId(pid),
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        refresh_expires_at: new Date(Date.now() + 14 * SESSION_TTL_MS).toISOString(),
    });
    if (error) throw error;
    return token;
}
async function verifySessionToken(req, userId, maxWindows = 1) {
    const token = String(req?.headers?.['x-session-token'] || '').trim();
    if (!userId || !SESSION_TOKEN_REGEX.test(token)) return false;
    const { getSupabase } = require('./supabase');
    const db = getSupabase();
    if (!db) return false;
    const { data, error } = await db
        .from('app_sessions')
        .select('user_id, expires_at, refresh_expires_at, revoked_at')
        .eq('token_hash', sessionDigest(token))
        .eq('user_id', normalizeUserId(userId))
        .maybeSingle();
    if (error) throw Object.assign(new Error('Verifica sessione non disponibile'), { status: 503 });
    return (
        !!data &&
        !data.revoked_at &&
        new Date(data.refresh_expires_at).getTime() > Date.now() &&
        new Date(maxWindows > 1 ? data.refresh_expires_at : data.expires_at).getTime() > Date.now()
    );
}
async function revokeSession(req, userId, all = false) {
    const { getSupabase } = require('./supabase');
    const db = getSupabase();
    if (!db) throw Object.assign(new Error('Database sessioni non disponibile'), { status: 503 });
    let q = db
        .from('app_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', normalizeUserId(userId));
    if (!all) q = q.eq('token_hash', sessionDigest(String(req?.headers?.['x-session-token'] || '')));
    const { error } = await q;
    if (error) throw error;
}

/**
 * Normalizes a user ID to its canonical lowercase form with whitespace removed.
 */
function normalizeUserId(userId) {
    return String(userId || '')
        .toLowerCase()
        .replace(/\s+/g, '');
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
    normalizeUserId,
    revokeSession,
};
