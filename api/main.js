const { v4: uuidv4 } = require('uuid');
const { 
    handleCors, debugLog, generatePid, normalizeClass, isValidName, createHeaders, DEBUG_MODE, USER_AGENT 
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const { 
    AdvancedArgo, enrichProfiles, resolveIdentityForProfile, 
    resolveIdentityFromWebUI, resolveClassFromAnagraficaWeb, 
    getDashboard, extractGradesFromDashboard, extractHomeworkFromDashboard, extractPromemoriaFromDashboard 
} = require('../lib/argo');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    const { action } = req.query;

    try {
        switch (action) {
            case 'ping':
                return res.status(200).json({ pong: true, ts: Date.now() });

            case 'health':
                return res.status(200).json({ status: 'ok', debug: DEBUG_MODE, ts: new Date().toISOString() });

            case 'login':
                return await handleLogin(req, res);

            case 'sync':
                return await handleSync(req, res);

            case 'upload':
                return await handleUpload(req, res);

            case 'resolve-profile':
                return await handleResolveProfile(req, res);

            case 'profile-raw':
                return await handleProfileRaw(req, res);

            default:
                return res.status(400).json({ error: 'Azione non valida' });
        }
    } catch (e) {
        console.error(`Main Hub Error [${action}]:`, e.message);
        res.status(500).json({ success: false, error: e.message });
    }
};

