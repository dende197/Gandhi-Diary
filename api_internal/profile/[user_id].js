const { handleCors, verifySessionToken } = require('../../lib/helpers');
const { getSupabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase non configurato' });

    const { user_id } = req.query;

    if (!verifySessionToken(req, (user_id || '').toLowerCase().replace(/\s+/g, ''))) {
        return res.status(403).json({ success: false, error: 'Non autorizzato' });
    }

    try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user_id).single();
        if (error?.code === 'PGRST116') return res.status(404).json({ success: false, error: 'Profilo non trovato' }); // PGRST116 = no rows returned
        if (error) throw error;

        res.status(200).json({ success: true, data });
    } catch (e) {
        console.error('Profile retrieval failed:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
}
