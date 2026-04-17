const {
    handleCors, debugLog, generatePid, normalizeClass, isValidName, createHeaders, generateSessionToken,
    isSessionSecurityConfigured, getRequestBody, encryptArgoPassword
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const { setArgoCredentials } = require('../lib/session-vault');
const {
    AdvancedArgo, enrichProfiles, resolveIdentityForProfile,
    resolveIdentityFromWebUI, resolveClassFromAnagraficaWeb,
    getDashboard, extractGradesFromDashboard, extractHomeworkFromDashboard,
    extractPromemoriaFromDashboard, extractClassActivitiesFromDashboard, extractAssenzeFromDashboard, extractVerificheFromDashboard
} = require('../lib/argo');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!isSessionSecurityConfigured()) {
        return res.status(500).json({
            success: false,
            error: 'Server auth non configurata: ARGO_ENCRYPTION_KEY mancante o non valida'
        });
    }

    const body = getRequestBody(req);
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

        try {
            profiles = await enrichProfiles(school, accessToken, profiles);
        } catch (e) {
            debugLog('⚠️ enrichProfiles failed during login', e.message);
        }

        if (profiles.length > 1 && selectedProfileIndex === null) {
            return res.status(200).json({
                success: true,
                status: 'MULTIPLE_PROFILES',
                profiles: profiles.map(p => ({
                    index: p.index, name: p.name, class: p.class, school
                }))
            });
        }

        const parsedTargetIndex = parseInt(selectedProfileIndex, 10);
        let targetIndex = (!isNaN(parsedTargetIndex) && parsedTargetIndex >= 0) ? parsedTargetIndex : 0;
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
        if (jar && (!isValidName(studentName, username) || studentClass === 'N/D')) {
            try {
                const webId = await resolveIdentityFromWebUI(jar);
                if (webId.name && isValidName(webId.name, username)) studentName = webId.name;
                if (webId.cls && webId.cls !== 'N/D') studentClass = normalizeClass(webId.cls) || studentClass;

                if (!isValidName(studentName, username) || !normalizeClass(studentClass)) {
                    const webAna = await resolveClassFromAnagraficaWeb(jar);
                    if (webAna.cls) studentClass = normalizeClass(webAna.cls) || studentClass;
                    if (webAna.name && !isValidName(studentName, username)) studentName = webAna.name;
                }
            } catch (e) {
                debugLog('⚠️ Login fallback identity resolution failed', e.message);
            }
        }

        const headers = createHeaders(school, accessToken, authToken, targetProfile?.idSoggetto);
        const dashboardData = await getDashboard(headers);
        const gradesData = extractGradesFromDashboard(dashboardData);
        const tasksData = extractHomeworkFromDashboard(dashboardData);
        const announcementsData = extractPromemoriaFromDashboard(dashboardData);
        const activitiesData = extractClassActivitiesFromDashboard(dashboardData, {
            subjectId: targetProfile?.idSoggetto
        });
        const assenzeData = extractAssenzeFromDashboard(dashboardData);
        const verificheData = extractVerificheFromDashboard(dashboardData);

        const pid = generatePid(school, username, targetIndex);
        setArgoCredentials(pid, {
            schoolCode: school,
            username,
            password,
            profileIndex: targetIndex
        });
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

                const ARGO_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
                const tokenExpiry = new Date(Date.now() + ARGO_TOKEN_TTL_MS).toISOString();
                await supabase.from('google_tokens').upsert({
                    user_id: pid,
                    argo_school_code: school,
                    argo_username: username,
                    argo_password: encryptArgoPassword(password),
                    profile_index: targetIndex,
                    argo_access_token: accessToken,
                    argo_auth_token: authToken,
                    argo_tokens_expiry: tokenExpiry,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
            } catch (e) {
                debugLog('⚠️ Supabase sync error', e.message);
            }
        }

        const resp = {
            success: true,
            sessionToken: generateSessionToken(pid),
            session: {
                schoolCode: school,
                authToken,
                accessToken,
                userName: username,
                profileIndex: targetIndex,
                idSoggetto: targetProfile?.idSoggetto || null
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
            promemoria: announcementsData,
            activities: Array.isArray(activitiesData?.svolte) ? activitiesData.svolte : [],
            plannedActivities: Array.isArray(activitiesData?.pianificate) ? activitiesData.pianificate : [],
            assenzeData,
            verifiche: verificheData
        };

        resp.selectedProfile = {
            index: targetIndex,
            name: studentName,
            class: studentClass,
            school: targetProfile.school || school,
            idSoggetto: targetProfile.idSoggetto
        };

        if (profiles.length > 1) {
            resp.profiles = profiles.map(p => ({ index: p.index, name: p.name, class: p.class, school: p.school || school }));
        }

        res.status(200).json(resp);

    } catch (e) {
        console.error('LOGIN FAILURE', e);
        const status = e.status || (e.response?.status) || 401;
        const msg = e.message || "Errore sconosciuto durante il login";
        res.status(status).json({
            success: false,
            error: msg,
            code: status
        });
    }
}
