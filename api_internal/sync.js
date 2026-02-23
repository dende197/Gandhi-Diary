const {
    handleCors, debugLog, generatePid, normalizeClass, isValidName, createHeaders
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const {
    AdvancedArgo, resolveIdentityForProfile,
    getDashboard, extractGradesFromDashboard, extractHomeworkFromDashboard, extractPromemoriaFromDashboard
} = require('../lib/argo');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body;
    const school = (body.schoolCode || '').trim().toUpperCase();
    const storedUser = body.storedUser;
    const storedPass = body.storedPass;
    let profileIndex = parseInt(body.profileIndex) || 0;

    try {
        debugLog('SYNC REQUEST', { school, profileIndex });

        if (!school || !storedUser || !storedPass) {
            return res.status(401).json({ success: false, error: 'Credenziali mancanti' });
        }

        const user = decodeURIComponent(Buffer.from(storedUser, 'base64').toString('utf-8')).trim().toLowerCase();
        const pwd = decodeURIComponent(Buffer.from(storedPass, 'base64').toString('utf-8'));

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
                    const parseJsonb = (val, fallback) => {
                        if (val === null || val === undefined) return fallback;
                        if (typeof val === 'string') {
                            try { return JSON.parse(val); } catch (e) { return fallback; }
                        }
                        return val;
                    };

                    plannerData = {
                        plannedTasks: parseJsonb(plannerRow.planned_tasks, {}),
                        stressLevels: parseJsonb(plannerRow.stress_levels, {}),
                        stressVents: parseJsonb(plannerRow.stress_vents, {}),
                        plannedDetails: parseJsonb(plannerRow.planned_details, {}),
                        tasks: parseJsonb(plannerRow.tasks, []),
                        prepLevels: parseJsonb(plannerRow.prep_levels, {}),
                        updatedAt: plannerRow.updated_at
                    };
                    debugLog('✅ Planner data included in sync for:', pid);
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
            new_tokens: { authToken, accessToken },
            planner: plannerData,
            student: enrichedStudent
        });

    } catch (e) {
        debugLog('❌ SYNC FAILED', e.message);
        res.status(401).json({ success: false, error: e.message });
    }
}
