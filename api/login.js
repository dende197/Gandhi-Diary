const {
    handleCors, debugLog, generatePid, normalizeClass, isValidName, createHeaders
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const {
    AdvancedArgo, enrichProfiles, resolveIdentityForProfile,
    resolveIdentityFromWebUI, resolveClassFromAnagraficaWeb,
    getDashboard, extractGradesFromDashboard, extractHomeworkFromDashboard, extractPromemoriaFromDashboard
} = require('../lib/argo');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body;
    const school = (body.schoolCode || body.school || '').trim().toUpperCase();
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password;
    const selectedProfileIndex = (body.selectedProfileIndex !== undefined) ? body.selectedProfileIndex :
        (body.profileIndex !== undefined ? body.profileIndex : null);

    if (!school || !username || !password) {
        return res.status(400).json({ success: false, error: 'Dati mancanti' });
    }

    try {
        debugLog('LOGIN REQUEST', { school, username, idx: selectedProfileIndex });

        const loginRes = await AdvancedArgo.rawLogin(school, username, password);
        const accessToken = loginRes.access_token;
        let profiles = loginRes.profiles || [];

        profiles = await enrichProfiles(school, accessToken, profiles);

        if (profiles.length > 1 && selectedProfileIndex === null) {
            return res.status(200).json({
                success: true,
                status: 'MULTIPLE_PROFILES',
                profiles: profiles.map(p => ({
                    index: p.index, name: p.name, class: p.class, school
                }))
            });
        }

        let targetIndex = 0;
        if (selectedProfileIndex !== null) targetIndex = parseInt(selectedProfileIndex);
        if (targetIndex < 0 || targetIndex >= profiles.length) targetIndex = 0;

        const targetProfile = profiles[targetIndex];
        const authToken = targetProfile.token;

        if (!accessToken || !authToken) throw new Error('Impossibile recuperare i token di sessione');

        let studentName = targetProfile.name;
        let studentClass = targetProfile.class;

        // Fallback identity resolution via API
        if (!studentName || studentName.startsWith('STUDENTE') || studentClass === 'N/D') {
            const resolved = await resolveIdentityForProfile(
                school, username, password, accessToken, authToken,
                studentName, studentClass, targetProfile.idSoggetto
            );
            if (resolved.name) studentName = resolved.name;
            if (resolved.cls && resolved.cls !== 'N/D') studentClass = normalizeClass(resolved.cls) || studentClass;
        }

        // Fallback HTML scraping via cookie jar (per scuole con API limitate)
        const jar = loginRes.jar;
        if (!isValidName(studentName, username) || studentClass === 'N/D') {
            const webId = await resolveIdentityFromWebUI(jar);
            if (webId.name && isValidName(webId.name, username)) studentName = webId.name;
            if (webId.cls && webId.cls !== 'N/D') studentClass = normalizeClass(webId.cls) || studentClass;

            if (!isValidName(studentName, username) || !normalizeClass(studentClass)) {
                const webAna = await resolveClassFromAnagraficaWeb(jar);
                if (webAna.cls) studentClass = normalizeClass(webAna.cls) || studentClass;
                if (webAna.name && !isValidName(studentName, username)) studentName = webAna.name;
            }
        }

        const headers = createHeaders(school, accessToken, authToken, targetProfile?.idSoggetto);
        const dashboardData = await getDashboard(headers);
        const gradesData = extractGradesFromDashboard(dashboardData);
        const tasksData = extractHomeworkFromDashboard(dashboardData);
        const announcementsData = extractPromemoriaFromDashboard(dashboardData);

        const pid = generatePid(school, username, targetIndex);
        let storedSpecialization = null;
        let storedAvatar = null;

        const supabase = getSupabase();
        if (supabase) {
            try {
                const normalizedClass = normalizeClass(studentClass);
                const { data: existingProfile } = await supabase.from('profiles')
                    .select('specialization, avatar').eq('id', pid).single();

                if (existingProfile) {
                    storedSpecialization = existingProfile.specialization;
                    storedAvatar = existingProfile.avatar;
                }

                await supabase.from('profiles').upsert({
                    id: pid,
                    name: studentName,
                    class: normalizedClass || studentClass || 'N/D',
                    specialization: storedSpecialization || null,
                    avatar: storedAvatar || null,
                    last_active: new Date().toISOString()
                }, { onConflict: 'id' });
            } catch (e) {
                debugLog('⚠️ Supabase sync error', e.message);
            }
        }

        const resp = {
            success: true,
            session: {
                schoolCode: school,
                authToken,
                accessToken,
                userName: username,
                profileIndex: targetIndex
            },
            student: {
                id: pid,
                name: studentName,
                class: studentClass || 'N/D',
                school,
                specialization: storedSpecialization,
                avatar: storedAvatar
            },
            tasks: tasksData,
            voti: gradesData,
            promemoria: announcementsData
        };

        if (targetProfile) {
            resp.selectedProfile = {
                index: targetIndex,
                name: studentName,
                class: studentClass,
                school: targetProfile.school || school,
                idSoggetto: targetProfile.idSoggetto
            };
        }

        if (profiles.length > 1) {
            resp.profiles = profiles.map(p => ({ index: p.index, name: p.name, class: p.class, school: p.school || school }));
        }

        res.status(200).json(resp);

    } catch (e) {
        console.error('LOGIN FAILURE', e);
        const { DEBUG_MODE } = require('../lib/helpers');
        res.status(401).json({ success: false, error: e.message, traceback: DEBUG_MODE ? e.stack : null });
    }
}
