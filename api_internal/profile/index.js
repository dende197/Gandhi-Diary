const { handleCors, verifySessionToken, normalizeUserId, getRequestBody } = require('../../lib/helpers');
const { getSupabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase non configurato' });

    try {
        const body = getRequestBody(req);
        const { userId, name, class: className, avatar, specialization } = body;
        if (!userId) return res.status(400).json({ success: false, error: 'userId mancante' });

        const normalizedId = normalizeUserId(userId);
        if (!(await verifySessionToken(req, normalizedId))) {
            return res.status(403).json({ success: false, error: 'Non autorizzato' });
        }

        for (const [key,value] of Object.entries({name,class:className,specialization,avatar})) {
            if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > (key==='avatar' ? 2048 : 200))) {
                return res.status(400).json({success:false,error:'Dati profilo non validi'});
            }
        }
        const profileData = { id: normalizedId, last_active: new Date().toISOString() };
        if (name) profileData.name = name;
        if (className) profileData.class = className;
        if (specialization) profileData.specialization = specialization;
        if (avatar) {
            if (!/^https?:\/\//i.test(avatar)) {
                return res.status(400).json({ success: false, error: 'Avatar deve essere URL' });
            }
            profileData.avatar = avatar;
        }

        if (avatar === null) profileData.avatar = null;
        const { error } = await supabase.from('profiles').upsert(profileData, { onConflict: 'id' });
        if (error) throw error;

        res.status(200).json({ success: true });
    } catch (e) {
        console.error('Profile update failed:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
}

module.exports = require('../../lib/backend').endpoint(module.exports);
