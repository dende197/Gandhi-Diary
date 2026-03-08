const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@gconnect.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );

    const { data: subs, error } = await supabase
        .from('push_subscriptions')
        .select('subscription');

    if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Errore nel recupero delle subscription' });
    }

    const payload = JSON.stringify({
        title: '☀️ Buongiorno Andrea!',
        body: 'Il tuo briefing mattutino è pronto. Tocca per iniziare.',
        url: '/morning',
        icon: '/icon-192.png'
    });

    let sent = 0;
    let failed = 0;

    for (const { subscription } of subs || []) {
        try {
            await webpush.sendNotification(subscription, payload);
            sent++;
        } catch (e) {
            console.error('Push failed for sub:', e.message);
            failed++;
        }
    }

    return res.json({ success: true, sent, failed });
};
