const { handleCors } = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    const { action } = req.query;

    try {
        switch (action) {
            case 'save':
                return await handleSave(req, res);
            case 'history':
                return await handleHistory(req, res);
            default:
                return res.status(400).json({ error: 'Azione non valida' });
        }
    } catch (e) {
        console.error(`Mental Hub Error [${action}]:`, e.message);
        res.status(500).json({ success: false, error: e.message });
    }
};

async function handleSave(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const supabase = getSupabase();
    if (!supabase) throw new Error('Database non disponibile');
    const { profileId, date, stress, fatigue, sleep, load, note } = req.body;
    if (!profileId || !date) return res.status(400).json({ success: false, error: 'profileId e date obbligatori' });
    const { error } = await supabase.from('mental_health_logs').upsert({
        profile_id: profileId, log_date: date,
        stress: Math.min(5, Math.max(1, Number(stress) || 3)),
        fatigue: Math.min(5, Math.max(1, Number(fatigue) || 3)),
        sleep_hours: Math.min(24, Math.max(0, Number(sleep) || 7)),
        perceived_load: ['low', 'medium', 'high'].includes(load) ? load : 'medium',
        note: (note || '').substring(0, 500)
    }, { onConflict: 'profile_id,log_date' });
    if (error) throw error;
    res.json({ success: true });
}

async function handleHistory(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const supabase = getSupabase();
    if (!supabase) throw new Error('Database non disponibile');
    const { profileId, days } = req.query;
    if (!profileId) return res.status(400).json({ success: false, error: 'profileId obbligatorio' });
    const numDays = Math.min(30, Math.max(1, Number(days) || 14));
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - numDays);
    const { data, error } = await supabase.from('mental_health_logs').select('log_date, stress, fatigue, sleep_hours, perceived_load, note, ai_advice, motivational_quote').eq('profile_id', profileId).gte('log_date', sinceDate.toISOString().slice(0, 10)).order('log_date', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
}
