const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

function setupWebPush() {
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublic || !vapidPrivate) return null;
    webpush.setVapidDetails('mailto:info@gdiary.app', vapidPublic, vapidPrivate);
    return webpush;
}

function getSupabase() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action || '';

    // ---- SUBSCRIBE (POST) ----
    if (action === 'subscribe') {
        return require('../api_internal/notifications/subscribe')(req, res);
    }

    // ---- SETTINGS (GET/POST) ----
    if (action === 'settings') {
        return require('../api_internal/notifications/settings')(req, res);
    }

    // ---- TEST PUSH (POST) ----
    if (action === 'test') {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

        const wp = setupWebPush();
        if (!wp) return res.status(503).json({ success: false, error: 'VAPID keys mancanti su Vercel. Aggiungi VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nelle Environment Variables.' });

        const supabase = getSupabase();
        if (!supabase) return res.status(503).json({ success: false, error: 'Database non configurato' });

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
                    error: 'Nessuna sottoscrizione push trovata. Prima salva le impostazioni, poi testa.'
                });
            }

            const payload = JSON.stringify({
                title: 'G-Diary 🔔 Test',
                body: 'Le notifiche funzionano! Riceverai i promemoria agli orari scelti.',
                icon: '/icon-192.png'
            });

            await webpush.sendNotification(sub.subscription, payload);
            return res.json({ success: true, message: 'Notifica di test inviata!' });

        } catch (e) {
            console.error('[TEST-PUSH] Error:', e.statusCode, e.message);
            if (e.statusCode === 410 || e.statusCode === 404) {
                return res.status(410).json({ success: false, error: 'Sottoscrizione scaduta. Riattiva le notifiche.' });
            }
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // ---- CRON (GET — called by external scheduler) ----
    if (action === 'cron') {
        // Optional Security: Check for a secret key to prevent unauthorized triggers
        const secret = req.query.secret;
        if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const wp = setupWebPush();
        if (!wp) return res.status(503).json({ success: false, error: 'VAPID non configurate' });

        const supabase = getSupabase();
        if (!supabase) return res.status(503).json({ success: false, error: 'DB non configurato' });

        const now = new Date();
        const timeStr = new Intl.DateTimeFormat('it-IT', {
            timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false
        }).format(now);

        try {
            const { data: settings, error: sErr } = await supabase
                .from('notification_settings').select('*');

            if (sErr || !settings || settings.length === 0) {
                return res.json({ success: true, time: timeStr, sent: 0, reason: 'no settings' });
            }

            // Build a 5-minute window of times to match against (to handle scheduler running every 5 min)
            const nowDate = new Date();
            const romeNow = new Date(nowDate.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
            const currentMinutes = romeNow.getHours() * 60 + romeNow.getMinutes();
            const timeWindow = [];
            for (let offset = 0; offset < 5; offset++) {
                const m = currentMinutes + offset;
                const hh = String(Math.floor(m / 60) % 24).padStart(2, '0');
                const mm = String(m % 60).padStart(2, '0');
                timeWindow.push(`${hh}:${mm}`);
            }

            const matching = settings.filter(s =>
                (s.stress_enabled && timeWindow.includes(s.stress_time)) ||
                (s.study_enabled && timeWindow.includes(s.study_time))
            );

            if (matching.length === 0) {
                return res.json({ success: true, time: timeStr, sent: 0, reason: 'no match' });
            }

            const ids = matching.map(s => s.profile_id);
            const { data: subs } = await supabase
                .from('push_subscriptions').select('*').in('profile_id', ids);

            if (!subs || subs.length === 0) {
                return res.json({ success: true, time: timeStr, sent: 0, reason: 'no subs' });
            }

            let sent = 0;
            for (const setting of matching) {
                const userSub = subs.find(s => s.profile_id === setting.profile_id);
                if (!userSub?.subscription) continue;

                const isStress = setting.stress_enabled && timeWindow.includes(setting.stress_time);
                const isStudy = setting.study_enabled && timeWindow.includes(setting.study_time);

                if (isStress) {
                    try {
                        await webpush.sendNotification(userSub.subscription,
                            JSON.stringify({ title: 'G-Diary 🧠', body: 'Come ti senti oggi? Registra stress e stanchezza.', icon: '/icon-192.png' }));
                        sent++;
                    } catch (e) {
                        if (e.statusCode === 410 || e.statusCode === 404)
                            await supabase.from('push_subscriptions').delete().eq('profile_id', setting.profile_id);
                    }
                }
                if (isStudy && !(isStress && setting.stress_time === setting.study_time)) {
                    try {
                        await webpush.sendNotification(userSub.subscription,
                            JSON.stringify({ title: 'G-Diary 📚', body: 'È ora di studiare! Controlla i compiti.', icon: '/icon-192.png' }));
                        sent++;
                    } catch (e) {
                        if (e.statusCode === 410 || e.statusCode === 404)
                            await supabase.from('push_subscriptions').delete().eq('profile_id', setting.profile_id);
                    }
                }
            }

            return res.json({ success: true, time: timeStr, matching: matching.length, sent });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    return res.status(404).json({ success: false, error: 'Action not found. Valid: subscribe, settings, test, cron' });
};
