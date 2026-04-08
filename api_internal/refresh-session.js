/**
 * api_internal/refresh-session.js
 * Server-side session refresh for DIDUP.
 *
 * The client calls this when the in-memory password is gone (e.g. iOS killed the PWA process).
 * This handler:
 *   1. Looks up the user's encrypted Argo credentials in Supabase (google_tokens table)
 *   2. Falls back to the in-process session-vault (if still warm)
 *   3. Decrypts the password and performs a fresh DIDUP login
 *   4. Returns the new sessionToken + session data to the client
 */

const {
    handleCors, debugLog, generatePid, normalizeClass, isValidName,
    createHeaders, generateSessionToken, verifySessionToken, decryptArgoPassword, getRequestBody,
    normalizeUserId
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const { getArgoCredentials, setArgoCredentials } = require('../lib/session-vault');
const {
    AdvancedArgo, enrichProfiles, getDashboard,
    extractGradesFromDashboard, extractHomeworkFromDashboard,
    extractClassActivitiesFromDashboard, extractAssenzeFromDashboard, extractVerificheFromDashboard
} = require('../lib/argo');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const body = getRequestBody(req);
    const userId = body.userId;

    if (!userId) {
        return res.status(400).json({ success: false, error: 'userId richiesto' });
    }

    const normalizedUserId = normalizeUserId(userId);

    // Verify the caller's session token
    if (!verifySessionToken(req, normalizedUserId)) {
        return res.status(403).json({ success: false, error: 'Non autorizzato' });
    }

    try {
        let schoolCode = null;
        let username = null;
        let password = null;
        let profileIndex = 0;

        // Source 1: Supabase google_tokens (persistent, encrypted)
        const supabase = getSupabase();
        if (supabase) {
            const { data: tokenRow } = await supabase
                .from('google_tokens')
                .select('argo_school_code, argo_username, argo_password, profile_index')
                .eq('user_id', normalizedUserId)
                .single();

            if (tokenRow?.argo_password) {
                schoolCode = tokenRow.argo_school_code;
                username = tokenRow.argo_username;
                password = decryptArgoPassword(tokenRow.argo_password);
                profileIndex = tokenRow.profile_index ?? 0;
                debugLog('[refresh-session] Credentials from Supabase', { userId: normalizedUserId });
            }
        }

        // Source 2: In-process session-vault (volatile, plaintext in RAM)
        if (!password) {
            const fromVault = getArgoCredentials(normalizedUserId);
            if (fromVault?.password) {
                schoolCode = schoolCode || fromVault.schoolCode;
                username = username || fromVault.username;
                password = fromVault.password;
                profileIndex = fromVault.profileIndex ?? profileIndex;
                debugLog('[refresh-session] Credentials from session-vault', { userId: normalizedUserId });
            }
        }

        if (!schoolCode || !username || !password) {
            return res.status(401).json({
                success: false,
                error: 'Nessuna credenziale Argo trovata. Rieffettua il login.'
            });
        }

        // Perform a fresh DIDUP login
        const loginRes = await AdvancedArgo.rawLogin(schoolCode, username, password);
        const accessToken = loginRes.access_token;
        const profiles = loginRes.profiles || [];

        if (!profiles.length) {
            throw new Error('Nessun profilo Argo trovato');
        }

        const safeIndex = (profileIndex >= 0 && profileIndex < profiles.length) ? profileIndex : 0;
        const targetProfile = profiles[safeIndex];
        const authToken = targetProfile.token;

        if (!accessToken || !authToken) {
            throw new Error('Impossibile recuperare i token di sessione');
        }

        // Refresh session-vault entry with fresh credentials
        const pid = generatePid(schoolCode, username, safeIndex);
        setArgoCredentials(pid, { schoolCode, username, password, profileIndex: safeIndex });

        const sessionToken = generateSessionToken(pid);

        const resp = {
            success: true,
            sessionToken,
            session: {
                schoolCode,
                authToken,
                accessToken,
                userName: username,
                profileIndex: safeIndex
            },
            student: {
                id: pid,
                name: targetProfile.name || null,
                class: targetProfile.class || 'N/D'
            }
        };

        debugLog('[refresh-session] ✅ Session refreshed', { userId: normalizedUserId, pid });
        return res.status(200).json(resp);

    } catch (e) {
        console.error('[refresh-session] FAILURE:', e.message);
        const status = e.status || (e.response?.status) || 401;
        return res.status(status).json({
            success: false,
            error: e.message || 'Errore refresh sessione'
        });
    }
};
