const crypto = require('crypto');
const { handleCors, verifySessionToken, normalizeUserId, getRequestBody } = require('../lib/helpers');
const { database, checked, endpoint, httpError, withLease, text } = require('../lib/backend');
const { oauthClient, saveGoogleTokens, syncGoogleUser } = require('../lib/google-sync');
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const HEX_TOKEN_REGEX = /^[0-9a-fA-F]{64}$/;
const WEEK_DAYS = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const PWA_URL = process.env.PWA_URL || 'https://dende197.github.io/Gandhi-Diary/';
function getOAuthStateKey() {
    const key = process.env.OAUTH_STATE_KEY || process.env.ARGO_ENCRYPTION_KEY || '';
    if (!HEX_TOKEN_REGEX.test(key)) return null;
    return Buffer.from(key, 'hex');
}

function encodeBase64Url(str) {
    return Buffer.from(str, 'utf8').toString('base64url');
}

function decodeBase64Url(str) {
    return Buffer.from(str, 'base64url').toString('utf8');
}

function signOAuthState(payload) {
    const key = getOAuthStateKey();
    if (!key) return null;
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', key).update(encodedPayload).digest('hex');
    return `${encodedPayload}.${signature}`;
}

function verifyAndParseOAuthState(rawState) {
    const key = getOAuthStateKey();
    if (!key || !rawState) return null;
    const dot = rawState.lastIndexOf('.');
    if (dot <= 0) return null;
    const encodedPayload = rawState.slice(0, dot);
    const signature = rawState.slice(dot + 1);
    if (!HEX_TOKEN_REGEX.test(signature)) return null;

    const expected = crypto.createHmac('sha256', key).update(encodedPayload).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    try {
        const parsed = JSON.parse(decodeBase64Url(encodedPayload));
        if (!parsed || typeof parsed !== 'object' || !parsed.userId) return null;
        if (
            !Number.isFinite(parsed.ts) ||
            parsed.ts > Date.now() + 30000 ||
            Date.now() - parsed.ts > OAUTH_STATE_TTL_MS
        )
            return null;
        return parsed;
    } catch {
        return null;
    }
}

function validateClassSchedule(schedule) {
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
        return 'deve essere un oggetto JSON';
    }

    const days = Object.keys(schedule);
    if (days.length === 0) return 'deve contenere almeno un giorno';

    for (const day of days) {
        if (!WEEK_DAYS.includes(day)) {
            return `giorno non valido: ${day}. Valori ammessi: ${WEEK_DAYS.join(', ')}`;
        }
        const slots = schedule[day];
        if (!Array.isArray(slots)) return `${day} deve essere un array`;

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
                return `${day}[${i}] deve essere un oggetto`;
            }
            if (typeof slot.materia !== 'string' || !slot.materia.trim()) {
                return `${day}[${i}].materia deve essere una stringa non vuota`;
            }
            if (typeof slot.inizio !== 'string' || !HHMM_REGEX.test(slot.inizio)) {
                return `${day}[${i}].inizio deve essere nel formato HH:MM`;
            }
            if (typeof slot.fine !== 'string' || !HHMM_REGEX.test(slot.fine)) {
                return `${day}[${i}].fine deve essere nel formato HH:MM`;
            }
            const [inizioOre, inizioMin] = slot.inizio.split(':').map(Number);
            const [fineOre, fineMin] = slot.fine.split(':').map(Number);
            const inizioTotMin = inizioOre * 60 + inizioMin;
            const fineTotMin = fineOre * 60 + fineMin;
            if (inizioTotMin >= fineTotMin) {
                return `${day}[${i}] deve avere inizio < fine`;
            }
        }
    }

    return null;
}

function parseAndValidateClassSchedule(rawClassSchedule) {
    let schedule = rawClassSchedule;
    if (typeof rawClassSchedule === 'string') {
        try {
            schedule = JSON.parse(rawClassSchedule);
        } catch (e) {
            return { error: `classSchedule JSON non valido: ${e.message}` };
        }
    }

    const validationError = validateClassSchedule(schedule);
    if (validationError) {
        return { error: `classSchedule non valido: ${validationError}` };
    }

    return { value: schedule };
}

