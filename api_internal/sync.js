const {
    handleCors, debugLog, generatePid, normalizeClass, isValidName, createHeaders, parseJsonb, verifySessionToken, getRequestBody, decryptArgoPassword, normalizeUserId
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const {
    AdvancedArgo, resolveIdentityForProfile, enrichProfiles,
    getDashboard, extractGradesFromDashboard, extractHomeworkFromDashboard,
    extractPromemoriaFromDashboard, extractClassActivitiesFromDashboard, extractAssenzeFromDashboard, extractVerificheFromDashboard
} = require('../lib/argo');
const { getArgoCredentials, setArgoCredentials } = require('../lib/session-vault');

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
        return res.status(401).json({ success: false, error: 'Credenziali mancanti' });
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
        const user = username || fromVault?.username;
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

        if (!dashboardData) {
            if (!pwd && supabase) {
                try {
                    let tokenRow = null;
                    const candidateUserIds = [credentialKey, sessionUserId]
                        .map((id) => normalizeUserId(id))
                        .filter(Boolean)
                        .filter((id, idx, arr) => arr.indexOf(id) === idx);
                    for (const candidateUserId of candidateUserIds) {
                        const { data: tokenByPid } = await supabase
                            .from('google_tokens')
                            .select('argo_school_code, argo_username, argo_password, profile_index, updated_at')
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
                            .select('argo_school_code, argo_username, argo_password, profile_index, updated_at')
                            .eq('argo_school_code', school)
                            .eq('argo_username', user)
                            .eq('profile_index', profileIndex)
                            .maybeSingle();
                        tokenRow = tokenBySchoolUser || null;
                    }
                    if (!tokenRow) {
                        const { data: tokenByLatestSchoolUser } = await supabase
                            .from('google_tokens')
                            .select('argo_school_code, argo_username, argo_password, profile_index, updated_at')
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
                } catch (e) {
                    debugLog('⚠️ Supabase credential lookup failed', e.message);
                }
            }
            if (!pwd) {
                return res.status(401).json({ success: false, error: 'Sessione DidUP scaduta: effettua di nuovo il login' });
            }
            setArgoCredentials(credentialKey, {
                schoolCode: school,
                username: user,
                password: pwd,
                profileIndex
            });
            try {
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
            } catch (e) {
                debugLog('⚠️ Sync Login Fail', e.message);
                throw e;
            }

            const headers = createHeaders(school, accessToken, authToken, profiles[profileIndex]?.idSoggetto);
            dashboardData = await getDashboard(headers);
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

                const sClassNorm = normalizeClass(sClass || existingProfile?.class);
                if (sClassNorm) payload.class = sClassNorm;

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
            student: enrichedStudent
        });

    } catch (e) {
        debugLog('❌ SYNC FAILED', e.message);
        const msg = (e && e.message) ? e.message : 'Errore sincronizzazione';
        const lower = String(msg).toLowerCase();
        const statusCode = Number(e?.status || e?.response?.status || 0);
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
        res.status(isAuthError ? 403 : 500).json({ success: false, error: msg });
    }
}
