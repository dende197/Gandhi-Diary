const crypto = require('crypto');

const DEBUG_MODE = (process.env.DEBUG_MODE || 'false').toLowerCase() === 'true';

const SENSITIVE_KEYS = new Set([
    'x-auth-token', 'Authorization', 'authToken',
    'access_token', 'token', 'password'
]);

const CLASS_REGEX = /^[1-5][A-Z]{1,2}$/;
const SESSION_TOKEN_HEX_LENGTH = 64;
const SESSION_TOKEN_REGEX = /^[0-9a-fA-F]{64}$/;

function isSessionSecurityConfigured() {
    const key = process.env.ARGO_ENCRYPTION_KEY || '';
    return key.length === SESSION_TOKEN_HEX_LENGTH && /^[0-9a-fA-F]+$/.test(key);
}

// ============= CORS HEADERS =============

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

function setCorsHeaders(req, res) {
    const origin = (req && req.headers && req.headers.origin) || '';
    const hasExplicitOriginAllowlist = ALLOWED_ORIGINS.length > 0;
    const originAllowed = hasExplicitOriginAllowlist && ALLOWED_ORIGINS.includes(origin);

    if (origin && originAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (!hasExplicitOriginAllowlist) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        // Credentials with wildcard origin are forbidden by browsers and unsafe.
        res.setHeader('Access-Control-Allow-Credentials', 'false');
    } else {
        res.setHeader('Access-Control-Allow-Credentials', 'false');
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-Client-Info, apikey, x-id-soggetto, x-prg-soggetto, x-auth-token, x-session-token'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}

function handleCors(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return true; // Indicates that handler should return
    }
    return false;
}

// ============= LOGGING =============

function debugLog(message, data = null) {
    if (!DEBUG_MODE) return;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 ${message}`);
    if (data !== null) {
        const safe = redact(data);
        try {
            console.log(JSON.stringify(safe, null, 2).substring(0, 2000));
        } catch (e) {
            console.log(String(safe).substring(0, 2000));
        }
    }
    console.log(`${'='.repeat(60)}\n`);
}

// ============= SECURITY =============

function redact(obj) {
    if (!obj) return obj;
    try {
        if (Array.isArray(obj)) return obj.map(v => redact(v));
        if (typeof obj === 'object') {
            const newObj = {};
            for (const [k, v] of Object.entries(obj)) {
                newObj[k] = SENSITIVE_KEYS.has(k) ? '<redacted>' : redact(v);
            }
            return newObj;
        }
    } catch (e) { }
    return obj;
}

// ============= ARGO PASSWORD ENCRYPTION =============
// AES-256-GCM authenticated encryption. Key must be 64 hex chars (32 bytes).
// Stored format: "enc:<iv_hex>:<tag_hex>:<ciphertext_hex>"

const _ENC_KEY_HEX = process.env.ARGO_ENCRYPTION_KEY || '';

function _getEncryptionKey() {
    if (!_ENC_KEY_HEX) {
        throw new Error('ARGO_ENCRYPTION_KEY is not set. Configure a 64-character hex key in Vercel environment variables.');
    }
    if (_ENC_KEY_HEX.length !== 64 || !/^[0-9a-fA-F]+$/.test(_ENC_KEY_HEX)) {
        throw new Error('ARGO_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).');
    }
    return Buffer.from(_ENC_KEY_HEX, 'hex');
}

function encryptArgoPassword(plaintext) {
    if (!plaintext) return null;
    const key = _getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptArgoPassword(stored) {
    if (!stored) return null;
    if (!stored.startsWith('enc:')) return stored; // backward compat: plaintext value
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

// ============= SESSION TOKEN =============

/**
 * Generates a stateless, server-side-only HMAC session token for a given PID.
 * Token = HMAC-SHA256(ARGO_ENCRYPTION_KEY, "g-connect-session:" + pid)
 * No database storage required; verification re-derives the expected value.
 * Returns null if ARGO_ENCRYPTION_KEY is not configured.
 */
function generateSessionToken(pid) {
    const key = process.env.ARGO_ENCRYPTION_KEY || '';
    if (!key || key.length !== SESSION_TOKEN_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(key)) return null;
    return crypto.createHmac('sha256', Buffer.from(key, 'hex'))
        .update('g-connect-session:' + pid)
        .digest('hex');
}

/**
 * Verifies the X-Session-Token header against the expected token for user_id.
 * Returns true if the token is valid OR if ARGO_ENCRYPTION_KEY is not configured (legacy).
 */
function verifySessionToken(req, userId) {
    const key = process.env.ARGO_ENCRYPTION_KEY || '';
    if (!key || key.length !== SESSION_TOKEN_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(key)) return false;
    const provided = (req.headers['x-session-token'] || '').trim();
    if (!provided) return false;
    if (!SESSION_TOKEN_REGEX.test(provided)) return false;
    const expected = crypto.createHmac('sha256', Buffer.from(key, 'hex'))
        .update('g-connect-session:' + userId)
        .digest('hex');
    const providedBuf = Buffer.from(provided, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (providedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

// ============= IDENTITY =============

/**
 * Normalizes a user ID to its canonical lowercase form with whitespace removed.
 * Consistent with the PID format produced by generatePid().
 */
function normalizeUserId(userId) {
    return String(userId || '').toLowerCase().replace(/\s+/g, '');
}

function normalizeUserIdParam(userIdParam) {
    if (userIdParam === null || userIdParam === undefined) return '';
    try {
        return normalizeUserId(decodeURIComponent(String(userIdParam)));
    } catch (e) {
        return normalizeUserId(userIdParam);
    }
}

/**
 * Returns a safe plain-object body for API handlers.
 * @param {import('http').IncomingMessage & { body?: unknown }} req
 * Arrays are rejected because endpoints expect keyed payload objects,
 * so missing/invalid/non-object bodies fall back to an empty object.
 */
function getRequestBody(req) {
    return (req && req.body && typeof req.body === 'object' && !Array.isArray(req.body)) ? req.body : {};
}

function generateStableId(baseString) {
    return crypto.createHash('md5').update(baseString).digest('hex').substring(0, 12);
}

function generatePid(school, user, index) {
    const s = String(school || '').trim().toUpperCase();
    const u = String(user || '').trim().toLowerCase();
    const i = String(index !== undefined ? index : 0);
    return `p:${s}:${u}:${i}`.toLowerCase().replace(/\s+/g, '');
}

function buildName(obj = {}) {
    const full = obj.desNominativo || obj.nominativo;
    if (full) return String(full).trim().toUpperCase();
    const n = obj.desNome || obj.nome || '';
    const c = obj.desCognome || obj.cognome || '';
    const combo = `${String(c).trim()} ${String(n).trim()}`.trim();
    return combo ? combo.toUpperCase() : null;
}

function normalizeClass(raw, strict = false) {
    if (!raw) return null;
    let txt = String(raw).toUpperCase().replace(/\s+/g, ' ').trim();

    const blackList = /\b(ORE|ANNI|ANNO|OGGETTI|OTTOBRE|ORA|ORDINE|OFFERTA|OPZIONE|ORARIO|OVVERO|OGNI|OLTRE)\b/i;
    if (blackList.test(txt)) return null;

    let m = txt.match(/\b([1-5])[\^°]?\s*([A-Z]{1,3})\b/);
    if (m) return m[1] + m[2];

    if (strict) return null;

    m = txt.match(/([1-5])\s*([A-Z]{1,3})/);
    if (m) return m[1] + m[2];

    const digit = (txt.match(/[1-5]/) || [])[0];
    const letter = (txt.match(/[A-Z]/) || [])[0];
    if (digit && letter) return digit + letter;

    return null;
}

function isValidName(name, username = '') {
    if (!name || typeof name !== 'string') return false;
    const t = name.trim().toUpperCase();
    if (t.length < 3) return false;
    if (username && t === username.toUpperCase()) return false;
    if (/PASSWORD|RECUPERA|CAMBIA|LOGOUT|ESC|ACCEDI|REGISTRA|MENU|CERCA/i.test(t)) return false;
    if (/^NOMINATIVO$|^ALUNNO$|^STUDENTE$|^UTENTE$|^SCONOSCIUTO$/i.test(t)) return false;
    if (t.startsWith('STUDENTE ') || t.startsWith('UTENTE ')) return false;
    const parts = t.split(/\s+/).filter(p => p.length >= 2);
    if (parts.length < 2) return false;
    return true;
}

function parseJsonb(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (e) { return fallback; }
    }
    return value;
}

function safeData(obj) {
    if (!obj) return {};
    if (obj.data) return obj.data;
    if (obj.scheda) return obj.scheda;
    return obj;
}

function parseBooleanFlag(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
        return null;
    }
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return null;
    if (['s', 'si', 'sì', 'y', 'yes', 'true', '1'].includes(normalized)) return true;
    if (['n', 'no', 'false', '0'].includes(normalized)) return false;
    return null;
}

function resolveAttendanceJustification(item = {}) {
    // DEBUG TEMPORANEO — rimuovere dopo diagnosi
    if (process.env.DEBUG_MODE === 'true' || process.env.DEBUG === 'true') {
        console.log('[JUSTIFY DEBUG] raw item:', JSON.stringify({
            codEvento: item.codEvento,
            giustificata: item.giustificata,
            flgGiustificata: item.flgGiustificata,
            giustificato: item.giustificato,
            flgGiustificato: item.flgGiustificato,
            daGiustificare: item.daGiustificare,
            flgDaGiustificare: item.flgDaGiustificare,
            datGiustificazione: item.datGiustificazione,
            dataGiustificazione: item.dataGiustificazione,
            datGiustifica: item.datGiustifica,
            giustificaBinUid: item.giustificaBinUid,
            desGiustificazione: item.desGiustificazione,
            motivoGiustificazione: item.motivoGiustificazione,
        }));
    }

    // --- Collect evidence from all known Argo field name variants ---
    const giustificataFlag = parseBooleanFlag(
        item.giustificata ?? item.flgGiustificata ?? item.giustificato ?? item.flgGiustificato
    );
    const daGiustificareFlag = parseBooleanFlag(
        item.daGiustificare ?? item.flgDaGiustificare
    );

    // Helper to check if a string is a valid non-empty date (not placeholder)
    const isValidDateStr = (s) => {
        const val = String(s || '').trim().toLowerCase();
        return val && !['null', '0000-00-00', '00/00/0000', 'undefined', '-'].includes(val);
    };

    // Definitive proof: a VALID justification date means the event IS justified.
    const hasValidGiustificationDate = (
        isValidDateStr(item.datGiustificazione) ||
        isValidDateStr(item.dataGiustificazione) ||
        isValidDateStr(item.datGiustifica)
    );

    // Technical proof: a transaction/UID exists
    // Note: We use this as Priority 1 proof, assuming UID implies confirmation.
    const hasTechnicalProof = !!String(item.giustificaBinUid || '').trim();

    // Secondary info: justification reason/motive
    const hasMotiveInfo = !!(
        String(item.desGiustificazione || '').trim() ||
        String(item.motivoGiustificazione || '').trim()
    );

    // --- Hardened Priority logic ---
    let giustificata = false;

    if (hasValidGiustificationDate || hasTechnicalProof) {
        // Priority 1: Valid date or UID exists → definitively justified
        giustificata = true;
    } else if (daGiustificareFlag === false) {
        // Priority 2: If the event IS NOT to be justified (e.g. pre-authorized),
        // we consider it 'justified' so it doesn't count as a pending absence.
        // This covers the case 'giustificata: N' + 'daGiustificare: false'.
        giustificata = true;
    } else if (giustificataFlag === true) {
        // Priority 3: Explicitly marked as justified
        giustificata = true;
    }
    // Priority 4: Default to false if daGiustificare is true (or missing) 
    // and no positive evidence (S flag or Date) exists.
    // This covers the case 'giustificata: N' + 'daGiustificare: true'.

    return {
        giustificata,
        daGiustificare: !giustificata
    };
}

// ============= ARGO HEADERS =============

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36';
const ENDPOINT = 'https://www.portaleargo.it/appfamiglia/api/rest/';

function createHeaders(school, accessToken, authToken, subjectId = null) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken,
        'Accept': 'application/json',
        'x-cod-min': school,
        'x-auth-token': authToken,
        'User-Agent': USER_AGENT,
        'Accept-Language': 'it-IT,it;q=0.9',
        'X-Requested-With': 'XMLHttpRequest'
    };
    if (subjectId) {
        headers['x-id-soggetto'] = String(subjectId);
        headers['x-prg-soggetto'] = String(subjectId);
    }
    return headers;
}

module.exports = {
    SESSION_TOKEN_HEX_LENGTH,
    DEBUG_MODE,
    CLASS_REGEX,
    isSessionSecurityConfigured,
    USER_AGENT,
    ENDPOINT,
    handleCors,
    setCorsHeaders,
    debugLog,
    redact,
    generateStableId,
    normalizeUserId,
    normalizeUserIdParam,
    getRequestBody,
    generatePid,
    generateSessionToken,
    verifySessionToken,
    buildName,
    normalizeClass,
    isValidName,
    safeData,
    parseBooleanFlag,
    resolveAttendanceJustification,
    parseJsonb,
    createHeaders,
    encryptArgoPassword,
    decryptArgoPassword
};
