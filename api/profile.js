const { handleCors, debugLog } = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    const { user_id } = req.query;

    try {
        if (req.method === 'GET') {
            if (!user_id) return res.status(400).json({ success: false, error: 'user_id obbligatorio' });
            return await handleGet(req, res, user_id);
        } else if (req.method === 'PUT') {
            return await handlePut(req, res);
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (e) {
        console.error(`Profile Hub Error:`, e.message);
        res.status(500).json({ success: false, error: e.message });
    }
};

async function handleGet(req, res, user_id) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non configurato');
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user_id);
    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ success: false, error: 'Profilo non trovato' });
    res.status(200).json({ success: true, data: data[0] });
}

async function handlePut(req, res) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non configurato');
    const { userId, name, class: className, avatar, specialization } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId mancante' });
    const profileData = { id: userId, last_active: new Date().toISOString() };
    if (name) profileData.name = name;
    if (className) profileData.class = className;
    if (specialization) profileData.specialization = specialization;
    if (avatar) {
        if (!avatar.startsWith('http')) return res.status(400).json({ success: false, error: 'Avatar deve essere URL' });
        profileData.avatar = avatar;
    }
    const { error } = await supabase.from('profiles').upsert(profileData, { onConflict: 'id' });
    if (error) throw error;
    res.status(200).json({ success: true });
}
