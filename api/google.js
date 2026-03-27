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

const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const { AdvancedArgo, getDashboard, extractHomeworkFromDashboard } = require('../lib/argo');
const { syncTasksToCalendar } = require('../lib/googleCalendar');
const { createHeaders } = require('../lib/helpers');

// --- Supabase Admin Client (lazy init) ---
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.SUPABASE_URL || 'https://mlcutgkfunbpmrnbeznd.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!key) throw new Error('Chiave Supabase non trovata su Vercel (controlla SUPABASE_SERVICE_ROLE_KEY)');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// --- Google OAuth2 Config ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 
    (process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}/api/google?action=callback`
        : 'https://g-connect-backend-r5j1.vercel.app/api/google?action=callback');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function getOAuth2Client() {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    
    console.log('=== OAuth Debug ===');
    console.log('CLIENT_ID:', GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.slice(0, 30) + '...' : 'MANCANTE');
    console.log('CLIENT_SECRET ends with:', GOOGLE_CLIENT_SECRET ? '...' + GOOGLE_CLIENT_SECRET.slice(-4) : 'MANCANTE');
    console.log('REDIRECT_URI:', REDIRECT_URI);
    console.log('==================');
    
    return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
}

// --- Token Storage (Supabase) ---
async function saveTokens(userId, tokens) {
    const { error } = await getSupabase()
        .from('google_tokens')
        .upsert({
            user_id: userId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date || null,
            calendar_id: 'primary',
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
    if (error) throw new Error(`Supabase save error: ${error.message}`);
}

async function loadTokens(userId) {
    const { data, error } = await getSupabase()
        .from('google_tokens')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (error || !data) return null;
    return data;
}

async function deleteTokens(userId) {
    const { error } = await getSupabase()
        .from('google_tokens')
        .delete()
        .eq('user_id', userId);
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
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action || 'status';

    try {
        switch (action) {

            // ============= AUTH URL =============
            case 'auth-url': {
                if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
                    return res.status(500).json({ success: false, error: 'Google OAuth non configurato sul server' });
                }

                const userId = req.query.userId || req.body?.userId;
                if (!userId) return res.status(400).json({ success: false, error: 'userId richiesto' });

                const oauth2 = getOAuth2Client();
                const url = oauth2.generateAuthUrl({
                    access_type: 'offline',
                    scope: SCOPES,
                    prompt: 'consent',
                    state: userId // Pass userId through OAuth state
                });

                if (req.query.redirect === 'true') {
                    return res.redirect(url);
                }

                return res.json({ success: true, url });
            }

            // ============= CALLBACK =============
            case 'callback': {
                const code = req.query.code;
                const userId = req.query.state; // Retrieved from OAuth state
                const error = req.query.error;

                console.log(`[Google OAuth] Callback received for user: ${userId}`);
                if (!GOOGLE_CLIENT_ID) console.error('[Google OAuth] ERRORE: GOOGLE_CLIENT_ID mancante');
                if (!GOOGLE_CLIENT_SECRET) console.error('[Google OAuth] ERRORE: GOOGLE_CLIENT_SECRET mancante');

                if (error) {
                    console.error('[Google OAuth] Error from Google:', error);
                    return res.redirect('/?google=error&reason=' + encodeURIComponent(error));
                }

                if (!code || !userId) {
                    return res.status(400).json({ success: false, error: 'Parametri mancanti (code o state)' });
                }

                try {
                    const oauth2 = getOAuth2Client();
                    console.log(`[Google OAuth] Scambio codice con redirect_uri: ${REDIRECT_URI}`);
                    const { tokens } = await oauth2.getToken(code);
                    
                    await saveTokens(userId, tokens);
                    console.log(`✅ Google Calendar collegato per utente: ${userId}`);

                    // Redirect alla PWA con successo
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
                    try {
                        const loginRes = await AdvancedArgo.rawLogin(
                            session.schoolCode, 
                            session.userName || session.username,
                            session.password
                        );
                        const { access_token, profiles } = loginRes;
                        if (!profiles || profiles.length === 0) throw new Error('Nessun profilo Argo');
                        
                        const authToken = profiles[0].token;
                        const subjectId = profiles[0].idSoggetto;
                        const headers = createHeaders(session.schoolCode, access_token, authToken, subjectId);
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

                console.log(`📅 Sync per ${userId}: +${result.added} aggiunti, ${result.skipped} saltati`);

                return res.json({
                    success: true,
                    ...result,
                    total_tasks: tasks.length
                });
            }

            // ============= DISCONNECT =============
            case 'disconnect': {
                const userId = req.query.userId || req.body?.userId;
                if (!userId) return res.status(400).json({ success: false, error: 'userId richiesto' });

                // Optionally revoke the token
                try {
                    const tokenRow = await loadTokens(userId);
                    if (tokenRow?.access_token) {
                        const oauth2 = getOAuth2Client();
                        await oauth2.revokeToken(tokenRow.access_token).catch(() => {});
                    }
                } catch (e) { /* ignore revoke errors */ }

                await deleteTokens(userId);
                console.log(`🔌 Google Calendar disconnesso per utente: ${userId}`);

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
