const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublic || !vapidPrivate) {
        return res.status(503).json({ success: false, error: 'VAPID keys mancanti su Vercel' });
    }
    if (!supabaseUrl || !supabaseKey) {
        return res.status(503).json({ success: false, error: 'Database non configurato' });
    }

    webpush.setVapidDetails('mailto:info@gdiary.app', vapidPublic, vapidPrivate);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { profileId } = req.body;
    if (!profileId) return res.status(400).json({ success: false, error: 'profileId richiesto' });

    try {
        const { data: sub, error } = await supabase
            .from('push_subscriptions')
            .select('subscription')
            .eq('profile_id', profileId)
            .single();

        if (error || !sub || !sub.subscription) {
            return res.status(404).json({
                success: false,
                error: 'Nessuna sottoscrizione push trovata. Assicurati di aver attivato le notifiche dal profilo.'
            });
        }

        const payload = JSON.stringify({
            title: 'G-Diary 🔔 Test',
            body: 'Le notifiche funzionano! Riceverai i promemoria all\'orario scelto.',
            icon: '/icon-192.png'
        });

        await webpush.sendNotification(sub.subscription, payload);
        return res.json({ success: true, message: 'Notifica di test inviata!' });

    } catch (e) {
        console.error('[TEST] Push error:', e.statusCode, e.message);
        if (e.statusCode === 410 || e.statusCode === 404) {
            return res.status(410).json({
                success: false,
                error: 'Sottoscrizione scaduta. Riattiva le notifiche dal profilo.'
            });
        }
        return res.status(500).json({ success: false, error: e.message });
    }
};
