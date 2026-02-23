const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return res.status(503).json({ success: false, error: 'Database non configurato' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { profileId, subscription } = req.body;

    if (!profileId || !subscription) {
        return res.status(400).json({ success: false, error: 'Dati incompleti (profileId e subscription richiesti)' });
    }

    try {
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({
                profile_id: profileId,
                subscription: subscription
            }, { onConflict: 'profile_id' });

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        console.error('Push Subscribe Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
};
