const { handleCors } = require('../../lib/helpers');
const { getSupabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ success: false, error: 'Database non disponibile' });

    const { profileId, days } = req.query;
    if (!profileId) return res.status(400).json({ success: false, error: 'profileId obbligatorio' });

    const numDays = Math.min(30, Math.max(1, Number(days) || 14));
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - numDays);

    try {
        const { data, error } = await supabase
            .from('mental_health_logs')
            .select('log_date, stress, fatigue, sleep_hours, perceived_load, note, ai_advice, motivational_quote')
            .eq('profile_id', profileId)
            .gte('log_date', sinceDate.toISOString().slice(0, 10))
            .order('log_date', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (e) {
        console.error('MH History Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
}
