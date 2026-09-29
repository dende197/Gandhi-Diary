const {endpoint,text,quota,httpError} = require('../lib/backend');
const { handleCors, debugLog, normalizeClass, getRequestBody } = require('../lib/helpers');
const { AdvancedArgo, resolveIdentityForProfile } = require('../lib/argo');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = getRequestBody(req);
    const { schoolCode, username, password, profileIndex } = body;
    const school = text(schoolCode,30).toUpperCase();
    const user = text(username,200).toLowerCase();
    const idx = Number(profileIndex ?? 0);

    if (!school || !user || typeof password !== 'string' || !password || !Number.isInteger(idx) || idx < 0) {
        return res.status(400).json({ success: false, error: 'Parametri mancanti' });
    }

    try {
        await quota(`login:${school}:${user}`,10,300);
        const loginRes = await AdvancedArgo.rawLogin(school, user, password);
        const profiles = loginRes.profiles || [];

        if (profiles.length === 0) return res.status(404).json({ success: false, error: 'Nessun profilo' });

        const targetIdx = idx;
        const target = profiles.find(p=>Number(p.index)===idx);
        if (!target) throw httpError(400,'Profilo non valido');

        const { name, cls } = await resolveIdentityForProfile(
            school, user, password, loginRes.access_token, target.token,
            target.name, target.class, target.idSoggetto
        );

        res.json({
            success: true,
            name: name || `STUDENTE ${targetIdx + 1}`,
            class: normalizeClass(cls) || 'N/D'
        });

    } catch (e) {
        debugLog('⚠️ resolve_profile error', e.message);
        const msg = String(e.message || '');
        const lower = msg.toLowerCase();
        const isAuth = lower.includes('credenziali') || lower.includes('password') ||
            lower.includes('unauthorized') || lower.includes('forbidden') ||
            lower.includes('invalid') || e?.response?.status === 401 || e?.response?.status === 403;
        res.status(e.status || (isAuth ? 401 : 500)).json({ success: false, error: msg || 'Errore risoluzione profilo' });
    }
}

module.exports = endpoint(module.exports);