module.exports = endpoint(async function handler(req, res) {
    if (handleCors(req, res)) return;
    const action = req.query.action || 'status';
    const body = getRequestBody(req);
    const allowed = {
        status: ['GET'],
        'auth-url': ['GET', 'POST'],
        callback: ['GET'],
        sync: ['POST'],
        'save-argo': ['POST'],
        disconnect: ['POST', 'DELETE'],
    };
    if (!Object.hasOwn(allowed, action)) throw httpError(400, 'Azione sconosciuta');
    if (!allowed[action].includes(req.method)) throw httpError(405, 'Metodo non consentito');
    if (action === 'callback') {
        const state = verifyAndParseOAuthState(text(req.query.state, 2048));
        if (!state?.nonce) throw httpError(400, 'State OAuth non valido o scaduto');
        // DELETE RETURNING atomically consumes a single-use nonce across instances.
        const states = await checked(
            database()
                .from('oauth_states')
                .delete()
                .eq('nonce', state.nonce)
                .eq('user_id', state.userId)
                .gt('expires_at', new Date().toISOString())
                .select('user_id'),
        );
        if (!states?.length) throw httpError(400, 'Richiesta OAuth già utilizzata o scaduta');
        if (req.query.error) return res.redirect(`${PWA_URL}?google=error`);
        const code = text(req.query.code, 4096);
        if (!code) throw httpError(400, 'Codice OAuth mancante');
        await withLease(`google:${state.userId}`, async () => {
            const { tokens } = await oauthClient().getToken(code);
            await saveGoogleTokens(state.userId, tokens);
        });
        return res.redirect(`${PWA_URL}?google=success#profile`);
    }
    const userId = normalizeUserId(text(req.query.userId || body.userId, 200));
    if (!userId) throw httpError(400, 'userId richiesto');
    if (!(await verifySessionToken(req, userId))) throw httpError(403, 'Sessione non valida');
    if (action === 'auth-url') {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
            throw httpError(503, 'Google OAuth non configurato');
        const nonce = crypto.randomBytes(32).toString('hex');
        const state = signOAuthState({ userId, nonce, ts: Date.now() });
        if (!state) throw httpError(503, 'Chiave OAuth non configurata');
        await checked(
            database()
                .from('oauth_states')
                .insert({
                    nonce,
                    user_id: userId,
                    expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
                }),
        );
        const url = oauthClient().generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar'],
            prompt: 'consent select_account',
            state,
        });
        return req.query.redirect === 'true' ? res.redirect(url) : res.json({ success: true, url });
    }
    if (action === 'status') {
        const row = await checked(
            database()
                .from('google_tokens')
                .select('refresh_token,last_google_sync')
                .eq('user_id', userId)
                .maybeSingle(),
        );
        return res.json({
            success: true,
            connected: !!row?.refresh_token,
            lastSync: row?.last_google_sync || null,
        });
    }
    if (action === 'sync') {
        const options = {};
        if (Object.hasOwn(body, 'classSchedule')) {
            const parsed = parseAndValidateClassSchedule(body.classSchedule);
            if (parsed.error) throw httpError(400, parsed.error);
            options.classSchedule = parsed.value;
        }
        const result = await syncGoogleUser(userId, options);
        return res.status(result.success ? 200 : 502).json(result);
    }
    if (action === 'save-argo') {
        // Credentials are established by the authenticated Argo login only.
        const row = await checked(
            database().from('google_tokens').select('argo_password').eq('user_id', userId).maybeSingle(),
        );
        if (!row?.argo_password)
            throw httpError(409, 'Effettua nuovamente il login Argo per aggiornare le credenziali');
        return res.json({ success: true });
    }
    if (action === 'disconnect') {
        await withLease(`google:${userId}`, async () => {
            const row = await checked(
                database()
                    .from('google_tokens')
                    .select('refresh_token,access_token')
                    .eq('user_id', userId)
                    .maybeSingle(),
            );
            if (row?.refresh_token || row?.access_token) {
                try {
                    await oauthClient().revokeToken(row.refresh_token || row.access_token);
                } catch (e) {
                    if (![400, 401].includes(Number(e.response?.status))) throw e;
                }
            }
            await checked(
                database()
                    .from('google_tokens')
                    .update({
                        access_token: null,
                        refresh_token: null,
                        expiry_date: null,
                        calendar_id: null,
                        last_google_sync: null,
                    })
                    .eq('user_id', userId),
            );
        });
        return res.json({ success: true });
    }
});
