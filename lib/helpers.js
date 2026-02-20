const crypto = require('crypto');

const DEBUG_MODE = (process.env.DEBUG_MODE || 'false').toLowerCase() === 'true';

const SENSITIVE_KEYS = new Set([
    'x-auth-token', 'Authorization', 'authToken',
    'access_token', 'token', 'password'
]);

const CLASS_REGEX = /^[1-5][A-Z]{1,2}$/;

// ============= CORS HEADERS =============

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-Client-Info, apikey, x-id-soggetto, x-prg-soggetto, x-auth-token'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}

function handleCors(req, res) {
    setCorsHeaders(res);
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

// ============= IDENTITY =============

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

function safeData(obj) {
    if (!obj) return {};
    if (obj.data) return obj.data;
    if (obj.scheda) return obj.scheda;
    return obj;
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
    DEBUG_MODE,
    CLASS_REGEX,
    USER_AGENT,
    ENDPOINT,
    handleCors,
    setCorsHeaders,
    debugLog,
    redact,
    generateStableId,
    generatePid,
    buildName,
    normalizeClass,
    isValidName,
    safeData,
    createHeaders
};
