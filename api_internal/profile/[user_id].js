const { handleCors } = require('../../lib/helpers');
const { getSupabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase non configurato' });

    const { user_id } = req.query;

    try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user_id);
        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ success: false, error: 'Profilo non trovato' });

        res.status(200).json({ success: true, data: data[0] });
    } catch (e) {
        console.error('Profile retrieval failed:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
}
