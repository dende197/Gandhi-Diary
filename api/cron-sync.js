/**
 * api/cron-sync.js
 * Universal Background Sync — triggered by GitHub Actions (hourly).
 * Loops through all users with Google and Argo credentials and performs sync.
 */

const { google } = require('googleapis');
const { AdvancedArgo, getDashboard, extractHomeworkFromDashboard } = require('../lib/argo');
const { syncTasksToCalendar } = require('../lib/googleCalendar');
const { createHeaders, decryptArgoPassword } = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');

// --- Google OAuth2 Setup ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://g-connect-backend-r5j1.vercel.app/api/google?action=callback';
const BEARER_PREFIX = 'Bearer ';

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

    // Protection: CRON_SECRET must be configured and must match the request secret.
    // Support both Vercel Authorization Bearer and legacy x-vercel-cron-secret header.
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith(BEARER_PREFIX) ? authHeader.slice(BEARER_PREFIX.length).trim() : '';
    const cronSecret = bearerToken || req.headers['x-vercel-cron-secret'] || req.query.secret;
    if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    console.log('[Cron] Starting Universal Sync...');
    const startTime = Date.now();
    const results = { total: 0, processed: 0, success: 0, failed: 0, users: [] };

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
                
                if (tasks.length > 0) {
                    // 4. Sync to Google Calendar (use per-user class schedule if stored)
                    const auth = buildAuthenticatedOAuth2Client(user);
                    const syncRes = await syncTasksToCalendar(tasks, user.calendar_id || 'primary', auth, user.class_schedule || null);
                    if (syncRes.success) {
                        results.success++;
                        results.users.push({ id: user.user_id, added: syncRes.added, skipped: syncRes.skipped });
                    } else {
                        throw new Error(syncRes.errors.join(', '));
                    }
                } else {
                    results.success++; // Nothing to sync is a success
                }

            } catch (err) {
                console.error(`[Cron] Failed for ${user.user_id}:`, err.message);
                results.failed++;
                results.users.push({ id: user.user_id, error: err.message });
            }
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`[Cron] Universal Sync Finished in ${duration}s. Success: ${results.success}/${results.total}`);

        return res.json({
            success: true,
            duration: `${duration}s`,
            results
        });

    } catch (e) {
        console.error('[Cron] Universal Sync CRASHED:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
