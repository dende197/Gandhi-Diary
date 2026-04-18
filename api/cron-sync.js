/**
 * api/cron-sync.js
 * Universal Background Sync — triggered by GitHub Actions (hourly).
 * Loops through all users with Google and Argo credentials and performs sync.
 */

const crypto = require('crypto');
const { google } = require('googleapis');
const { AdvancedArgo, getDashboard, extractHomeworkFromDashboard, extractAssenzeFromDashboard, extractVerificheFromDashboard } = require('../lib/argo');
const { syncTasksToCalendar, syncVerificheToCalendar, syncUnjustifiedAttendanceReminders } = require('../lib/googleCalendar');
const { createHeaders, decryptArgoPassword, debugLog } = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');

const ARGO_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h conservative TTL

// --- Google OAuth2 Setup ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const BEARER_PREFIX = 'Bearer ';
const CRON_SECRET = process.env.CRON_SECRET;
const USER_SYNC_TIMEOUT_MS = Number(process.env.CRON_USER_TIMEOUT_MS || 45000);

function secureEquals(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const leftBuf = Buffer.from(left);
    const rightBuf = Buffer.from(right);
    if (leftBuf.length !== rightBuf.length) return false;
    return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function buildAuthenticatedOAuth2Client(tokenRow) {
    const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
    oauth2.tokenPersistError = null;
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
        } catch (e) {
            oauth2.tokenPersistError = new Error(`[Cron] Refresh save failed for ${tokenRow.user_id}: ${e.message}`);
            console.error(oauth2.tokenPersistError.message);
        }
    });
    return oauth2;
}