async function handleLogin(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body;
    const school = (body.schoolCode || body.school || '').trim().toUpperCase();
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password;
    const selectedProfileIndex = (body.selectedProfileIndex !== undefined) ? body.selectedProfileIndex :
        (body.profileIndex !== undefined ? body.profileIndex : null);

    if (!school || !username || !password) return res.status(400).json({ success: false, error: 'Dati mancanti' });

    debugLog('LOGIN REQUEST', { school, username, idx: selectedProfileIndex });
    const loginRes = await AdvancedArgo.rawLogin(school, username, password);
    const accessToken = loginRes.access_token;
    let profiles = loginRes.profiles || [];
    profiles = await enrichProfiles(school, accessToken, profiles);

    if (profiles.length > 1 && selectedProfileIndex === null) {
        return res.status(200).json({
            success: true, status: 'MULTIPLE_PROFILES',
            profiles: profiles.map(p => ({ index: p.index, name: p.name, class: p.class, school }))
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

    if (!studentName || studentName.startsWith('STUDENTE') || studentClass === 'N/D') {
        const resolved = await resolveIdentityForProfile(school, username, password, accessToken, authToken, studentName, studentClass, targetProfile.idSoggetto);
        if (resolved.name) studentName = resolved.name;
        if (resolved.cls && resolved.cls !== 'N/D') studentClass = normalizeClass(resolved.cls) || studentClass;
    }

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
    let storedSpecialization = null, storedAvatar = null;

    const supabase = getSupabase();
    if (supabase) {
        const { data: existingProfile } = await supabase.from('profiles').select('specialization, avatar').eq('id', pid).single();
        if (existingProfile) {
            storedSpecialization = existingProfile.specialization;
            storedAvatar = existingProfile.avatar;
        }
        await supabase.from('profiles').upsert({
            id: pid, name: studentName, class: normalizeClass(studentClass) || studentClass || 'N/D',
            specialization: storedSpecialization || null, avatar: storedAvatar || null, last_active: new Date().toISOString()
        }, { onConflict: 'id' });
    }

    const resp = {
        success: true, session: { schoolCode: school, authToken, accessToken, userName: username, profileIndex: targetIndex },
        student: { id: pid, name: studentName, class: studentClass || 'N/D', school, specialization: storedSpecialization, avatar: storedAvatar },
        tasks: tasksData, voti: gradesData, promemoria: announcementsData
    };
    if (targetProfile) resp.selectedProfile = { index: targetIndex, name: studentName, class: studentClass, school: targetProfile.school || school, idSoggetto: targetProfile.idSoggetto };
    if (profiles.length > 1) resp.profiles = profiles.map(p => ({ index: p.index, name: p.name, class: p.class, school: p.school || school }));
    res.status(200).json(resp);
}

async function handleSync(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body;
    const school = (body.schoolCode || '').trim().toUpperCase();
    const storedUser = body.storedUser;
    const storedPass = body.storedPass;
    let profileIndex = parseInt(body.profileIndex) || 0;

    if (!school || !storedUser || !storedPass) return res.status(401).json({ success: false, error: 'Credenziali mancanti' });

    const user = decodeURIComponent(Buffer.from(storedUser, 'base64').toString('utf-8')).trim().toLowerCase();
    const pwd = decodeURIComponent(Buffer.from(storedPass, 'base64').toString('utf-8'));

    const loginRes = await AdvancedArgo.rawLogin(school, user, pwd);
    const accessToken = loginRes.access_token;
    const profiles = loginRes.profiles || [];
    if (profiles.length > 0) {
        if (profileIndex < 0 || profileIndex >= profiles.length) profileIndex = 0;
    }
    const authToken = profiles[profileIndex]?.token;

    const headers = createHeaders(school, accessToken, authToken, profiles[profileIndex]?.idSoggetto);
    const dashboardData = await getDashboard(headers);
    const grades = extractGradesFromDashboard(dashboardData);
    const tasks = extractHomeworkFromDashboard(dashboardData);
    const promemoria = extractPromemoriaFromDashboard(dashboardData);

    let enrichedStudent = null;
    const supabase = getSupabase();
    if (supabase && profiles.length > 0) {
        const t = profiles[profileIndex];
        const resIdent = await resolveIdentityForProfile(school, user, pwd, accessToken, authToken, t.name, t.class, t.idSoggetto);
        const sName = resIdent.name;
        const sClass = normalizeClass(resIdent.cls) || resIdent.cls;
        const pid = generatePid(school, user, profileIndex);
        const { data: existingProfile } = await supabase.from('profiles').select('specialization, avatar, name, class').eq('id', pid).single();
        const payload = {
            id: pid, last_active: new Date().toISOString(),
            specialization: existingProfile?.specialization || null, avatar: existingProfile?.avatar || null
        };
        if (sName && isValidName(sName, user)) payload.name = sName;
        else if (existingProfile?.name && isValidName(existingProfile.name, user)) payload.name = existingProfile.name;
        const sClassNorm = normalizeClass(sClass || existingProfile?.class);
        if (sClassNorm) payload.class = sClassNorm;
        await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
        enrichedStudent = { id: pid, name: payload.name || 'Utente', class: payload.class || 'N/D', specialization: payload.specialization, avatar: payload.avatar };
    }

    res.json({ success: true, tasks, voti: grades, promemoria, new_tokens: { authToken, accessToken }, student: enrichedStudent });
}

async function handleUpload(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase non configurato' });
    const { image: base64Image, userId = uuidv4() } = req.body;
    if (!base64Image || !base64Image.startsWith('data:image/')) return res.status(400).json({ success: false, error: 'Formato immagine non valido' });
    const matches = base64Image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid base64');
    const ext = matches[1], buffer = Buffer.from(matches[2], 'base64'), filename = `${userId.replace(/:/g, '_')}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(filename, buffer, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filename);
    res.status(200).json({ success: true, url: publicData.publicUrl });
}

async function handleResolveProfile(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { schoolCode, username, password, profileIndex } = req.body;
    const school = (schoolCode || '').trim().toUpperCase(), user = (username || '').trim().toLowerCase(), idx = parseInt(profileIndex) || 0;
    if (!school || !user || !password) return res.status(400).json({ success: false, error: 'Parametri mancanti' });
    const loginRes = await AdvancedArgo.rawLogin(school, user, password);
    const profiles = loginRes.profiles || [];
    if (profiles.length === 0) return res.status(404).json({ success: false, error: 'Nessun profilo' });
    const targetIdx = (idx < 0 || idx >= profiles.length) ? 0 : idx;
    const target = profiles[targetIdx];
    const { name, cls } = await resolveIdentityForProfile(school, user, password, loginRes.access_token, target.token, target.name, target.class, target.idSoggetto);
    res.json({ success: true, name: name || `STUDENTE ${targetIdx + 1}`, class: normalizeClass(cls) || 'N/D' });
}

async function handleProfileRaw(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!DEBUG_MODE) return res.status(403).json({ success: false, error: 'Debug endpoint disponibile solo con DEBUG_MODE=true' });
    const { schoolCode, username, password, profileIndex } = req.body;
    const school = (schoolCode || '').trim().toUpperCase(), user = (username || '').trim().toLowerCase(), idx = parseInt(profileIndex) || 0;
    if (!school || !user || !password) return res.status(400).json({ success: false, error: 'Parametri mancanti' });
    const loginRes = await AdvancedArgo.rawLogin(school, user, password);
    const profiles = loginRes.profiles || [];
    const targetIdx = (idx < 0 || idx >= profiles.length) ? 0 : idx;
    const profile = profiles[targetIdx], rawData = profile.raw || {}, scheda = rawData.scheda || {}, classeObj = scheda.classe || {};
    res.json({
        success: true, profileIndex: targetIdx, totalProfiles: profiles.length,
        profile: { name: profile.name, class: profile.class, school: profile.school, idSoggetto: profile.idSoggetto },
        rawData: { classe: { desDenominazione: classeObj.desDenominazione, desSezione: classeObj.desSezione, desCorso: classeObj.desCorso, corso: classeObj.corso, fullClasseObject: classeObj }, scheda, fullRaw: rawData }
    });
}
