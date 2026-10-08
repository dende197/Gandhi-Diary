const crypto = require('crypto');
const { database, checked, httpError } = require('./backend');
const { LEGACY_CLIENT_ID, credentialTokenExpiry } = require('./argo-credentials');

const TABLE = 'argo_token_connections';
const FIELDS = ['access_token', 'auth_token', 'refresh_token'];
const COLUMNS = 'user_id,version,source,client_id,school_code,profile_id,access_token_encrypted,auth_token_encrypted,refresh_token_encrypted,expires_at,state,last_error';
const error = (status, code, message) => Object.assign(httpError(status, message), { code });

function tokenStorageEnabled() {
    const value = process.env.ARGO_TOKEN_REFRESH_ENABLED;
    if (value === undefined) return false;
    if (value.trim() === 'true') return true;
    if (value.trim() === 'false') return false;
    throw error(503, 'ARGO_AUTH_POLICY_INVALID', 'Configurazione rinnovo Argo non valida.');
}
function key() {
    const raw = process.env.ARGO_ENCRYPTION_KEY;
    if (!/^[a-f0-9]{64}$/i.test(raw || ''))
        throw error(503, 'ARGO_TOKEN_STORAGE_FAILED', 'Cifratura delle sessioni Argo non configurata.');
    return Buffer.from(raw, 'hex');
}
function validToken(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 16384 && /^[\x21-\x7e]+$/.test(value);
}
function seal(userId, field, value) {
    if (value == null && field !== 'access_token') return null;
    if (!validToken(value)) throw error(503, 'ARGO_TOKEN_STORAGE_FAILED', 'Token Argo non valido.');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    cipher.setAAD(Buffer.from(JSON.stringify(['argo-v1', userId, field])));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}
function unseal(userId, field, value) {
    if (value == null && field !== 'access_token') return null;
    const secret = key();
    try {
        if (typeof value !== 'string' || !/^v1:[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2}){1,16384}$/.test(value))
            throw new Error();
        const [, iv, tag, data] = value.split(':');
        const decipher = crypto.createDecipheriv('aes-256-gcm', secret, Buffer.from(iv, 'hex'));
        decipher.setAAD(Buffer.from(JSON.stringify(['argo-v1', userId, field])));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        const token = Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
        if (!validToken(token)) throw new Error();
        return token;
    } catch (_) {
        throw error(503, 'ARGO_TOKEN_STORAGE_FAILED', 'Impossibile leggere la sessione Argo protetta.');
    }
}
function decode(row) {
    if (!row) return null;
    const result = { ...row };
    for (const field of FIELDS) {
        result[field] = unseal(row.user_id, field, row[field + '_encrypted']);
        delete result[field + '_encrypted'];
    }
    return result;
}
async function query(request) {
    try { return await checked(request); }
    catch (_) { throw error(503, 'ARGO_TOKEN_STORAGE_FAILED', 'Archivio sessioni Argo non disponibile.'); }
}
async function readConnection(userId) {
    if (!tokenStorageEnabled()) return null;
    return decode(await query(database().from(TABLE).select(COLUMNS).eq('user_id', userId).maybeSingle()));
}
async function changeConnection(connection, patch) {
    const allowed = [...FIELDS, 'expires_at', 'state', 'last_error'];
    if (Object.keys(patch).some(field => !allowed.includes(field)))
        throw error(500, 'ARGO_TOKEN_STORAGE_FAILED', 'Aggiornamento sessione Argo non valido.');
    const update = { version: crypto.randomUUID(), updated_at: new Date().toISOString() };
    for (const [field, value] of Object.entries(patch)) {
        if (FIELDS.includes(field)) update[field + '_encrypted'] = seal(connection.user_id, field, value);
        else update[field] = value;
    }
    const saved = await query(database().from(TABLE).update(update).eq('user_id', connection.user_id)
        .eq('version', connection.version).select(COLUMNS).maybeSingle());
    if (!saved) throw error(409, 'ARGO_CONNECTION_CHANGED', 'Sessione Argo aggiornata da un’altra richiesta. Riprova.');
    return decode(saved);
}
async function storeCredentialConnection(userId, school, login, profile) {
    if (!tokenStorageEnabled()) return;
    if (login.client_id !== LEGACY_CLIENT_ID || profile.idSoggetto == null || !String(profile.idSoggetto))
        throw error(503, 'ARGO_TOKEN_STORAGE_FAILED', 'Identità della sessione Argo non disponibile.');
    const row = {
        user_id: userId, version: crypto.randomUUID(), source: 'credentials',
        client_id: login.client_id, school_code: String(school).toUpperCase(),
        profile_id: String(profile.idSoggetto), expires_at: login.expires_at || credentialTokenExpiry(),
        state: 'active', last_error: null, updated_at: new Date().toISOString(),
        access_token_encrypted: seal(userId, 'access_token', login.access_token),
        auth_token_encrypted: seal(userId, 'auth_token', profile.token),
        // A new grant replaces the entire old grant, even if it has no refresh token.
        refresh_token_encrypted: seal(userId, 'refresh_token', login.refresh_token),
    };
    await query(database().from(TABLE).upsert(row, { onConflict: 'user_id' }));
}
module.exports = { tokenStorageEnabled, readConnection, changeConnection, storeCredentialConnection };