function resolveTargetProfile(profiles, rawProfileIndex) {
    const parsedIndex = Number(rawProfileIndex);
    const safeIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;
    const profileByIndexField = profiles.find(p => Number(p.index ?? p.profileIndex) === safeIndex);
    const profileByArrayIndex = safeIndex < profiles.length ? profiles[safeIndex] : null;
    return profileByIndexField || profileByArrayIndex || profiles[0];
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

async function withTimeout(promise, timeoutMs, message) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
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
        return res.status(500).json({ success: false, error: 'Google redirect URI non configurato' });
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
    const results = { total: 0, processed: 0, success: 0, failed: 0, verificheFailures: 0, users: [] };
    const romeHour = getRomeHour(new Date());

    // Skip nighttime hours 20:00–07:59 Rome time (12-hour quiet window).
    // Active window: 08:00–19:59 — cron runs every hour inside this window.
    // Allow forced runs via query param ?force=1 to override this guard.
    const NIGHT_RANGE_START = 20; // First hour to skip (20:xx)
    const NIGHT_RANGE_END   = 7;  // Last hour to skip  (07:xx)
    const forceRun = (req.query?.force === '1' || req.query?.force === 'true');
    const isOutsideActiveHours = romeHour >= NIGHT_RANGE_START || romeHour <= NIGHT_RANGE_END;
    if (!forceRun && isOutsideActiveHours) {
        console.log(`[Cron] Skipping — nighttime hours (Rome ${romeHour}:xx, window 20–07). Use ?force=1 to override.`);
        return res.status(200).json({ success: true, skipped: true, reason: 'nighttime', romeHour });
    }

    const forceAttendanceCheck = (req.query?.forceAttendanceCheck === '1' || req.query?.forceAttendanceCheck === 'true');
    const simulateUnjustified = (req.query?.simulateUnjustified === '1' || req.query?.simulateUnjustified === 'true');
    // Check attendance at 13:00 (after school) and 18:00 (evening fallback, within active window).
    // Two windows ensure reminders are created even if one cron run fails.
    const ATTENDANCE_CHECK_HOURS = [13, 18];
    const shouldCheckAttendance = forceAttendanceCheck || ATTENDANCE_CHECK_HOURS.includes(romeHour);

    try {
        // 1. Fetch all users with Argo credentials
        const { data: users, error } = await supabase
            .from('google_tokens')
            .select('*')
            .not('argo_school_code', 'is', null)
            .not('argo_username', 'is', null)
            .not('argo_password', 'is', null);

        if (error) throw error;
        results.total = (users || []).length;

        for (const user of (users || [])) {
            results.processed++;
            console.log(`[Cron] Processing user: ${user.user_id}`);
            
            try {
                await withTimeout((async () => {
                    // 2. Try cached Argo tokens first, rawLogin as fallback
                    let access_token = null;
                    let authToken = null;
                    let subjectId = null;
                    let headers = null;
                    let dashboardData = null;
                    let usedCache = false;

                    // Attempt 1: cached tokens
                    if (user.argo_access_token && user.argo_auth_token) {
                        const expiry = user.argo_tokens_expiry
                            ? new Date(user.argo_tokens_expiry)
                            : null;
                        if (expiry && expiry > new Date()) {
                            try {
                                headers = createHeaders(user.argo_school_code, user.argo_access_token, user.argo_auth_token);
                                dashboardData = await getDashboard(headers);
                                access_token = user.argo_access_token;
                                authToken = user.argo_auth_token;
                                usedCache = true;
                                debugLog(`[Cron] ✅ Used cached Argo tokens for ${user.user_id}`);
                            } catch (cachedErr) {
                                debugLog(`[Cron] ⚠️ Cached tokens failed for ${user.user_id}, falling back to rawLogin`, cachedErr.message);
                                dashboardData = null;
                            }
                        }
                    }

                    // Attempt 2: full rawLogin
                    if (!dashboardData) {
                        const argoPassword = decryptArgoPassword(user.argo_password);
                        if (!argoPassword) throw new Error('Failed to decrypt Argo password');
                        const loginRes = await AdvancedArgo.rawLogin(
                            user.argo_school_code,
                            user.argo_username,
                            argoPassword
                        );
                        access_token = loginRes.access_token;
                        const profiles = loginRes.profiles || [];
                        if (!profiles || profiles.length === 0) throw new Error('Nessun profilo Argo');

                        const targetProfile = resolveTargetProfile(profiles, user.profile_index);
                        authToken = targetProfile?.token;
                        subjectId = targetProfile?.idSoggetto;
                        if (!authToken) throw new Error('Token profilo Argo non disponibile');
                        headers = createHeaders(user.argo_school_code, access_token, authToken, subjectId);

                        // 3. Fetch dashboard with fresh tokens
                        dashboardData = await getDashboard(headers);

                        // Persist fresh tokens to Supabase
                        try {
                            const expiry = new Date(Date.now() + ARGO_TOKEN_TTL_MS).toISOString();
                            await supabase.from('google_tokens').update({
                                argo_access_token: access_token,
                                argo_auth_token: authToken,
                                argo_tokens_expiry: expiry,
                                updated_at: new Date().toISOString()
                            }).eq('user_id', user.user_id);
                            debugLog(`[Cron] ✅ Persisted fresh Argo tokens for ${user.user_id}`);
                        } catch (persistErr) {
                            console.warn(`[Cron] ⚠️ Token persist failed for ${user.user_id}:`, persistErr.message);
                        }
                    }
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
                        // 4. Sync homework to Google Calendar (use per-user class schedule if stored)
                        taskSync = await syncTasksToCalendar(tasks, user.calendar_id || 'primary', auth, classSchedule);
                        if (!taskSync.success) throw new Error((taskSync.errors || []).join(', '));
                    }

                    // 5. Extract and sync upcoming tests (verifiche) to Google Calendar
                    const verifiche = extractVerificheFromDashboard(dashboardData);
                    let verificheSync = { success: true, added: 0, skipped: 0, filtered: 0, errors: [] };
                    if (verifiche.length > 0) {
                        verificheSync = await syncVerificheToCalendar(verifiche, user.calendar_id || 'primary', auth);
                        if (!verificheSync.success) {
                            // Non-fatal: log and track but do not abort the user sync
                            console.warn(`[Cron] ⚠️ Verifiche sync partial failure for ${user.user_id}:`, verificheSync.errors);
                            results.verificheFailures++;
                        }
                    }

                    let attendanceSync = null;
                    if (shouldCheckAttendance) {
                        attendanceSync = await syncUnjustifiedAttendanceReminders(
                            assenzeData,
                            user.calendar_id || 'primary',
                            auth
                        );
                        if (!attendanceSync.success) throw new Error((attendanceSync.errors || []).join(', '));
                    }
                    if (auth.tokenPersistError) throw auth.tokenPersistError;

                    // Track last successful sync timestamp for connection status
                    try {
                        await supabase.from('google_tokens').update({
                            last_argo_sync: new Date().toISOString()
                        }).eq('user_id', user.user_id);
                    } catch (syncTsErr) {
                        console.warn(`[Cron] ⚠️ last_argo_sync update failed for ${user.user_id}:`, syncTsErr.message);
                    }

                    results.success++;
                    results.users.push({
                        id: user.user_id,
                        tasksAdded: taskSync.added || 0,
                        tasksSkipped: taskSync.skipped || 0,
                        verificheAdded: verificheSync.added || 0,
                        verificheSkipped: verificheSync.skipped || 0,
                        attendancePending: attendanceSync?.pending || 0,
                        remindersScheduled: attendanceSync?.scheduled || 0,
                        remindersUpdated: attendanceSync?.updated || 0
                    });
                })(), USER_SYNC_TIMEOUT_MS, `User sync timeout after ${USER_SYNC_TIMEOUT_MS}ms`);

            } catch (err) {
                console.error(`[Cron] Failed for ${user.user_id}:`, err.message);
                results.failed++;
                results.users.push({ id: user.user_id, error: err.message });
            }
        }

        const duration = (Date.now() - startTime) / 1000;
        const allFailed = results.failed > 0 && results.success === 0;
        const partialFailure = results.failed > 0 && results.success > 0;
        const statusCode = allFailed ? 500 : (partialFailure ? 207 : 200);
        console.log(`[Cron] Universal Sync Finished in ${duration}s. Success: ${results.success}/${results.total}. Failed: ${results.failed}`);

        return res.status(statusCode).json({
            success: results.failed === 0,
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
