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
        const romeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
        const timeStr = `${String(romeTime.getHours()).padStart(2, '0')}:${String(romeTime.getMinutes()).padStart(2, '0')}`;

        try {
            const { data: settings, error: sErr } = await supabase
                .from('notification_settings').select('*');

            if (sErr || !settings || settings.length === 0) {
                return res.json({ success: true, time: timeStr, sent: 0, reason: 'no settings' });
            }

            // Build a 5-minute backwards window to match against (catches slightly delayed pings)
            const nowDate = new Date();
            const romeNow = new Date(nowDate.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
            const currentMinutes = romeNow.getHours() * 60 + romeNow.getMinutes();
            const timeWindow = [];
            for (let offset = 0; offset < 5; offset++) {
                // offset 0 is current minute, 1 is 1 minute ago, etc.
                let m = currentMinutes - offset;
                if (m < 0) m += 24 * 60; // Handle midnight wrap-around
                const hh = String(Math.floor(m / 60)).padStart(2, '0');
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
            const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(nowDate); // YYYY-MM-DD

            for (const setting of matching) {
                const userSub = subs.find(s => s.profile_id === setting.profile_id);
                if (!userSub?.subscription) continue;

                let isStress = setting.stress_enabled && timeWindow.includes(setting.stress_time);
                let isStudy = setting.study_enabled && timeWindow.includes(setting.study_time);

                // Anti-spam Stress: check if already notified today
                if (isStress && setting.last_stress_sent) {
                    const lastD = new Date(setting.last_stress_sent);
                    if (new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(lastD) === todayStr) {
                        isStress = false; // Already sent stress today
                    }
                }

                // Anti-spam Study: check if already notified today
                if (isStudy && setting.last_study_sent) {
                    const lastD = new Date(setting.last_study_sent);
                    if (new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(lastD) === todayStr) {
                        isStudy = false; // Already sent study today
                    }
                }

                if (!isStress && !isStudy) continue; // Nothing to send for this user in this window

                const updates = {};

                if (isStress) {
                    try {
                        await webpush.sendNotification(userSub.subscription,
                            JSON.stringify({ title: 'G-Diary 🧠', body: 'Come ti senti oggi? Registra stress e stanchezza.', icon: '/icon-192.png' }));
                        sent++;
                        updates.last_stress_sent = new Date().toISOString();
                    } catch (e) {
                        if (e.statusCode === 410 || e.statusCode === 404)
                            await supabase.from('push_subscriptions').delete().eq('profile_id', setting.profile_id);
                    }
                }
                if (isStudy) {
                    try {
                        await webpush.sendNotification(userSub.subscription,
                            JSON.stringify({ title: 'G-Diary 📚', body: 'È ora di studiare! Controlla i compiti.', icon: '/icon-192.png' }));
                        sent++;
                        updates.last_study_sent = new Date().toISOString();
                    } catch (e) {
                        if (e.statusCode === 410 || e.statusCode === 404)
                            await supabase.from('push_subscriptions').delete().eq('profile_id', setting.profile_id);
                    }
                }

                // Update DB with timestamps
                if (Object.keys(updates).length > 0) {
                    await supabase
                        .from('notification_settings')
                        .update(updates)
                        .eq('profile_id', setting.profile_id);
                }
            }

            return res.json({ success: true, time: timeStr, matching: matching.length, sent });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    if (action === 'debug-cron') {
        const supabase = getSupabase();
        if (!supabase) return res.status(503).json({ success: false, error: 'DB non configurato' });

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

        try {
            const { data: settings } = await supabase.from('notification_settings').select('*');
            const { data: subs } = await supabase.from('push_subscriptions').select('*');
            return res.json({ timeWindow, settings, subs });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(404).json({ success: false, error: 'Action not found. Valid: subscribe, settings, test, cron' });
};
