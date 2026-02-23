const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return res.status(503).json({ success: false, error: 'Database non configurato' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // GET — Fetch user notification preferences
    if (req.method === 'GET') {
        const profileId = req.query.profileId;
        if (!profileId) {
            return res.status(400).json({ success: false, error: 'profileId richiesto' });
        }
        try {
            const { data, error } = await supabase
                .from('notification_settings')
                .select('*')
                .eq('profile_id', profileId)
                .single();
            if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
            return res.json({ success: true, settings: data || null });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // POST — Save/update user notification preferences
    if (req.method === 'POST') {
        const { profileId, stressEnabled, stressTime, studyEnabled, studyTime } = req.body;
        if (!profileId) {
            return res.status(400).json({ success: false, error: 'profileId richiesto' });
        }
        try {
            const { error } = await supabase
                .from('notification_settings')
                .upsert({
                    profile_id: profileId,
                    stress_enabled: stressEnabled,
                    stress_time: stressTime,
                    study_enabled: studyEnabled,
                    study_time: studyTime
                }, { onConflict: 'profile_id' });
            if (error) throw error;
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
};
