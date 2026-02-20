const { handleCors, debugLog, normalizeClass } = require('../lib/helpers');
const { AdvancedArgo, resolveIdentityForProfile } = require('../lib/argo');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { schoolCode, username, password, profileIndex } = req.body;
    const school = (schoolCode || '').trim().toUpperCase();
    const user = (username || '').trim().toLowerCase();
    const idx = parseInt(profileIndex) || 0;

    if (!school || !user || !password) {
        return res.status(400).json({ success: false, error: 'Parametri mancanti' });
    }

    try {
        const loginRes = await AdvancedArgo.rawLogin(school, user, password);
        const profiles = loginRes.profiles || [];

        if (profiles.length === 0) return res.status(404).json({ success: false, error: 'Nessun profilo' });

        const targetIdx = (idx < 0 || idx >= profiles.length) ? 0 : idx;
        const target = profiles[targetIdx];

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
        res.status(500).json({ success: false, error: e.message });
    }
}
