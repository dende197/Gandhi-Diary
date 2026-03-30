const { handleCors, debugLog, verifySessionToken, normalizeUserId } = require('../../lib/helpers');
const { getSupabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase non configurato' });

    try {
        const { userId, name, class: className, avatar, specialization } = req.body;
        if (!userId) return res.status(400).json({ success: false, error: 'userId mancante' });

        const normalizedId = normalizeUserId(userId);
        if (!verifySessionToken(req, normalizedId)) {
            return res.status(403).json({ success: false, error: 'Non autorizzato' });
        }

        const profileData = { id: normalizedId, last_active: new Date().toISOString() };
        if (name) profileData.name = name;
        if (className) profileData.class = className;
        if (specialization) profileData.specialization = specialization;
        if (avatar) {
            if (!avatar.startsWith('http')) {
                return res.status(400).json({ success: false, error: 'Avatar deve essere URL' });
            }
            profileData.avatar = avatar;
        }

        const { error } = await supabase.from('profiles').upsert(profileData, { onConflict: 'id' });
        if (error) throw error;

        res.status(200).json({ success: true });
    } catch (e) {
        console.error('Profile update failed:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
}
