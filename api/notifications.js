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
        if (!wp) return res.status(503).json({ success: false, error: 'VAPID pins missing' });

        const supabase = getSupabase();
        if (!supabase) return res.status(503).json({ success: false, error: 'DB not configured' });

        const { profileId } = req.body;
        if (!profileId) return res.status(400).json({ success: false, error: 'profileId required' });

        try {
            const { data: sub, error } = await supabase
                .from('push_subscriptions')
                .select('subscription')
                .eq('profile_id', profileId)
                .single();

            if (error || !sub || !sub.subscription) {
                return res.status(404).json({ success: false, error: 'No subscription found' });
            }

            const payload = JSON.stringify({
                title: 'G-Diary 🔔 Test',
                body: 'Le notifiche funzionano! Riceverai i promemoria agli orari scelti.',
                icon: '/icon-192.png'
            });

            await webpush.sendNotification(sub.subscription, payload);
            return res.json({ success: true, message: 'Test notification sent!' });

        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // ---- CRON (GET — called by external scheduler) ----
    if (action === 'cron') {
        const secret = req.query.secret;
        if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const wp = setupWebPush();
        if (!wp) return res.status(503).json({ success: false, error: 'VAPID not configured' });

        const supabase = getSupabase();
        if (!supabase) return res.status(503).json({ success: false, error: 'DB not configured' });

        // Get exact time in Rome (HH:mm)
        const now = new Date();
        const romeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
        const timeStr = `${String(romeTime.getHours()).padStart(2, '0')}:${String(romeTime.getMinutes()).padStart(2, '0')}`;

        try {
            const { data: settings, error: sErr } = await supabase.from('notification_settings').select('*');
            if (sErr || !settings) return res.json({ success: true, time: timeStr, sent: 0, reason: 'no settings' });

            const matching = settings.filter(s =>
                (s.stress_enabled && s.stress_time === timeStr) ||
                (s.study_enabled && s.study_time === timeStr)
            );

            if (matching.length === 0) {
                return res.json({ success: true, time: timeStr, sent: 0, reason: 'no match' });
            }

            const ids = matching.map(s => s.profile_id);
            const { data: subs } = await supabase.from('push_subscriptions').select('*').in('profile_id', ids);

            if (!subs || subs.length === 0) {
                return res.json({ success: true, time: timeStr, sent: 0, reason: 'no subs' });
            }

            let sentCount = 0;
            for (const setting of matching) {
                const userSub = subs.find(s => s.profile_id === setting.profile_id);
                if (!userSub?.subscription) continue;

                const isStress = setting.stress_enabled && setting.stress_time === timeStr;
                const isStudy = setting.study_enabled && setting.study_time === timeStr;

                if (isStress) {
                    try {
                        await webpush.sendNotification(userSub.subscription, JSON.stringify({
                            title: 'G-Diary 🧠',
                            body: 'Come ti senti oggi? Registra stress e stanchezza.',
                            icon: '/icon-192.png'
                        }));
                        sentCount++;
                    } catch (e) {
                        if (e.statusCode === 410 || e.statusCode === 404)
                            await supabase.from('push_subscriptions').delete().eq('profile_id', setting.profile_id);
                    }
                }

                if (isStudy) {
                    try {
                        await webpush.sendNotification(userSub.subscription, JSON.stringify({
                            title: 'G-Diary 📚',
                            body: 'È ora di studiare! Controlla i compiti.',
                            icon: '/icon-192.png'
                        }));
                        sentCount++;
                    } catch (e) {
                        if (e.statusCode === 410 || e.statusCode === 404)
                            await supabase.from('push_subscriptions').delete().eq('profile_id', setting.profile_id);
                    }
                }
            }

            return res.json({ success: true, time: timeStr, matching: matching.length, sent: sentCount });

        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // ---- CHECK SUBSCRIPTION HEALTH (GET) ----
    if (action === 'check-sub') {
        const supabase = getSupabase();
        if (!supabase) return res.status(503).json({ error: 'DB not configured' });

        const profileId = req.query.profileId;
        if (!profileId) return res.status(400).json({ error: 'profileId required' });

        try {
            const { data: sub } = await supabase
                .from('push_subscriptions')
                .select('*')
                .eq('profile_id', profileId)
                .single();

            const { data: settings } = await supabase
                .from('notification_settings')
                .select('*')
                .eq('profile_id', profileId)
                .single();

            // Try sending a test push and report the result
            let pushResult = 'not_tested';
            if (sub && sub.subscription) {
                const wp = setupWebPush();
                if (wp) {
                    try {
                        await webpush.sendNotification(sub.subscription,
                            JSON.stringify({ title: 'G-Diary 🔔 Diagnostica', body: 'Se vedi questa notifica, il push funziona!', icon: '/icons/maskable_icon_x192.png' })
                        );
                        pushResult = 'SUCCESS — push accepted by FCM';
                    } catch (pushErr) {
                        pushResult = `FAILED — ${pushErr.statusCode || 'unknown'}: ${pushErr.message}`;
                    }
                }
            }

            const endpoint = sub?.subscription?.endpoint || 'NONE';
            const pushService = endpoint.includes('fcm.googleapis.com') ? 'Chrome/FCM'
                : endpoint.includes('push.services.mozilla.com') ? 'Firefox'
                    : endpoint.includes('web.push.apple.com') ? 'Safari'
                        : endpoint.includes('push.api.sec.samsung.com') ? 'Samsung Internet'
                            : 'Unknown';

            return res.json({
                profileId,
                hasSubscription: !!sub,
                pushService,
                endpoint: endpoint.substring(0, 80) + '...',
                settings: settings || null,
                pushResult,
                serverTime: new Date().toISOString(),
                romeTime: new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' })).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
            });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(404).json({ success: false, error: 'Action not found' });
};
