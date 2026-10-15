const { assertLegacyAuthEnabled } = require('../lib/argo-auth-policy');
const { database, checked, text, httpError, quota } = require('../lib/backend');
const { persistCredentials } = require('../lib/argo-session');
const {
    handleCors, debugLog, generatePid, normalizeClass, isValidName, createHeaders, generateSessionToken,
    isSessionSecurityConfigured, getRequestBody, parseClassDetails, CLASS_REGEX
} = require('../lib/helpers');
const {
    AdvancedArgo, enrichProfiles, resolveIdentityForProfile,
    resolveIdentityFromWebUI, resolveClassFromAnagraficaWeb, extractClassFromDashboard,
    getDashboard, extractGradesFromDashboard, extractHomeworkFromDashboard,
    extractPromemoriaFromDashboard, extractClassActivitiesFromDashboard, extractAssenzeFromDashboard, extractVerificheFromDashboard
} = require('../lib/argo');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    assertLegacyAuthEnabled();
    if (!isSessionSecurityConfigured()) {
        return res.status(500).json({
            success: false,
            error: 'Server auth non configurata: ARGO_ENCRYPTION_KEY mancante o non valida'
        });
    }

    const body = getRequestBody(req);
    const school = text(body.schoolCode || body.school, 30).toUpperCase();
    const username = text(body.username, 200).toLowerCase();
    const password = typeof body.password === 'string' && body.password.length <= 1000 ? body.password : '';
    const selectedProfileIndex = (body.selectedProfileIndex !== undefined) ? body.selectedProfileIndex :
        (body.profileIndex !== undefined ? body.profileIndex : null);

    if (!school || !username || !password) {
        return res.status(400).json({ success: false, error: 'Dati mancanti' });
    }

    try {
        await quota('login:' + school + ':' + username, 10, 300);

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

        let targetIndex = selectedProfileIndex === null ? 0 : Number(selectedProfileIndex);
        if (!Number.isInteger(targetIndex) || targetIndex < 0) throw httpError(400,'Indice profilo non valido');
        const targetProfile = profiles.find(p => Number(p.index) === targetIndex);
        if (!targetProfile) throw httpError(400, 'Profilo Argo non disponibile');
        const authToken = targetProfile.token;

        if (!accessToken || !authToken) throw new Error('Impossibile recuperare i token di sessione');

        let studentName = targetProfile.name;
        let studentClass = targetProfile.class;
        let detectedTrack = targetProfile.specialization || null;

        // Fallback identity resolution via API (or enrich if track missing or class incomplete)
        const hasFullClass = studentClass && studentClass !== 'N/D' && CLASS_REGEX.test(studentClass) && /\([A-Z]{2,3}\)/.test(studentClass);
        if (!studentName || studentName.startsWith('STUDENTE') || !hasFullClass) {
            const resolved = await resolveIdentityForProfile(
                school, username, password, accessToken, authToken,
                studentName, studentClass, targetProfile.idSoggetto
            );
            if (resolved.name) studentName = resolved.name;
            if (resolved.cls && resolved.cls !== 'N/D') studentClass = normalizeClass(resolved.cls) || studentClass;
            if (resolved.track) detectedTrack = detectedTrack || resolved.track;
        }

        // Fallback HTML scraping via cookie jar (per scuole con API limitate)
        const jar = loginRes.jar;
        if (jar && (!isValidName(studentName, username) || studentClass === 'N/D' || !CLASS_REGEX.test(studentClass))) {
            try {
                const webId = await resolveIdentityFromWebUI(jar);
                if (webId.name && isValidName(webId.name, username)) studentName = webId.name;
                if (webId.cls && webId.cls !== 'N/D') studentClass = normalizeClass(webId.cls) || studentClass;
                if (webId.track) detectedTrack = detectedTrack || webId.track;

                if (!isValidName(studentName, username) || !normalizeClass(studentClass)) {
                    const webAna = await resolveClassFromAnagraficaWeb(jar);
                    if (webAna.cls) studentClass = normalizeClass(webAna.cls) || studentClass;
                    if (webAna.name && !isValidName(studentName, username)) studentName = webAna.name;
                    if (webAna.track) detectedTrack = detectedTrack || webAna.track;
                }
            } catch (e) {
                debugLog('⚠️ Login fallback identity resolution failed', e.message);
            }
        }

        const headers = createHeaders(school, accessToken, authToken, targetProfile?.idSoggetto);
        let dashboardData = {};
        try {
            dashboardData = await getDashboard(headers, {enableBackfill:false});
        } catch (dashErr) {
            throw dashErr;
        }

        // Dashboard fallback for class / track if still incomplete
        if (!studentClass || studentClass === 'N/D' || !CLASS_REGEX.test(studentClass)) {
            const dashCls = extractClassFromDashboard(dashboardData);
            if (dashCls?.formatted) {
                studentClass = dashCls.formatted;
                if (dashCls.track) detectedTrack = detectedTrack || dashCls.track;
            }
        }

        // Extract track from studentClass if embedded in class string (e.g. 4D (SA))
        const parsedStudentClass = parseClassDetails(studentClass);
        if (parsedStudentClass?.track) {
            detectedTrack = detectedTrack || parsedStudentClass.track;
        }

        const gradesData = extractGradesFromDashboard(dashboardData);
        const tasksData = extractHomeworkFromDashboard(dashboardData);
        const announcementsData = extractPromemoriaFromDashboard(dashboardData);
        const activitiesData = extractClassActivitiesFromDashboard(dashboardData, {
            subjectId: targetProfile?.idSoggetto
        });
        const assenzeData = extractAssenzeFromDashboard(dashboardData);
        const verificheData = extractVerificheFromDashboard(dashboardData);

        // Preserve a student's existing PID when Argo reorders the account profiles.
        if (targetProfile.idSoggetto != null) {
            const existingIdentity = await checked(database().from('google_tokens').select('profile_index')
                .eq('argo_school_code', school).eq('argo_username', username)
                .eq('argo_id_soggetto', String(targetProfile.idSoggetto)).maybeSingle());
            if (existingIdentity) targetIndex = existingIdentity.profile_index;
        }
        const pid = generatePid(school, username, targetIndex);
        let storedSpecialization = detectedTrack || null;
        let storedAvatar = null;
        const normalizedClass = (studentClass && detectedTrack)
            ? (normalizeClass(studentClass, { track: detectedTrack }) || normalizeClass(studentClass))
            : (studentClass ? normalizeClass(studentClass) : null);
        const finalStudentClass = normalizedClass || studentClass || 'N/D';

        const supabase = database();
        const existingProfile = await checked(supabase.from('profiles').select('specialization,avatar').eq('id',pid).maybeSingle());
        storedSpecialization = storedSpecialization || existingProfile?.specialization || null;
        storedAvatar = existingProfile?.avatar || null;
        await persistCredentials(pid,school,username,password,targetIndex,loginRes,{...targetProfile,class:finalStudentClass});
        await checked(supabase.from('profiles').upsert({ id:pid,name:studentName,class:finalStudentClass,
            specialization:storedSpecialization,avatar:storedAvatar,last_active:new Date().toISOString() },{onConflict:'id'}));

        const resp = {
            success: true,
            sessionToken: await generateSessionToken(pid),
            session: {
                schoolCode: school,
                authToken,
                accessToken,
                userName: username,
                profileIndex: targetIndex,
                idSoggetto: targetProfile?.idSoggetto || null,
                class: finalStudentClass,
                specialization: storedSpecialization
            },
            student: {
                id: pid,
                name: studentName,
                class: finalStudentClass,
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
            class: finalStudentClass,
            school: targetProfile.school || school,
            idSoggetto: targetProfile.idSoggetto
        };

        if (profiles.length > 1) {
            resp.profiles = profiles.map(p => ({
                index: p.index,
                name: p.name,
                class: normalizeClass(p.class) || p.class,
                school: p.school || school
            }));
        }

        res.status(200).json(resp);

    } catch (e) {
        console.error('LOGIN FAILURE:', e.message || 'Authentication error');
        const status = e.status || (e.response?.status) || 401;
        const msg = e.message || "Errore sconosciuto durante il login";
        res.status(status).json({
            success: false,
            error: msg,
            code: status
        });
    }
}

module.exports = require('../lib/backend').endpoint(module.exports);
