/**
 * api_internal/watch-summary/[user_id].js
 *
 * Compact, low-bandwidth summary endpoint built for the Wear OS companion
 * app (and any other "glanceable" client — KWGT, widgets, etc.).
 *
 * Unlike api_internal/sync.js (which returns the *entire* dashboard payload:
 * tasks, promemoria, activities, planner...), this endpoint returns only the
 * three numbers the watch tile needs:
 *   - media generale (computed server-side, same logic as ui.js:calcolaMedia)
 *   - assenze (ore totali, giorni, ritardi, uscite)
 *   - prossima verifica (the single soonest upcoming test)
 *
 * Auth model is identical to every other per-user endpoint in this repo:
 * X-Session-Token header, verified via verifySessionToken() against the
 * stateless HMAC derived from ARGO_ENCRYPTION_KEY. No Argo password ever
 * leaves the server — it's decrypted here (or a cached Argo access/auth
 * token pair is reused, exactly like cron-sync.js) purely to call Argo on
 * the watch's behalf.
 */

const {
    handleCors, verifySessionToken, normalizeUserIdParam, createHeaders,
    decryptArgoPassword, debugLog
} = require('../../lib/helpers');
const { getSupabase } = require('../../lib/supabase');
const {
    AdvancedArgo, getDashboard,
    extractGradesFromDashboard, extractAssenzeFromDashboard, extractVerificheFromDashboard
} = require('../../lib/argo');

const ARGO_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h — same conservative TTL as cron-sync.js

// Mirrors ui.js:calcolaMedia() exactly — simple arithmetic mean of numeric grades.
function calcolaMedia(voti) {
    if (!voti || voti.length === 0) return null;
    const validi = voti
        .map(v => parseFloat((v.valore || v.value || '').toString().replace(',', '.')))
        .filter(n => !isNaN(n));
    if (validi.length === 0) return null;
    return validi.reduce((a, b) => a + b, 0) / validi.length;
}

// Picks the single soonest upcoming verifica (today or later), with how many
// days remain — exactly the "254 gg" style figure shown in the Overview widget.
function pickNextVerifica(verifiche) {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const upcoming = (verifiche || [])
        .map(v => ({ ...v, _d: new Date(v.data) }))
        .filter(v => !isNaN(v._d.getTime()) && v._d >= todayMidnight)
        .sort((a, b) => a._d - b._d);

    if (upcoming.length === 0) return null;

    const next = upcoming[0];
    const giorniMancanti = Math.round((next._d - todayMidnight) / 86400000);

    return {
        materia: next.materia || '',
        descrizione: next.text || '',
        tipo: next.tipo || 'unknown',
        data: next.data,
        giorniMancanti
    };
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const { user_id } = req.query;
    const userId = normalizeUserIdParam(user_id);

    if (!verifySessionToken(req, userId)) {
        return res.status(403).json({ success: false, error: 'Non autorizzato' });
    }

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase non configurato' });

    try {
        const { data: user, error } = await supabase
            .from('google_tokens')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ success: false, error: 'Utente non trovato o mai sincronizzato dal telefono' });
        }
        if (!user.argo_school_code || !user.argo_username || !user.argo_password) {
            return res.status(400).json({ success: false, error: 'Credenziali Argo non configurate per questo utente' });
        }

        let dashboardData = null;
        let usedCache = false;

        // Attempt 1: reuse cached Argo tokens if still valid (fast path — no re-login)
        if (user.argo_access_token && user.argo_auth_token) {
            const expiry = user.argo_tokens_expiry ? new Date(user.argo_tokens_expiry) : null;
            if (expiry && expiry > new Date()) {
                try {
                    const headers = createHeaders(
                        user.argo_school_code, user.argo_access_token, user.argo_auth_token,
                        user.argo_id_soggetto || null
                    );
                    dashboardData = await getDashboard(headers);
                    usedCache = true;
                } catch (cachedErr) {
                    debugLog('[Watch] cached Argo tokens failed, falling back to rawLogin', cachedErr.message);
                    dashboardData = null;
                }
            }
        }

        // Attempt 2: full rawLogin with the stored (encrypted) Argo password
        if (!dashboardData) {
            const argoPassword = decryptArgoPassword(user.argo_password);
            if (!argoPassword) return res.status(500).json({ success: false, error: 'Impossibile decifrare le credenziali Argo' });

            const loginRes = await AdvancedArgo.rawLogin(user.argo_school_code, user.argo_username, argoPassword);
            const accessToken = loginRes.access_token;
            const profiles = loginRes.profiles || [];
            const idx = Number.isInteger(user.profile_index) ? user.profile_index : 0;
            const targetProfile = profiles[idx] || profiles[0];
            if (!targetProfile) return res.status(500).json({ success: false, error: 'Nessun profilo Argo disponibile' });

            const authToken = targetProfile.token;
            const headers = createHeaders(user.argo_school_code, accessToken, authToken, targetProfile.idSoggetto || null);
            dashboardData = await getDashboard(headers);

            // Persist fresh tokens, best-effort (mirrors cron-sync.js)
            try {
                await supabase.from('google_tokens').update({
                    argo_access_token: accessToken,
                    argo_auth_token: authToken,
                    argo_id_soggetto: targetProfile.idSoggetto ?? null,
                    argo_tokens_expiry: new Date(Date.now() + ARGO_TOKEN_TTL_MS).toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('user_id', userId);
            } catch (persistErr) {
                debugLog('[Watch] token persist failed', persistErr.message);
            }
        }

        const grades = extractGradesFromDashboard(dashboardData);
        const assenze = extractAssenzeFromDashboard(dashboardData);
        const verifiche = extractVerificheFromDashboard(dashboardData);

        const media = calcolaMedia(grades);
        const prossimaVerifica = pickNextVerifica(verifiche);

        // Best-effort: keep last_argo_sync fresh so the phone's "connection status" stays accurate too
        try {
            await supabase.from('google_tokens').update({ last_argo_sync: new Date().toISOString() }).eq('user_id', userId);
        } catch (e) { /* non-fatal */ }

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.json({
            success: true,
            data: {
                media: media !== null ? Math.round(media * 100) / 100 : null,
                gradesCount: grades.length,
                assenze: {
                    oreTotali: Math.round((assenze.oreAssenzaTotali || 0) * 10) / 10,
                    giorni: assenze.totaleAssenze || 0,
                    ritardi: assenze.totaleRitardi || 0,
                    uscite: assenze.totaleUscite || 0,
                    daGiustificare: assenze.daGiustificare || 0
                },
                prossimaVerifica,
                verificheProgrammate: verifiche.length,
                lastSync: new Date().toISOString(),
                usedCache
            }
        });
    } catch (e) {
        console.error('[Watch Summary] failed:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
