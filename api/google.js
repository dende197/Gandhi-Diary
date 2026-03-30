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
    handleCors, verifySessionToken, normalizeUserId, SESSION_TOKEN_HEX_LENGTH
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');

// --- Google OAuth2 Config ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 
    (process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}/api/google?action=callback`
        : 'https://g-connect-backend-r5j1.vercel.app/api/google?action=callback');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const HEX_TOKEN_REGEX = new RegExp(`^[0-9a-fA-F]{${SESSION_TOKEN_HEX_LENGTH}}$`);

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

                const userId = req.query.userId || req.body?.userId;
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
                    prompt: 'consent',
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
                const userId = req.query.userId || req.body?.userId;
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
                const body = req.body || {};
                const userId = body.userId;
                const session = body.session; // Argo session

                if (!userId) return res.status(400).json({ success: false, error: 'userId richiesto' });

                if (!verifySessionToken(req, normalizeUserId(userId))) {
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
                    
                    // Fallback: se la password non arriva dal client, usa le credenziali Argo salvate in Supabase
                    if (!password && tokenRow) {
                        schoolCode = schoolCode || tokenRow.argo_school_code;
                        userName = userName || tokenRow.argo_username;
                        password = decryptArgoPassword(tokenRow.argo_password);
                    }
                    
                    if (!password) {
                        return res.status(400).json({ 
                            success: false, 
                            error: 'Credenziali Argo non trovate. Collega nuovamente Google o rieffettua il login.' 
                        });
                    }
                    
                    try {
                        const loginRes = await AdvancedArgo.rawLogin(schoolCode, userName, password);
                        const { access_token, profiles } = loginRes;
                        if (!profiles || profiles.length === 0) throw new Error('Nessun profilo Argo');
                        
                        const authToken = profiles[0].token;
                        const subjectId = profiles[0].idSoggetto;
                        const headers = createHeaders(schoolCode, access_token, authToken, subjectId);
                        const dashboardData = await getDashboard(headers);
                        tasks = extractHomeworkFromDashboard(dashboardData);
                    } catch (argoErr) {
                        console.error('Argo fetch failed:', argoErr.message);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Impossibile recuperare i compiti da Argo: ' + argoErr.message 
                        });
                    }
                }

                if (!tasks || tasks.length === 0) {
                    return res.json({ success: true, added: 0, skipped: 0, message: 'Nessun compito trovato' });
                }

                // 3. Sync to user's Google Calendar
                const auth = getAuthenticatedClient(tokenRow);
                const calendarId = tokenRow.calendar_id || 'primary';
                const result = await syncTasksToCalendar(tasks, calendarId, auth);

                debugLog(`Calendar sync result`, { userId, added: result.added, skipped: result.skipped });

                return res.json({
                    success: true,
                    ...result,
                    total_tasks: tasks.length
                });
            }

            // ============= SAVE ARGO CREDENTIALS =============
            case 'save-argo': {
                const { userId, schoolCode, username, password } = req.body || {};
                if (!userId || !schoolCode || !username || !password) {
                    return res.status(400).json({ success: false, error: 'Dati Argo mancanti' });
                }

                if (!verifySessionToken(req, normalizeUserId(userId))) {
                    return res.status(403).json({ success: false, error: 'Non autorizzato' });
                }

                const { error } = await getSupabase()
                    .from('google_tokens')
                    .update({
                        argo_school_code: schoolCode,
                        argo_username: username,
                        argo_password: encryptArgoPassword(password),
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', normalizeUserId(userId));

                if (error) throw error;
                return res.json({ success: true, message: 'Credenziali Argo salvate' });
            }

            // ============= DISCONNECT =============
            case 'disconnect': {
                const userId = req.query.userId || req.body?.userId;
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
