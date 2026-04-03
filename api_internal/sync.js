const {
    handleCors, debugLog, generatePid, normalizeClass, isValidName, createHeaders, parseJsonb
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const {
    AdvancedArgo, resolveIdentityForProfile,
    getDashboard, extractGradesFromDashboard, extractHomeworkFromDashboard,
    extractPromemoriaFromDashboard, extractAssenzeFromDashboard, extractVerificheFromDashboard
} = require('../lib/argo');
const { getArgoCredentials, setArgoCredentials } = require('../lib/session-vault');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body;
    const school = (body.schoolCode || '').trim().toUpperCase();
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password || '';
    let profileIndex = parseInt(body.profileIndex) || 0;

    try {
        debugLog('SYNC REQUEST', { school, profileIndex });

        if (!school || !username) {
            return res.status(401).json({ success: false, error: 'Credenziali mancanti' });
        }

        const pidForVault = generatePid(school, username, profileIndex);
        const fromVault = getArgoCredentials(pidForVault);
        const user = username || fromVault?.username;
        const pwd = password || fromVault?.password;
        if (!pwd) {
            return res.status(401).json({ success: false, error: 'Password non disponibile: rieffettua il login' });
        }
        setArgoCredentials(pidForVault, {
            schoolCode: school,
            username: user,
            password: pwd,
            profileIndex
        });

        let accessToken = null;
        let authToken = null;
        let profiles = [];

        try {
            const loginRes = await AdvancedArgo.rawLogin(school, user, pwd);
            accessToken = loginRes.access_token;
            profiles = loginRes.profiles || [];
            if (profiles.length > 0) {
                if (profileIndex < 0 || profileIndex >= profiles.length) profileIndex = 0;
                authToken = profiles[profileIndex].token;
            }
        } catch (e) {
            debugLog('⚠️ Sync Login Fail', e.message);
            throw e;
        }

        const headers = createHeaders(school, accessToken, authToken, profiles[profileIndex]?.idSoggetto);
        const dashboardData = await getDashboard(headers);
        const grades = extractGradesFromDashboard(dashboardData);
        const tasks = extractHomeworkFromDashboard(dashboardData);
        const promemoria = extractPromemoriaFromDashboard(dashboardData);
        const assenzeData = extractAssenzeFromDashboard(dashboardData);
        const verificheData = extractVerificheFromDashboard(dashboardData);

        let enrichedStudent = null;
        let plannerData = null;
        const supabase = getSupabase();

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
        const isAuthError = lower.includes('credenzial') || lower.includes('password') || lower.includes('unauthorized') || lower.includes('forbidden');
        res.status(isAuthError ? 401 : 500).json({ success: false, error: msg });
    }
}
