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

const axios = require('axios');
const {
    handleCors, debugLog, generatePid, normalizeClass, isValidName,
    createHeaders, generateSessionToken, verifySessionToken, decryptArgoPassword, encryptArgoPassword, getRequestBody,
    normalizeUserId
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const { getArgoCredentials, setArgoCredentials } = require('../lib/session-vault');
const {
    AdvancedArgo, enrichProfiles,
    extractGradesFromDashboard, extractHomeworkFromDashboard,
    extractClassActivitiesFromDashboard, extractAssenzeFromDashboard, extractVerificheFromDashboard
} = require('../lib/argo');
const TOKEN_SELECT_COLUMNS = 'argo_school_code, argo_username, argo_password, profile_index, updated_at, argo_access_token, argo_auth_token, argo_tokens_expiry, argo_id_soggetto';
const ARGO_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h conservative TTL
const ARGO_PROFILE_ENDPOINT = 'https://www.portaleargo.it/appfamiglia/api/rest/profilo';

/**
 * Parse canonical PID values in the format `p:<schoolCode>:<username>:<profileIndex>`.
 * Returns normalized pieces for Supabase lookups, or null when the value is not a PID.
 */
function parseUserPid(userId) {
    const parts = String(userId || '').split(':');
    if (parts.length < 4 || parts[0] !== 'p') return null;
    const schoolCode = parts[1] ? String(parts[1]).toUpperCase() : '';
    const username = parts[2] ? String(parts[2]).toLowerCase() : '';
    if (!schoolCode || !username) return null;
    const profileIndexRaw = Number(parts[3]);
    return {
        schoolCode,
        username,
        profileIndex: Number.isInteger(profileIndexRaw) && profileIndexRaw >= 0 ? profileIndexRaw : 0
    };
}

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
            let tokenRow = null;
            const parsedPid = parseUserPid(normalizedUserId);
            const { data: tokenByUserId } = await supabase
                .from('google_tokens')
                .select(TOKEN_SELECT_COLUMNS)
                .eq('user_id', normalizedUserId)
                .maybeSingle();
            tokenRow = tokenByUserId || null;

            if (!tokenRow) {
                if (parsedPid?.schoolCode && parsedPid?.username) {
                    const { data: tokenBySchoolUserProfile } = await supabase
                        .from('google_tokens')
                        .select(TOKEN_SELECT_COLUMNS)
                        .eq('argo_school_code', parsedPid.schoolCode)
                        .eq('argo_username', parsedPid.username)
                        .eq('profile_index', parsedPid.profileIndex)
                        .maybeSingle();
                    tokenRow = tokenBySchoolUserProfile || null;
                }
            }

            if (!tokenRow) {
                if (parsedPid?.schoolCode && parsedPid?.username) {
                    const { data: tokenBySchoolUserLatest } = await supabase
                        .from('google_tokens')
                        .select(TOKEN_SELECT_COLUMNS)
                        .eq('argo_school_code', parsedPid.schoolCode)
                        .eq('argo_username', parsedPid.username)
                        .order('updated_at', { ascending: false, nullsFirst: false })
                        .limit(1)
                        .maybeSingle();
                    tokenRow = tokenBySchoolUserLatest || null;
                }
            }

            if (tokenRow) {
                schoolCode = schoolCode || tokenRow.argo_school_code || null;
                username = username || tokenRow.argo_username || null;
                profileIndex = Number.isInteger(tokenRow.profile_index) ? tokenRow.profile_index : profileIndex;
            }

            if (tokenRow?.argo_password) {
                schoolCode = tokenRow.argo_school_code;
                username = tokenRow.argo_username;
                password = decryptArgoPassword(tokenRow.argo_password);
                profileIndex = tokenRow.profile_index ?? 0;
                debugLog('[refresh-session] Credentials from Supabase', { userId: normalizedUserId });
            }

            // ── Attempt cached Argo tokens before rawLogin ──
            if (tokenRow?.argo_access_token && tokenRow?.argo_auth_token) {
                const expiry = tokenRow.argo_tokens_expiry
                    ? new Date(tokenRow.argo_tokens_expiry)
                    : null;
                if (expiry && expiry > new Date()) {
                    try {
                        const cachedHeaders = createHeaders(
                            schoolCode,
                            tokenRow.argo_access_token,
                            tokenRow.argo_auth_token,
                            tokenRow.argo_id_soggetto ?? null
                        );
                        // Quick validation: lightweight profile endpoint
                        await axios.get(ARGO_PROFILE_ENDPOINT, {
                            headers: cachedHeaders,
                            timeout: 5000
                        });

                        const pid = generatePid(schoolCode, username, profileIndex);
                        const sessionToken = generateSessionToken(pid);
                        debugLog('[refresh-session] ✅ Session refreshed via cached tokens', { userId: normalizedUserId, pid });
                        return res.status(200).json({
                            success: true,
                            sessionToken,
                            session: {
                                schoolCode,
                                authToken: tokenRow.argo_auth_token,
                                accessToken: tokenRow.argo_access_token,
                                userName: username,
                                profileIndex,
                                idSoggetto: tokenRow.argo_id_soggetto ?? null
                            },
                            student: { id: pid, name: null, class: null },
                            fromCache: true
                        });
                    } catch (cachedErr) {
                        debugLog('[refresh-session] ⚠️ Cached tokens invalid, falling back to rawLogin', cachedErr.message);
                    }
                }
            }
        }

        // Source 2: In-process session-vault (volatile, plaintext in RAM)
        if (!password) {
            const pidKey = (schoolCode && username) ? generatePid(schoolCode, username, profileIndex) : null;
            const fromVault = (pidKey ? getArgoCredentials(pidKey) : null) || getArgoCredentials(normalizedUserId);
            if (fromVault?.password) {
                schoolCode = schoolCode || fromVault.schoolCode;
                username = username || fromVault.username;
                password = fromVault.password;
                profileIndex = fromVault.profileIndex ?? profileIndex;
                debugLog('[refresh-session] Credentials from session-vault', { userId: normalizedUserId });
            }
        }

        if (!schoolCode || !username || !password) {
            debugLog('[refresh-session] ❌ No credentials found', {
                userId: normalizedUserId,
                hasSchoolCode: !!schoolCode,
                hasUsername: !!username,
                hasPassword: !!password,
                source: 'none'
            });
            return res.status(401).json({
                success: false,
                error: 'Nessuna credenziale Argo trovata. Rieffettua il login.'
            });
        }

        // Perform a fresh DIDUP login (with retry for transient 401s from Argo)
        let loginRes = null;
        let lastLoginError = null;
        const MAX_LOGIN_ATTEMPTS = 2;
        const LOGIN_RETRY_DELAY_MS = 2000;

        for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt++) {
            try {
                if (attempt > 1) {
                    debugLog(`[refresh-session] rawLogin retry #${attempt} after ${LOGIN_RETRY_DELAY_MS}ms delay`);
                    await new Promise(r => setTimeout(r, LOGIN_RETRY_DELAY_MS));
                }
                loginRes = await AdvancedArgo.rawLogin(schoolCode, username, password);
                lastLoginError = null;
                break; // success
            } catch (e) {
                lastLoginError = e;
                const statusCode = e.status || e.response?.status || 0;
                debugLog(`[refresh-session] ⚠️ rawLogin attempt ${attempt}/${MAX_LOGIN_ATTEMPTS} failed`, {
                    status: statusCode,
                    message: e.message,
                    userId: normalizedUserId
                });
                // Don't retry on definitive auth failures (wrong password etc.)
                if (statusCode === 403) break;
            }
        }

        if (!loginRes || lastLoginError) {
            const err = lastLoginError || new Error('rawLogin returned no result');
            console.error('[refresh-session] FAILURE after retries:', err.message);
            const status = err.status || (err.response?.status) || 401;
            return res.status(status).json({
                success: false,
                error: err.message || 'Errore refresh sessione'
            });
        }

        const accessToken = loginRes.access_token;
        let profiles = loginRes.profiles || [];
        try {
            profiles = await enrichProfiles(schoolCode, accessToken, profiles);
        } catch (e) {
            debugLog('[refresh-session] enrichProfiles failed', e.message);
        }

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
        if (supabase) {
            try {
                const expiry = new Date(Date.now() + ARGO_TOKEN_TTL_MS).toISOString();
                await supabase.from('google_tokens').upsert({
                    user_id: pid,
                    argo_school_code: schoolCode,
                    argo_username: username,
                    argo_password: encryptArgoPassword(password),
                    profile_index: safeIndex,
                    argo_access_token: accessToken,
                    argo_auth_token: authToken,
                    argo_tokens_expiry: expiry,
                    argo_id_soggetto: targetProfile.idSoggetto ?? null,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
                debugLog('[refresh-session] ✅ Persisted fresh Argo tokens to Supabase');
            } catch (e) {
                debugLog('[refresh-session] google_tokens upsert failed', e.message);
            }
        }

        const sessionToken = generateSessionToken(pid);

        const resp = {
            success: true,
            sessionToken,
            session: {
                schoolCode,
                authToken,
                accessToken,
                userName: username,
                profileIndex: safeIndex,
                idSoggetto: targetProfile.idSoggetto
            },
            student: {
                id: pid,
                name: targetProfile.name || null,
                class: targetProfile.class || 'N/D'
            }
        };

        debugLog('[refresh-session] ✅ Session refreshed via rawLogin', { userId: normalizedUserId, pid });
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
