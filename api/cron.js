const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

module.exports = async function handler(req, res) {
    // Security: Only allow GET (Vercel Cron) or POST with a secret
    if (req.method === 'OPTIONS') return res.status(200).end();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(503).json({ success: false, error: 'Database non configurato' });
    }
    if (!vapidPublic || !vapidPrivate) {
        return res.status(503).json({ success: false, error: 'VAPID keys non configurate' });
    }

    webpush.setVapidDetails('mailto:info@gdiary.app', vapidPublic, vapidPrivate);
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current time in HH:mm format (Italian timezone)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const timeStr = formatter.format(now);

    console.log(`[CRON] Checking notifications for time: ${timeStr}`);

    try {
        // Find users who have a notification scheduled for RIGHT NOW
        const { data: settings, error: settingsError } = await supabase
            .from('notification_settings')
            .select('*');

        if (settingsError) {
            console.error('[CRON] Settings query error:', settingsError.message);
            return res.status(500).json({ success: false, error: settingsError.message });
        }

        if (!settings || settings.length === 0) {
            return res.json({ success: true, message: 'No notification settings found', time: timeStr, sent: 0 });
        }

        // Filter users who need a notification at this exact time
        const matchingUsers = settings.filter(s =>
            (s.stress_enabled && s.stress_time === timeStr) ||
            (s.study_enabled && s.study_time === timeStr)
        );

        if (matchingUsers.length === 0) {
            return res.json({ success: true, message: 'No notifications due at this time', time: timeStr, sent: 0 });
        }

        const profileIds = matchingUsers.map(s => s.profile_id);
        const { data: subs, error: subsError } = await supabase
            .from('push_subscriptions')
            .select('*')
            .in('profile_id', profileIds);

        if (subsError || !subs || subs.length === 0) {
            return res.json({ success: true, message: 'No push subscriptions for matching users', time: timeStr, sent: 0 });
        }

        let sent = 0;
        let failed = 0;

        for (const setting of matchingUsers) {
            const userSub = subs.find(s => s.profile_id === setting.profile_id);
            if (!userSub || !userSub.subscription) continue;

            const isStressTime = setting.stress_enabled && setting.stress_time === timeStr;
            const isStudyTime = setting.study_enabled && setting.study_time === timeStr;

            // Send stress notification
            if (isStressTime) {
                const payload = JSON.stringify({
                    title: 'G-Diary 🧠',
                    body: 'Ehi! Come ti senti oggi? Registra stress e stanchezza nel Check-in.',
                    icon: '/icon-192.png'
                });
                try {
                    await webpush.sendNotification(userSub.subscription, payload);
                    sent++;
                } catch (e) {
                    failed++;
                    console.error(`[CRON] Push failed for ${setting.profile_id}:`, e.statusCode, e.message);
                    if (e.statusCode === 410 || e.statusCode === 404) {
                        await supabase.from('push_subscriptions').delete().eq('profile_id', setting.profile_id);
                    }
                }
            }

            // Send study notification (only if it's a different time from stress)
            if (isStudyTime && !(isStressTime && setting.stress_time === setting.study_time)) {
                const payload = JSON.stringify({
                    title: 'G-Diary 📚',
                    body: 'È ora di studiare! Controlla i compiti per domani.',
                    icon: '/icon-192.png'
                });
                try {
                    await webpush.sendNotification(userSub.subscription, payload);
                    sent++;
                } catch (e) {
                    failed++;
                    console.error(`[CRON] Push failed for ${setting.profile_id}:`, e.statusCode, e.message);
                    if (e.statusCode === 410 || e.statusCode === 404) {
                        await supabase.from('push_subscriptions').delete().eq('profile_id', setting.profile_id);
                    }
                }
            }
        }

        return res.json({
            success: true,
            time: timeStr,
            matchingUsers: matchingUsers.length,
            subscriptions: subs.length,
            sent,
            failed
        });

    } catch (e) {
        console.error('[CRON] Fatal error:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
