const { handleCors, DEBUG_MODE, getRequestBody } = require('../../lib/helpers');
const { AdvancedArgo } = require('../../lib/argo');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!DEBUG_MODE) {
        return res.status(403).json({ success: false, error: 'Debug endpoint disponibile solo con DEBUG_MODE=true' });
    }

    const body = getRequestBody(req);
    const { schoolCode, username, password, profileIndex } = body;
    const school = (schoolCode || '').trim().toUpperCase();
    const user = (username || '').trim().toLowerCase();
    const idx = parseInt(profileIndex) || 0;

    if (!school || !user || !password) {
        return res.status(400).json({ success: false, error: 'Parametri mancanti' });
    }

    try {
        const loginRes = await AdvancedArgo.rawLogin(school, user, password);
        const profiles = loginRes.profiles || [];

        if (profiles.length === 0) return res.status(404).json({ success: false, error: 'Nessun profilo trovato' });

        const targetIdx = (idx < 0 || idx >= profiles.length) ? 0 : idx;
        const profile = profiles[targetIdx];
        // Keep this payload intentionally compact (class-focused) for stable debug output.
        // We intentionally expose only scheda.classe here (instead of larger raw sections used in earlier debug versions)
        // to reduce noisy payload diffs and keep quick diagnostics consistent across schools/profiles.
        const rawData = profile.raw || {};
        const scheda = rawData.scheda || {};
        const classeObj = scheda.classe || {};

        res.json({
            success: true,
            profileIndex: targetIdx,
            totalProfiles: profiles.length,
            profile: { name: profile.name, class: profile.class, school: profile.school, idSoggetto: profile.idSoggetto },
            rawData: {
                scheda: {
                    classe: {
                        desDenominazione: classeObj.desDenominazione,
                        desSezione: classeObj.desSezione,
                        desCorso: classeObj.desCorso,
                        corso: classeObj.corso
                    }
                }
            }
        });

    } catch (e) {
        console.error('profile-raw debug error:', e?.message || e);
        res.status(500).json({ success: false, error: e.message || 'Internal server error' });
    }
}
