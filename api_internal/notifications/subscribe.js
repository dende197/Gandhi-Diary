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
        return res.status(400).json({
            success: false,
            error: 'Dati incompleti',
            debug: { hasProfileId: !!profileId, hasSubscription: !!subscription }
        });
    }

    try {
        // First try to delete any existing row, then insert fresh
        await supabase
            .from('push_subscriptions')
            .delete()
            .eq('profile_id', profileId);

        const { data, error } = await supabase
            .from('push_subscriptions')
            .insert({
                profile_id: profileId,
                subscription: subscription
            })
            .select();

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message,
                code: error.code,
                details: error.details
            });
        }

        return res.json({
            success: true,
            saved: !!data && data.length > 0,
            profileId: profileId
        });
    } catch (e) {
        console.error('Push Subscribe Error:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
