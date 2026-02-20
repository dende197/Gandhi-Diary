const { handleCors } = require('../../lib/helpers');
const { getSupabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ success: false, error: 'Database non disponibile' });

    const { profileId, date, stress, fatigue, sleep, load, note } = req.body;
    if (!profileId || !date) return res.status(400).json({ success: false, error: 'profileId e date obbligatori' });

    try {
        const { error } = await supabase.from('mental_health_logs').upsert({
            profile_id: profileId,
            log_date: date,
            stress: Math.min(5, Math.max(1, Number(stress) || 3)),
            fatigue: Math.min(5, Math.max(1, Number(fatigue) || 3)),
            sleep_hours: Math.min(24, Math.max(0, Number(sleep) || 7)),
            perceived_load: ['low', 'medium', 'high'].includes(load) ? load : 'medium',
            note: (note || '').substring(0, 500)
        }, { onConflict: 'profile_id,log_date' });

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        console.error('MH Save Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
}
