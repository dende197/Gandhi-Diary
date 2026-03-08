const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );

    const { subscription } = req.body;
    if (!subscription) {
        return res.status(400).json({ error: 'Subscription mancante' });
    }

    const { error } = await supabase.from('push_subscriptions').insert({ subscription });

    if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Errore nel salvataggio della subscription' });
    }

    return res.json({ success: true });
};
