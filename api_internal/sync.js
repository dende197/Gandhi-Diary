const {
    handleCors, debugLog, generatePid, normalizeClass, isValidName, createHeaders, parseJsonb, verifySessionToken, getRequestBody, decryptArgoPassword, encryptArgoPassword, normalizeUserId
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const {
    AdvancedArgo, resolveIdentityForProfile, enrichProfiles,
    getDashboard, extractGradesFromDashboard, extractHomeworkFromDashboard,
    extractPromemoriaFromDashboard, extractClassActivitiesFromDashboard, extractAssenzeFromDashboard, extractVerificheFromDashboard
} = require('../lib/argo');
const { getArgoCredentials, setArgoCredentials } = require('../lib/session-vault');
const TOKEN_SELECT_COLUMNS = 'argo_school_code, argo_username, argo_password, profile_index, updated_at, argo_access_token, argo_auth_token, argo_tokens_expiry, argo_id_soggetto';
const ARGO_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h conservative TTL (Argo tokens last ~8h)

function buildCredentialCandidateUserIds(primaryUserId, fallbackUserId) {
    const normalizedPrimary = normalizeUserId(primaryUserId);
    const normalizedFallback = normalizeUserId(fallbackUserId);
    if (normalizedPrimary && normalizedFallback && normalizedPrimary !== normalizedFallback) {
        return [normalizedPrimary, normalizedFallback];
    }
    return [normalizedPrimary || normalizedFallback].filter(Boolean);
}

function extractHttpStatusCode(error) {
    const code = Number(error?.status || error?.response?.status || 0);
    return Number.isFinite(code) ? code : 0;
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = getRequestBody(req);
    const school = (body.schoolCode || '').trim().toUpperCase();
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password || '';
    const sessionAccessToken = String(body.accessToken || '').trim();
    const sessionAuthToken = String(body.authToken || '').trim();
    const sessionUserId = normalizeUserId(body.userId || body.studentId || '');
    const sessionSubjectId = body.subjectId ?? body.idSoggetto ?? null;
    const parsedProfileIndex = parseInt(body.profileIndex, 10);
    let profileIndex = Number.isInteger(parsedProfileIndex) && parsedProfileIndex >= 0 ? parsedProfileIndex : 0;
    if (!school || !username) {
        return res.status(400).json({ success: false, error: 'Credenziali mancanti' });
    }
    const pidForAuth = generatePid(school, username, profileIndex);
    const hasValidSessionToken = verifySessionToken(req, pidForAuth) || (sessionUserId && verifySessionToken(req, sessionUserId));
    if (!hasValidSessionToken) {
        return res.status(403).json({ success: false, error: 'Non autorizzato' });
    }

    try {
        debugLog('SYNC REQUEST', { school, profileIndex });
        const supabase = getSupabase();

        let credentialKey = generatePid(school, username, profileIndex);
        let fromVault = getArgoCredentials(credentialKey);
        const user = username;
        let pwd = password || fromVault?.password;

        let accessToken = sessionAccessToken || null;
        let authToken = sessionAuthToken || null;
        let profiles = [];
        let dashboardData = null;

        if (accessToken && authToken) {
            try {
                const headersFromSession = createHeaders(school, accessToken, authToken, sessionSubjectId);
                dashboardData = await getDashboard(headersFromSession);
            } catch (e) {
                debugLog('⚠️ Sync Session Tokens Fail', e.message);
                accessToken = null;
                authToken = null;
            }
        }

        // --- Token recovery: cached tokens (Supabase) → rawLogin fallback ---
        let tokenRow = null;
        if (!dashboardData) {
            if (supabase) {
                try {
                    const candidateUserIds = buildCredentialCandidateUserIds(credentialKey, sessionUserId);
                    for (const candidateUserId of candidateUserIds) {
                        const { data: tokenByPid } = await supabase
                            .from('google_tokens')
                            .select(TOKEN_SELECT_COLUMNS)
                            .eq('user_id', candidateUserId)
                            .maybeSingle();
                        if (tokenByPid?.argo_password) {
                            tokenRow = tokenByPid;
                            break;
                        }
                    }
                    if (!tokenRow) {
                        const { data: tokenBySchoolUser } = await supabase
                            .from('google_tokens')
                            .select(TOKEN_SELECT_COLUMNS)
                            .eq('argo_school_code', school)
                            .eq('argo_username', user)
                            .eq('profile_index', profileIndex)
                            .maybeSingle();
                        tokenRow = tokenBySchoolUser || null;
                    }
                    if (!tokenRow) {
                        const { data: tokenByLatestSchoolUser } = await supabase
                            .from('google_tokens')
                            .select(TOKEN_SELECT_COLUMNS)
                            .eq('argo_school_code', school)
                            .eq('argo_username', user)
                            .order('updated_at', { ascending: false, nullsFirst: false })
                            .limit(1)
                            .maybeSingle();
                        tokenRow = tokenByLatestSchoolUser || null;
                    }
                    if (tokenRow?.argo_password) {
                        const decrypted = decryptArgoPassword(tokenRow.argo_password);
                        if (decrypted) {
                            pwd = decrypted;
                            if (Number.isInteger(tokenRow.profile_index) && tokenRow.profile_index >= 0) {
                                profileIndex = tokenRow.profile_index;
                                credentialKey = generatePid(school, user, profileIndex);
                                fromVault = getArgoCredentials(credentialKey) || fromVault;
                            }
                        }
                    }

                    // ── Attempt 2: try cached Argo tokens from Supabase before rawLogin ──
                    if (!dashboardData && tokenRow?.argo_access_token && tokenRow?.argo_auth_token) {
                        const expiry = tokenRow.argo_tokens_expiry
                            ? new Date(tokenRow.argo_tokens_expiry)
                            : null;
                        const isExpired = !expiry || expiry <= new Date();
                        if (!isExpired) {
                            try {
                                const cachedHeaders = createHeaders(
                                    school,
                                    tokenRow.argo_access_token,
                                    tokenRow.argo_auth_token,
                                    sessionSubjectId
                                );
                                dashboardData = await getDashboard(cachedHeaders);
                                accessToken = tokenRow.argo_access_token;
                                authToken = tokenRow.argo_auth_token;
                                // Extend TTL on successful cached-token use (sliding window)
                                if (supabase && tokenRow?.user_id) {
                                    const newExpiry = new Date(Date.now() + ARGO_TOKEN_TTL_MS).toISOString();
                                    supabase.from('google_tokens').update({
                                        argo_tokens_expiry: newExpiry,
                                        updated_at: new Date().toISOString()
                                    }).eq('user_id', tokenRow.user_id).catch(e => debugLog('⚠️ TTL extend failed', e.message));
                                }
                                debugLog('✅ Sync: used cached Argo tokens from Supabase');
                            } catch (cachedErr) {
                                debugLog('⚠️ Cached Argo tokens expired early, falling back to rawLogin', cachedErr.message);
                                dashboardData = null;
                            }
                        } else {
                            debugLog('⏳ Cached Argo tokens expired, proceeding to rawLogin');
                        }
                    }
                } catch (e) {
                    debugLog('⚠️ Supabase credential/token lookup failed', e.message);
                }
            }

            // ── Attempt 3: full rawLogin with password (with retry for transient Argo errors) ──
            if (!dashboardData) {
                if (!pwd) {
                    debugLog('❌ Sync: no password available for rawLogin', {
                        userId: sessionUserId,
                        credentialKey,
                        hasVault: !!fromVault,
                        hasTokenRow: !!tokenRow
                    });
                    return res.status(401).json({ success: false, error: 'Sessione DidUP scaduta: effettua di nuovo il login' });
                }
                setArgoCredentials(credentialKey, {
                    schoolCode: school,
                    username: user,
                    password: pwd,
                    profileIndex
                });

                const MAX_LOGIN_ATTEMPTS = 2;
                const LOGIN_RETRY_DELAY_MS = 2000;
                let loginSuccess = false;

                for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt++) {
                    try {
                        if (attempt > 1) {
                            debugLog(`⏳ Sync rawLogin retry #${attempt} after ${LOGIN_RETRY_DELAY_MS}ms`);
                            await new Promise(r => setTimeout(r, LOGIN_RETRY_DELAY_MS));
                        }
                        const loginRes = await AdvancedArgo.rawLogin(school, user, pwd);
                        accessToken = loginRes.access_token;
                        profiles = loginRes.profiles || [];
                        try {
                            profiles = await enrichProfiles(school, accessToken, profiles);
                        } catch (enrichError) {
                            debugLog('⚠️ Sync enrichProfiles failed', enrichError.message);
                        }
                        if (profiles.length > 0) {
                            if (profileIndex < 0 || profileIndex >= profiles.length) profileIndex = 0;
                            credentialKey = generatePid(school, user, profileIndex);
                            setArgoCredentials(credentialKey, {
                                schoolCode: school,
                                username: user,
                                password: pwd,
                                profileIndex
                            });
                            authToken = profiles[profileIndex].token;
                        }
                        loginSuccess = true;
                        break;
                    } catch (e) {
                        const statusCode = e.status || e.response?.status || 0;
                        debugLog(`⚠️ Sync rawLogin attempt ${attempt}/${MAX_LOGIN_ATTEMPTS} failed`, {
                            status: statusCode,
                            message: e.message
                        });
                        // Don't retry on definitive auth failures (wrong password, 403 block)
                        if (statusCode === 403) {
                            debugLog('⛔ Sync: Argo 403 block, not retrying');
                            throw e;
                        }
                        if (attempt === MAX_LOGIN_ATTEMPTS) throw e;
                    }
                }

                if (!authToken) {
                    throw new Error('Token di autorizzazione non disponibile: nessun profilo trovato dopo il login');
                }

                const headers = createHeaders(school, accessToken, authToken, profiles[profileIndex]?.idSoggetto);
                dashboardData = await getDashboard(headers);

                // ── Persist fresh Argo tokens to Supabase ──
                if (supabase && accessToken && authToken) {
                    try {
                        const expiry = new Date(Date.now() + ARGO_TOKEN_TTL_MS).toISOString();
                        const persistUserId = tokenRow?.user_id || credentialKey;
                        await supabase.from('google_tokens').upsert({
                            user_id: persistUserId,
                            argo_school_code: school,
                            argo_username: user,
                            argo_password: encryptArgoPassword(pwd),
                            profile_index: profileIndex,
                            argo_access_token: accessToken,
                            argo_auth_token: authToken,
                            argo_tokens_expiry: expiry,
                            argo_id_soggetto: profiles[profileIndex]?.idSoggetto ?? null,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id' });
                        debugLog('✅ Sync: persisted fresh Argo tokens to Supabase');
                    } catch (persistErr) {
                        debugLog('⚠️ Token cache save failed', persistErr.message);
                    }
                }
            }
        }
        const grades = extractGradesFromDashboard(dashboardData);
        const tasks = extractHomeworkFromDashboard(dashboardData);
        const promemoria = extractPromemoriaFromDashboard(dashboardData);
        const activeProfile = (
            Array.isArray(profiles) &&
            profileIndex >= 0 &&
            profileIndex < profiles.length
        ) ? profiles[profileIndex] : null;
        const subjectId = sessionSubjectId ?? activeProfile?.idSoggetto ?? null;
        const activitiesData = extractClassActivitiesFromDashboard(dashboardData, {
            subjectId
        });
        const assenzeData = extractAssenzeFromDashboard(dashboardData);
        const verificheData = extractVerificheFromDashboard(dashboardData);

        let enrichedStudent = null;
        let plannerData = null;

        if (supabase) {
            try {
                let sName = null, sClass = null;
                if (profiles.length > 0) {
                    const t = profiles[profileIndex];
                    const resIdent = await resolveIdentityForProfile(
                        school, user, pwd, accessToken, authToken, t.name, t.class, t.idSoggetto
                    );
                    sName = resIdent.name;
                    sClass = normalizeClass(resIdent.cls) || resIdent.cls;
                }

                const pid = generatePid(school, user, profileIndex);

                // 1. Update Profile
                const { data: existingProfile } = await supabase.from('profiles')
                    .select('specialization, avatar, name, class').eq('id', pid).single();

                const storedSpecialization = existingProfile?.specialization || null;
                const storedAvatar = existingProfile?.avatar || null;

                const payload = {
                    id: pid,
                    last_active: new Date().toISOString(),
                    specialization: storedSpecialization,
                    avatar: storedAvatar
                };

                if (sName && isValidName(sName, user)) payload.name = sName;
                else if (existingProfile?.name && isValidName(existingProfile.name, user)) payload.name = existingProfile.name;
                else payload.name = null;

                // sClass is already normalized (or raw when normalization returns null); avoid double normalize
                if (sClass) payload.class = sClass;
                else if (existingProfile?.class) payload.class = normalizeClass(existingProfile.class) || existingProfile.class;

                await supabase.from('profiles').upsert(payload, { onConflict: 'id' });

                enrichedStudent = {
                    id: pid,
                    name: payload.name || 'Utente',
                    class: payload.class || 'N/D',
                    specialization: storedSpecialization,
                    avatar: storedAvatar
                };

                // 2. Fetch Planner Data (For cross-device sync on login/sync)
                const { data: plannerRow } = await supabase.from('planners')
                    .select('*').eq('user_id', pid).single();

                if (plannerRow) {
                    const parsedSL = parseJsonb(plannerRow.stress_levels, {});
                    plannerData = {
                        plannedTasks: parseJsonb(plannerRow.planned_tasks, {}),
                        stressLevels: parsedSL,
                        stressVents: parsedSL.__vents || {},
                        plannedDetails: parseJsonb(plannerRow.planned_details, {}),
                        tasks: parseJsonb(plannerRow.tasks, []),
                        prepLevels: parseJsonb(plannerRow.prep_levels, {}),
                        updatedAt: plannerRow.updated_at
                    };
                    // 3. Fetch Manual Verifiche (Dedicated Table)
                    const { data: manualVerifiche, error: mvError } = await supabase
                        .from('manual_verifiche')
                        .select('*')
                        .eq('user_id', pid);
                        
                    if (!mvError && manualVerifiche) {
                        plannerData.manualVerifiche = manualVerifiche;
                        debugLog('✅ Manual Verifiche included in sync:', manualVerifiche.length);
                    }
                }

            } catch (e) {
                debugLog('⚠️ Sync Supabase error', e.message);
            }

            // Update last_argo_sync timestamp for connection status tracking
            try {
                const syncUserId = tokenRow?.user_id || credentialKey;
                await supabase.from('google_tokens').update({
                    last_argo_sync: new Date().toISOString()
                }).eq('user_id', syncUserId);
            } catch (syncTsErr) {
                debugLog('⚠️ last_argo_sync update failed', syncTsErr.message);
            }
        }

        res.json({
            success: true,
            tasks,
            voti: grades,
            promemoria,
            activities: Array.isArray(activitiesData?.svolte) ? activitiesData.svolte : [],
            plannedActivities: Array.isArray(activitiesData?.pianificate) ? activitiesData.pianificate : [],
            assenzeData,
            verifiche: verificheData,
            new_tokens: { authToken, accessToken },
            planner: plannerData,
            student: enrichedStudent,
            lastArgoSync: new Date().toISOString()
        });

    } catch (e) {
        debugLog('❌ SYNC FAILED', e.message);
        const msg = (e && e.message) ? e.message : 'Errore sincronizzazione';
        const lower = String(msg).toLowerCase();
        const statusCode = extractHttpStatusCode(e);
        const isAuthStatus = statusCode === 401 || statusCode === 403;
        const isAuthError = isAuthStatus ||
            lower.includes('credenziali') ||
            lower.includes('password') ||
            lower.includes('unauthorized') ||
            lower.includes('forbidden') ||
            lower.includes('sessione didup scaduta') ||
            lower.includes('status code 401') ||
            lower.includes('status code 403') ||
            lower.includes('token');
        const responseStatus = isAuthStatus ? statusCode : (isAuthError ? 401 : 500);
        res.status(responseStatus).json({ success: false, error: msg });
    }
}
