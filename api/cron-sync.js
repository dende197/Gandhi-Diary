/**
 * api/cron-sync.js
 * Universal Background Sync — triggered by GitHub Actions (hourly).
 * Loops through all users with Google and Argo credentials and performs sync.
 */

const crypto = require('crypto');
const { google } = require('googleapis');
const { AdvancedArgo, getDashboard, extractHomeworkFromDashboard, extractAssenzeFromDashboard } = require('../lib/argo');
const { syncTasksToCalendar, syncUnjustifiedAttendanceReminders } = require('../lib/googleCalendar');
const { createHeaders, decryptArgoPassword } = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');

// --- Google OAuth2 Setup ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const BEARER_PREFIX = 'Bearer ';
const CRON_SECRET = process.env.CRON_SECRET;

function secureEquals(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const leftBuf = Buffer.from(left);
    const rightBuf = Buffer.from(right);
    if (leftBuf.length !== rightBuf.length) return false;
    return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function buildAuthenticatedOAuth2Client(tokenRow) {
    const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
    oauth2.setCredentials({
        access_token: tokenRow.access_token,
        refresh_token: tokenRow.refresh_token,
        expiry_date: tokenRow.expiry_date
    });
    // Auto-refresh: update database when token refreshes
    oauth2.on('tokens', async (newTokens) => {
        try {
            const update = { access_token: newTokens.access_token, updated_at: new Date().toISOString() };
            if (newTokens.expiry_date) update.expiry_date = newTokens.expiry_date;
            if (newTokens.refresh_token) update.refresh_token = newTokens.refresh_token;
            await getSupabase().from('google_tokens').update(update).eq('user_id', tokenRow.user_id);
        } catch (e) { console.error(`[Cron] Refresh save failed for ${tokenRow.user_id}:`, e.message); }
    });
    return oauth2;
}

function parseStoredSchedule(scheduleRaw, userId) {
    if (!scheduleRaw) return null;
    if (typeof scheduleRaw !== 'string') return scheduleRaw;
    try {
        return JSON.parse(scheduleRaw);
    } catch (e) {
        console.warn('[Cron] Invalid stored class_schedule - using default schedule', {
            userId,
            reason: e.message
        });
        return null;
    }
}

function getRomeHour(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Rome',
        hour: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const hourPart = parts.find(p => p.type === 'hour')?.value || '0';
    return Number(hourPart);
}

function getTodayRomeISODate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => parts.find(p => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

// ============= HANDLER =============
module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ success: false, error: 'Supabase non configurato' });
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ success: false, error: 'Google OAuth non configurato' });
    }
    if (!REDIRECT_URI) {
        return res.status(500).json({ success: false, error: 'GOOGLE_REDIRECT_URI non configurato' });
    }
    if (!CRON_SECRET) {
        return res.status(500).json({ success: false, error: 'CRON_SECRET non configurato' });
    }

    // Protection: CRON_SECRET must be configured and must match the request secret.
    // Support both Vercel Authorization Bearer and legacy x-vercel-cron-secret header.
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith(BEARER_PREFIX) ? authHeader.slice(BEARER_PREFIX.length).trim() : '';
    const cronSecret = bearerToken || req.headers['x-vercel-cron-secret'];
    if (!secureEquals(cronSecret, CRON_SECRET)) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    console.log('[Cron] Starting Universal Sync...');
    const startTime = Date.now();
    const results = { total: 0, processed: 0, success: 0, failed: 0, users: [] };
    const romeHour = getRomeHour(new Date());
    const forceAttendanceCheck = (req.query?.forceAttendanceCheck === '1' || req.query?.forceAttendanceCheck === 'true');
    const simulateUnjustified = (req.query?.simulateUnjustified === '1' || req.query?.simulateUnjustified === 'true');
    const shouldCheckAttendance = forceAttendanceCheck || romeHour === 13;

    try {
        // 1. Fetch all users with Argo credentials
        const { data: users, error } = await supabase
            .from('google_tokens')
            .select('*')
            .not('argo_username', 'is', null)
            .not('argo_password', 'is', null);

        if (error) throw error;
        results.total = (users || []).length;

        for (const user of (users || [])) {
            results.processed++;
            console.log(`[Cron] Processing user: ${user.user_id}`);
            
            try {
                // 2. Login to Argo
                const argoPassword = decryptArgoPassword(user.argo_password);
                if (!argoPassword) throw new Error('Failed to decrypt Argo password');
                const loginRes = await AdvancedArgo.rawLogin(
                    user.argo_school_code,
                    user.argo_username,
                    argoPassword
                );
                const { access_token, profiles } = loginRes;
                if (!profiles || profiles.length === 0) throw new Error('Nessun profilo Argo');
                
                const authToken = profiles[0].token;
                const subjectId = profiles[0].idSoggetto;
                const headers = createHeaders(user.argo_school_code, access_token, authToken, subjectId);
                
                // 3. Fetch Tasks
                const dashboardData = await getDashboard(headers);
                const tasks = extractHomeworkFromDashboard(dashboardData);
                let assenzeData = shouldCheckAttendance ? extractAssenzeFromDashboard(dashboardData) : null;
                if (shouldCheckAttendance && simulateUnjustified && (assenzeData?.daGiustificare || 0) === 0) {
                    assenzeData = {
                        ...(assenzeData || {}),
                        assenze: [
                            ...(assenzeData?.assenze || []),
                            {
                                id: `simulated-unjustified-absence-${crypto.randomUUID()}`,
                                data: getTodayRomeISODate(),
                                tipo: 'assenza',
                                giustificata: false,
                                daGiustificare: true,
                                nota: 'SIMULAZIONE TEST PROMEMORIA'
                            }
                        ],
                        daGiustificare: 1
                    };
                }
                
                const auth = buildAuthenticatedOAuth2Client(user);
                const classSchedule = parseStoredSchedule(user.class_schedule, user.user_id);
                let taskSync = { success: true, added: 0, skipped: 0, errors: [] };
                if (tasks.length > 0) {
                    // 4. Sync to Google Calendar (use per-user class schedule if stored)
                    taskSync = await syncTasksToCalendar(tasks, user.calendar_id || 'primary', auth, classSchedule);
                    if (!taskSync.success) throw new Error(taskSync.errors.join(', '));
                }

                let attendanceSync = null;
                if (shouldCheckAttendance) {
                    attendanceSync = await syncUnjustifiedAttendanceReminders(
                        assenzeData,
                        user.calendar_id || 'primary',
                        auth
                    );
                    if (!attendanceSync.success) throw new Error(attendanceSync.errors.join(', '));
                }

                results.success++;
                results.users.push({
                    id: user.user_id,
                    added: taskSync.added || 0,
                    skipped: taskSync.skipped || 0,
                    attendancePending: attendanceSync?.pending || 0,
                    remindersScheduled: attendanceSync?.scheduled || 0,
                    remindersUpdated: attendanceSync?.updated || 0
                });

            } catch (err) {
                console.error(`[Cron] Failed for ${user.user_id}:`, err.message);
                results.failed++;
                results.users.push({ id: user.user_id, error: err.message });
            }
        }

        const duration = (Date.now() - startTime) / 1000;
        const hasFailures = results.failed > 0;
        console.log(`[Cron] Universal Sync Finished in ${duration}s. Success: ${results.success}/${results.total}. Failed: ${results.failed}`);

        return res.status(hasFailures ? 500 : 200).json({
            success: !hasFailures,
            duration: `${duration}s`,
            shouldCheckAttendance,
            romeHour,
            simulateUnjustified,
            results
        });

    } catch (e) {
        console.error('[Cron] Universal Sync CRASHED:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
