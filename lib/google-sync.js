const { google } = require('googleapis');
const { database, checked, withLease, httpError, signal } = require('./backend');
const { loadArgoDashboard } = require('./argo-session');
const {
    extractHomeworkFromDashboard,
    extractAssenzeFromDashboard,
    extractVerificheFromDashboard,
} = require('./argo');
const {
    syncTasksToCalendar,
    syncVerificheToCalendar,
    syncUnjustifiedAttendanceReminders,
} = require('./googleCalendar');
function oauthClient() {
    return new google.auth.OAuth2({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri:
            process.env.GOOGLE_REDIRECT_URI ||
            'https://g-connect-backend-r5j1.vercel.app/api/google?action=callback',
        transporterOptions: { timeout: 15000, signal: signal(), retry: false },
    });
}
async function saveGoogleTokens(userId, tokens) {
    const update = { updated_at: new Date().toISOString() };
    for (const k of ['access_token', 'refresh_token', 'expiry_date'])
        if (tokens[k] != null) update[k] = tokens[k];
    const rows = await checked(
        database().from('google_tokens').update(update).eq('user_id', userId).select('user_id'),
    );
    if (!rows?.length) throw httpError(409, 'Profilo Argo non disponibile. Effettua nuovamente il login.');
}
async function syncGoogleUser(userId, options = {}) {
    return withLease(`google:${userId}`, async () => {
        const db = database();
        const row = await checked(db.from('google_tokens').select('*').eq('user_id', userId).maybeSingle());
        if (!row?.refresh_token) throw httpError(404, 'Account Google non collegato');
        const { dashboard } = await loadArgoDashboard(userId);
        const auth = oauthClient();
        auth.setCredentials({
            access_token: row.access_token,
            refresh_token: row.refresh_token,
            expiry_date: row.expiry_date,
        });
        // EventEmitter does not await async listeners. Collect refresh data, then
        // persist once, explicitly awaited before reporting success.
        const refreshed = {};
        auth.on('tokens', (tokens) => Object.assign(refreshed, tokens));
        const calendarId = row.calendar_id || 'primary';
        const schedule = options.classSchedule || row.class_schedule;
        if (options.classSchedule)
            await checked(
                db.from('google_tokens').update({ class_schedule: schedule }).eq('user_id', userId),
            );
        try {
            // Argo can truncate its dashboard. Absence from a partial response is
            // not evidence that a task was deleted. Reconcile removals only when
            // the upstream response explicitly certifies completeness.
            const authoritative = dashboard.complete === true || dashboard.data?.complete === true;
            const tasks = extractHomeworkFromDashboard(dashboard);
            const verifiche = extractVerificheFromDashboard(dashboard);
            const taskResult = await syncTasksToCalendar(tasks, calendarId, auth, schedule, {
                authoritative,
            });
            signal()?.throwIfAborted();
            const testResult = await syncVerificheToCalendar(verifiche, calendarId, auth, { authoritative });
            signal()?.throwIfAborted();
            const attendance = await syncUnjustifiedAttendanceReminders(
                extractAssenzeFromDashboard(dashboard, { schedule }),
                calendarId,
                auth,
            );
            const errors = [...taskResult.errors, ...testResult.errors, ...attendance.errors];
            const success = taskResult.success && testResult.success && attendance.success;
            if (success)
                await checked(
                    db
                        .from('google_tokens')
                        .update({ last_google_sync: new Date().toISOString() })
                        .eq('user_id', userId),
                );
            return {
                success,
                errors,
                total_tasks: tasks.length,
                tasks_added: taskResult.added,
                tasks_skipped: taskResult.skipped,
                tasks_updated: taskResult.updated,
                tasks_deleted: taskResult.deleted,
                verifiche_added: testResult.added,
                verifiche_skipped: testResult.skipped,
                verifiche_updated: testResult.updated,
                verifiche_deleted: testResult.deleted,
                attendance_pending: attendance.pending,
                attendance_deleted: attendance.deleted,
                usedScheduleFallback: taskResult.usedScheduleFallback,
            };
        } finally {
            if (Object.keys(refreshed).length) await saveGoogleTokens(userId, refreshed);
        }
    });
}
module.exports = { oauthClient, saveGoogleTokens, syncGoogleUser };
