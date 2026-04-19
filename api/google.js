/**
 * api/google.js
 * Universal Google Calendar OAuth2 — per-user flow.
 * 
 * Actions:
 *   ?action=auth-url   → Genera URL di consenso Google
 *   ?action=callback    → Riceve auth code, scambia per tokens, salva in Supabase
 *   ?action=sync        → Sincronizza compiti Argo → Google Calendar dell'utente
 *   ?action=disconnect  → Rimuove i tokens Google dell'utente
 *   ?action=status      → Verifica se l'utente ha Google collegato
 */

const crypto = require('crypto');
const { google } = require('googleapis');
const { AdvancedArgo, getDashboard, extractHomeworkFromDashboard } = require('../lib/argo');
const { syncTasksToCalendar } = require('../lib/googleCalendar');
const {
    createHeaders, debugLog, encryptArgoPassword, decryptArgoPassword,
    handleCors, verifySessionToken, normalizeUserId, generatePid, SESSION_TOKEN_HEX_LENGTH,
    getRequestBody
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const { getArgoCredentials } = require('../lib/session-vault');

// --- Google OAuth2 Config ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 
    (process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}/api/google?action=callback`
        : 'https://g-connect-backend-r5j1.vercel.app/api/google?action=callback');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ARGO_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h conservative TTL
const HEX_TOKEN_REGEX = new RegExp(`^[0-9a-fA-F]{${SESSION_TOKEN_HEX_LENGTH}}$`);
const WEEK_DAYS = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function getOAuth2Client() {
    return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
}

function getOAuthStateKey() {
    const key = process.env.ARGO_ENCRYPTION_KEY || '';
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
        if (!parsed.ts || (Date.now() - Number(parsed.ts)) > OAUTH_STATE_TTL_MS) return null;
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

function parseProfileIndex(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function getVaultCredentialsByCandidates(candidates = []) {
    const dedupedCandidates = [...new Set(
        candidates
            .map(candidate => String(candidate || '').trim().toLowerCase())
            .filter(Boolean)
    )];

    for (const candidate of dedupedCandidates) {
        const creds = getArgoCredentials(candidate);
        if (creds?.password) return creds;
    }
    return null;
}

function getVaultCredentialsFromContext({ userId, schoolCode, username, profileIndex } = {}) {
    const normalizedUserId = normalizeUserId(userId);
    const candidates = [normalizedUserId];

    if (schoolCode && username) {
        candidates.push(generatePid(schoolCode, username, parseProfileIndex(profileIndex, 0)));
    }

    return getVaultCredentialsByCandidates(candidates);
}

// --- Token Storage (Supabase) ---
async function saveTokens(userId, tokens, argoCreds = null) {
    const normalizedUserId = normalizeUserId(userId);
    const upsertData = {
        user_id: normalizedUserId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date || null,
        calendar_id: 'primary',
        updated_at: new Date().toISOString()
    };

    // If argo credentials provided (during initial link), save them too
    if (argoCreds) {
        upsertData.argo_school_code = argoCreds.schoolCode;
        upsertData.argo_username = argoCreds.username;
        upsertData.argo_password = encryptArgoPassword(argoCreds.password);
        upsertData.profile_index = argoCreds.profileIndex ?? 0;
    }

    const { error } = await getSupabase()
        .from('google_tokens')
        .upsert(upsertData, { onConflict: 'user_id' });

    if (error) throw new Error(`Supabase save error: ${error.message}`);
}

async function loadTokens(userId) {
    const normalizedUserId = normalizeUserId(userId);
    const { data, error } = await getSupabase()
        .from('google_tokens')
        .select('*')
        .eq('user_id', normalizedUserId)
        .single();
    if (error || !data) return null;
    return data;
}

async function deleteTokens(userId) {
    const normalizedUserId = normalizeUserId(userId);
    const { error } = await getSupabase()
        .from('google_tokens')
        .delete()
        .eq('user_id', normalizedUserId);
    if (error) throw new Error(`Supabase delete error: ${error.message}`);
}

function getAuthenticatedClient(tokenRow) {
    const oauth2 = getOAuth2Client();
    oauth2.setCredentials({
        access_token: tokenRow.access_token,
        refresh_token: tokenRow.refresh_token,
        expiry_date: tokenRow.expiry_date
    });
    // Auto-refresh: when tokens are refreshed, update Supabase
    oauth2.on('tokens', async (newTokens) => {
        try {
            const update = { 
                access_token: newTokens.access_token,
                expiry_date: newTokens.expiry_date,
                updated_at: new Date().toISOString()
            };
            if (newTokens.refresh_token) update.refresh_token = newTokens.refresh_token;
            await getSupabase().from('google_tokens').update(update).eq('user_id', tokenRow.user_id);
        } catch (e) {
            console.error('Token auto-refresh save failed:', e.message);
        }
    });
    return oauth2;
}

// ============= HANDLER =============
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const action = req.query.action || 'status';

    try {
        switch (action) {

            // ============= AUTH URL =============
            case 'auth-url': {
                if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
                    return res.status(500).json({ success: false, error: 'Google OAuth non configurato sul server' });
                }
                if (req.method !== 'GET' && req.method !== 'POST') {
                    return res.status(405).json({ success: false, error: 'Method not allowed' });
                }

                const userId = req.query.userId || getRequestBody(req).userId;
                if (!userId) return res.status(400).json({ success: false, error: 'userId richiesto' });

                const normalizedUserId = normalizeUserId(userId);
                if (!verifySessionToken(req, normalizedUserId)) {
                    return res.status(403).json({ success: false, error: 'Non autorizzato' });
                }

                let argoCreds = null;
                if (req.query.state) {
                    try {
                        const decoded = JSON.parse(Buffer.from(req.query.state, 'base64').toString('utf8'));
                        if (decoded?.argo && typeof decoded.argo === 'object') argoCreds = decoded.argo;
                    } catch (e) {
                        debugLog('[Google OAuth] Invalid state payload from client', e.message);
                    }
                }
                if (!argoCreds) {
                    const credsFromVault = getVaultCredentialsFromContext({ userId: normalizedUserId });
                    if (credsFromVault?.password) {
                        argoCreds = {
                            schoolCode: credsFromVault.schoolCode,
                            username: credsFromVault.username,
                            password: credsFromVault.password,
                            profileIndex: credsFromVault.profileIndex ?? 0
                        };
                    }
                }

                const signedState = signOAuthState({
                    userId: normalizedUserId,
                    argo: argoCreds,
                    ts: Date.now()
                });
                if (!signedState) {
                    return res.status(500).json({ success: false, error: 'OAuth state signing key non configurata' });
                }

                const oauth2 = getOAuth2Client();
                const url = oauth2.generateAuthUrl({
                    access_type: 'offline',
                    scope: SCOPES,
                    // Space-separated prompts: force consent screen + account picker
                    // to avoid cross-profile Google account reuse.
                    prompt: 'consent select_account',
                    state: signedState
                });

                if (req.query.redirect === 'true') {
                    return res.redirect(url);
                }

                return res.json({ success: true, url });
            }

            // ============= CALLBACK =============
            case 'callback': {
                const code = req.query.code;
                const stateParam = req.query.state;
                const error = req.query.error;

                const parsedState = verifyAndParseOAuthState(stateParam);
                const userId = parsedState?.userId || null;
                const argoCreds = parsedState?.argo || null;

                debugLog('[OAuth] Code received', { codePrefix: code?.slice(0, 10) });
                if (error) {
                    console.error('[Google OAuth] Error from Google:', error);
                    return res.redirect('/?google=error&reason=' + encodeURIComponent(error));
                }

                if (!code || !userId) {
                    return res.status(400).json({ success: false, error: 'Parametri mancanti o state non valido/scaduto' });
                }

                try {
                    const oauth2 = getOAuth2Client();
                    const { tokens } = await oauth2.getToken(code);
                    
                    await saveTokens(userId, tokens, argoCreds);
                    debugLog('Google Calendar linked', { userId, hasArgo: !!argoCreds });

                    // Redirect alla PWA
                    return res.redirect('/#profile?google=success');
                } catch (tokenErr) {
                    console.error('[Google OAuth] Token exchange failed:', tokenErr.message);
                    if (tokenErr.message.includes('invalid_client')) {
                        console.error('[Google OAuth] SUGGERIMENTO: Controlla che GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET siano corretti su Vercel.');
                    }
                    throw tokenErr;
                }
            }

            // ============= STATUS =============
            case 'status': {
                const userId = req.query.userId || getRequestBody(req).userId;
                if (!userId) return res.status(400).json({ success: false, error: 'userId richiesto' });

                if (!verifySessionToken(req, normalizeUserId(userId))) {
                    return res.status(403).json({ success: false, error: 'Non autorizzato' });
                }

                const tokenRow = await loadTokens(userId);
                return res.json({
                    success: true,
                    connected: !!tokenRow,
                    lastSync: tokenRow?.updated_at || null
                });
            }

            // ============= SYNC =============
            case 'sync': {
                const body = getRequestBody(req);
                const userId = body.userId;
                const session = body.session; // Argo session

                if (!userId) return res.status(400).json({ success: false, error: 'userId richiesto' });
                const normalizedUserId = normalizeUserId(userId);

                if (!verifySessionToken(req, normalizedUserId)) {
                    return res.status(403).json({ success: false, error: 'Non autorizzato' });
                }

                // 1. Load Google tokens
                const tokenRow = await loadTokens(userId);
                if (!tokenRow) {
                    return res.status(401).json({
                        success: false,
                        error: 'Google Calendar non collegato. Accedi con Google dal profilo.'
                    });
                }

                // 2. Get Argo tasks
                let tasks = body.tasks; // Client can send tasks directly
                
                if (!tasks && session) {
                    // Fetch fresh tasks from Argo
                    let schoolCode = session.schoolCode;
                    let userName = session.userName || session.username;
                    let password = session.password;
                    let resolvedProfileIndex = session.profileIndex ?? tokenRow.profile_index ?? 0;
                    
                    // Fallback: se la password non arriva dal client, usa le credenziali Argo salvate in Supabase
                    if (!password && tokenRow) {
                        schoolCode = schoolCode || tokenRow.argo_school_code;
                        userName = userName || tokenRow.argo_username;
                        password = decryptArgoPassword(tokenRow.argo_password);
                        resolvedProfileIndex = session.profileIndex ?? tokenRow.profile_index ?? resolvedProfileIndex;
                    }

                    // Resilient fallback: use session vault when available (recently logged-in user).
                    if (!password) {
                        const credsFromVault = getVaultCredentialsFromContext({
                            userId: normalizedUserId,
                            schoolCode: schoolCode || tokenRow.argo_school_code,
                            username: userName || tokenRow.argo_username,
                            profileIndex: resolvedProfileIndex
                        });
                        if (credsFromVault?.password) {
                            schoolCode = schoolCode || credsFromVault.schoolCode;
                            userName = userName || credsFromVault.username;
                            password = credsFromVault.password;
                            resolvedProfileIndex = session.profileIndex ?? credsFromVault.profileIndex ?? resolvedProfileIndex;
                        }
                    }

                    // Resilient fallback: try Argo tokens already available in the client session.
                    if (!password && session?.accessToken && session?.authToken && schoolCode) {
                        try {
                            const headersFromSession = createHeaders(
                                schoolCode,
                                session.accessToken,
                                session.authToken,
                                session.idSoggetto || session.subjectId || null
                            );
                            const dashboardData = await getDashboard(headersFromSession);
                            tasks = extractHomeworkFromDashboard(dashboardData);
                        } catch (sessionTokenErr) {
                            debugLog('[Google sync] Session token fallback failed', {
                                userId: normalizedUserId,
                                reason: sessionTokenErr?.message || 'unknown'
                            });
                            // Se i token sessione non sono più validi si prosegue con i fallback tradizionali
                        }
                    }
                    
                    // Fallback: cached Argo tokens persisted in Supabase (usable even without password)
                    if (!tasks && !password && tokenRow?.argo_access_token && tokenRow?.argo_auth_token) {
                        const expiry = tokenRow.argo_tokens_expiry ? new Date(tokenRow.argo_tokens_expiry) : null;
                        if (expiry && expiry > new Date()) {
                            try {
                                const cachedHeaders = createHeaders(
                                    schoolCode || tokenRow.argo_school_code,
                                    tokenRow.argo_access_token,
                                    tokenRow.argo_auth_token,
                                    tokenRow.argo_id_soggetto || session?.idSoggetto || null
                                );
                                const dashboardData = await getDashboard(cachedHeaders);
                                tasks = extractHomeworkFromDashboard(dashboardData);
                                debugLog('[Google sync] ✅ Used cached Argo tokens from Supabase');
                            } catch (cachedErr) {
                                debugLog('[Google sync] ⚠️ Supabase cached tokens failed', cachedErr.message);
                            }
                        }
                    }

                    if (!tasks && !password) {
                        return res.status(400).json({ 
                            success: false, 
                            error: 'Credenziali Argo non trovate. Collega nuovamente Google o rieffettua il login.' 
                        });
                    }
                    
                    if (!tasks) {
                        try {
                            const loginRes = await AdvancedArgo.rawLogin(schoolCode, userName, password);
                            const { access_token, profiles } = loginRes;
                            if (!profiles || profiles.length === 0) throw new Error('Nessun profilo Argo');

                            const rawProfileIndex = resolvedProfileIndex;
                            const parsedProfileIndex = Number(rawProfileIndex);
                            const profileIndex = Number.isFinite(parsedProfileIndex) ? parsedProfileIndex : 0;
                            // AdvancedArgo can expose the active profile either via profile fields (index/profileIndex)
                            // or, in some responses, only by array position.
                            const profileByIndexField = profiles.find(p => Number(p.index ?? p.profileIndex) === profileIndex);
                            const profileByArrayIndex = Number.isInteger(profileIndex) && profileIndex >= 0 && profileIndex < profiles.length
                                ? profiles[profileIndex]
                                : null;
                            // Fallback order: explicit profile index field -> validated array index -> first available profile.
                            const targetProfile = profileByIndexField || profileByArrayIndex || profiles[0];
                            const authToken = targetProfile.token;
                            const subjectId = targetProfile.idSoggetto;
                            const headers = createHeaders(schoolCode, access_token, authToken, subjectId);
                            const dashboardData = await getDashboard(headers);
                            tasks = extractHomeworkFromDashboard(dashboardData);

                            try {
                                const expiry = new Date(Date.now() + ARGO_TOKEN_TTL_MS).toISOString();
                                const { error: persistError } = await getSupabase().from('google_tokens').upsert({
                                    user_id: normalizeUserId(userId),
                                    argo_access_token: access_token,
                                    argo_auth_token: authToken,
                                    argo_tokens_expiry: expiry,
                                    argo_id_soggetto: targetProfile?.idSoggetto ?? null,
                                    updated_at: new Date().toISOString()
                                }, { onConflict: 'user_id' });
                                if (persistError) throw persistError;
                                debugLog('[Google sync] ✅ Persisted fresh Argo tokens');
                            } catch (persistErr) {
                                debugLog('[Google sync] ⚠️ Token persist failed', persistErr.message);
                            }
                        } catch (argoErr) {
                            console.error('Argo fetch failed:', argoErr.message);
                            return res.status(500).json({
                                success: false,
                                error: 'Impossibile recuperare i compiti da Argo: ' + argoErr.message
                            });
                        }
                    }
                }

                if (!tasks || tasks.length === 0) {
                    return res.json({ success: true, added: 0, skipped: 0, message: 'Nessun compito trovato' });
                }

                // 3. Sync to user's Google Calendar
                const auth = getAuthenticatedClient(tokenRow);
                const calendarId = tokenRow.calendar_id || 'primary';

                // Resolve per-user class schedule: request body takes priority, then stored value
                let classSchedule = null;
                let usedScheduleFallback = false;
                const hasClassScheduleInBody = Object.prototype.hasOwnProperty.call(body, 'classSchedule');
                if (hasClassScheduleInBody) {
                    const parsedBodySchedule = parseAndValidateClassSchedule(body.classSchedule);
                    if (parsedBodySchedule.error) {
                        return res.status(400).json({ success: false, error: parsedBodySchedule.error });
                    }
                    classSchedule = parsedBodySchedule.value;
                } else if (tokenRow.class_schedule) {
                    const parsedStoredSchedule = parseAndValidateClassSchedule(tokenRow.class_schedule);
                    if (parsedStoredSchedule.error) {
                        usedScheduleFallback = true;
                        console.warn('[Google sync] Invalid stored class_schedule - using default schedule', {
                            userId: normalizeUserId(userId),
                            reason: parsedStoredSchedule.error
                        });
                    } else {
                        classSchedule = parsedStoredSchedule.value;
                    }
                }

                const result = await syncTasksToCalendar(tasks, calendarId, auth, classSchedule);

                debugLog(`Calendar sync result`, { userId, added: result.added, skipped: result.skipped });

                if (!result.success) {
                    const has403 = result.errors.some(e =>
                        e.includes('403') || e.includes('Forbidden') || e.includes('insufficient')
                    );
                    if (has403) {
                        return res.status(403).json({
                            success: false,
                            error: 'GOOGLE_AUTH_EXPIRED',
                            message: 'Reconnect Google account',
                            details: result.errors
                        });
                    }
                }

                return res.json({
                    success: true,
                    ...result,
                    usedScheduleFallback: usedScheduleFallback || !!result.usedScheduleFallback,
                    total_tasks: tasks.length
                });
            }

            // ============= SAVE ARGO CREDENTIALS =============
            case 'save-argo': {
                const { userId, schoolCode, username, password, profileIndex } = getRequestBody(req);
                if (!userId) {
                    return res.status(400).json({ success: false, error: 'userId richiesto' });
                }

                if (!verifySessionToken(req, normalizeUserId(userId))) {
                    return res.status(403).json({ success: false, error: 'Non autorizzato' });
                }

                const fromVault = getVaultCredentialsFromContext({
                    userId,
                    schoolCode,
                    username,
                    profileIndex
                });
                const resolvedSchoolCode = schoolCode || fromVault?.schoolCode || null;
                const resolvedUsername = username || fromVault?.username || null;
                const resolvedPassword = password || fromVault?.password || null;
                const resolvedProfileIndex = profileIndex ?? fromVault?.profileIndex ?? 0;

                // If already present in DB and no fresh credentials are available, allow no-op success.
                if (!resolvedSchoolCode || !resolvedUsername || !resolvedPassword) {
                    const existing = await loadTokens(userId);
                    if (existing?.argo_school_code && existing?.argo_username && existing?.argo_password) {
                        return res.json({ success: true, message: 'Credenziali Argo già presenti' });
                    }
                    return res.status(400).json({ success: false, error: 'Credenziali Argo non disponibili. Esegui nuovamente il login Argo.' });
                }

                const { error } = await getSupabase()
                    .from('google_tokens')
                    .upsert({
                        user_id: normalizeUserId(userId),
                        argo_school_code: resolvedSchoolCode,
                        argo_username: resolvedUsername,
                        argo_password: encryptArgoPassword(resolvedPassword),
                        profile_index: resolvedProfileIndex,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });

                if (error) throw error;
                return res.json({ success: true, message: 'Credenziali Argo salvate' });
            }

            // ============= SAVE CLASS SCHEDULE =============
            case 'save-schedule': {
                const { userId, classSchedule } = getRequestBody(req);
                if (!userId || !classSchedule) {
                    return res.status(400).json({ success: false, error: 'userId e classSchedule richiesti' });
                }

                const normalizedUserId = normalizeUserId(userId);
                if (!verifySessionToken(req, normalizedUserId)) {
                    return res.status(403).json({ success: false, error: 'Non autorizzato' });
                }

                const parsedSchedule = parseAndValidateClassSchedule(classSchedule);
                if (parsedSchedule.error) {
                    return res.status(400).json({ success: false, error: parsedSchedule.error });
                }

                const { error: schedErr } = await getSupabase()
                    .from('google_tokens')
                    .update({ class_schedule: parsedSchedule.value, updated_at: new Date().toISOString() })
                    .eq('user_id', normalizedUserId);

                if (schedErr) throw schedErr;
                return res.json({ success: true, message: 'Orario scolastico salvato' });
            }

            // ============= DISCONNECT =============
            case 'disconnect': {
                const userId = req.query.userId || getRequestBody(req).userId;
                if (!userId) return res.status(400).json({ success: false, error: 'userId richiesto' });

                if (!verifySessionToken(req, normalizeUserId(userId))) {
                    return res.status(403).json({ success: false, error: 'Non autorizzato' });
                }

                // Optionally revoke the token
                try {
                    const tokenRow = await loadTokens(userId);
                    if (tokenRow?.access_token) {
                        const oauth2 = getOAuth2Client();
                        await oauth2.revokeToken(tokenRow.access_token).catch(() => {});
                    }
                } catch (e) { /* ignore revoke errors */ }

                await deleteTokens(userId);
                debugLog(`Google Calendar disconnected`, { userId });

                return res.json({ success: true, message: 'Google Calendar disconnesso' });
            }

            default:
                return res.status(400).json({ success: false, error: `Azione sconosciuta: ${action}` });
        }

    } catch (e) {
        console.error(`Google API error (action=${action}):`, e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
