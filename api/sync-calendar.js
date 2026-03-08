/**
 * api/sync-calendar.js
 * Vercel Cron Job handler — syncs Argo homework to Google Calendar.
 * 
 * Runs at 14:00 and 00:00 via Vercel Cron.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */

const { AdvancedArgo, getDashboard, extractHomeworkFromDashboard } = require('../lib/argo');
const { syncTasksToCalendar, testConnection, removeDuplicates } = require('../lib/googleCalendar');
const { createHeaders } = require('../lib/helpers');

module.exports = async function handler(req, res) {
    // ============= CORS =============
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // ============= AUTH CHECK =============
    // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;

    if (cronSecret) {
        if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
            return res.status(401).json({
                success: false,
                error: 'Non autorizzato. CRON_SECRET non valido.'
            });
        }
    }

    // ============= ACTION CHECK =============
    const action = req.query.action || 'sync';

    if (action === 'status') {
        try {
            const status = await testConnection();
            return res.json(status);
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // ============= GET ARGO CREDENTIALS =============
    const schoolCode = process.env.ARGO_SCHOOL_CODE;
    const argoUser = process.env.ARGO_USERNAME;
    const argoPass = process.env.ARGO_PASSWORD;

    if (!schoolCode || !argoUser || !argoPass) {
        return res.status(500).json({
            success: false,
            error: 'Credenziali Argo mancanti (ARGO_SCHOOL_CODE, ARGO_USERNAME, ARGO_PASSWORD)'
        });
    }

    // ============= CHECK GOOGLE CALENDAR CONFIG =============
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_CALENDAR_ID) {
        return res.status(500).json({
            success: false,
            error: 'Configurazione Google Calendar mancante (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_CALENDAR_ID)'
        });
    }

    const startTime = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📅 CALENDAR SYNC START — ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}`);

    try {
        // 1. Login to Argo
        console.log('🔐 Login Argo in corso...');
        const loginRes = await AdvancedArgo.rawLogin(schoolCode, argoUser, argoPass);
        const { access_token: accessToken, profiles } = loginRes;

        if (!profiles || profiles.length === 0) {
            throw new Error('Nessun profilo Argo trovato');
        }

        const authToken = profiles[0].token;
        const subjectId = profiles[0].idSoggetto;

        console.log(`✅ Login OK — Profilo: ${profiles[0].name || 'N/D'}`);

        // 2. Fetch Dashboard & Extract Homework
        console.log('📚 Scaricamento compiti dal registro...');
        const headers = createHeaders(schoolCode, accessToken, authToken, subjectId);
        const dashboardData = await getDashboard(headers);
        const tasks = extractHomeworkFromDashboard(dashboardData);

        console.log(`📋 Trovati ${tasks.length} compiti nel registro`);

        if (tasks.length === 0) {
            console.log('ℹ️ Nessun compito trovato. Sync completato.');
            return res.json({
                success: true,
                added: 0,
                skipped: 0,
                errors: [],
                message: 'Nessun compito trovato nel registro',
                duration_ms: Date.now() - startTime
            });
        }

        // 3. Sync to Google Calendar
        console.log('📅 Sincronizzazione con Google Calendar...');
        const result = await syncTasksToCalendar(tasks);

        const duration = Date.now() - startTime;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📅 CALENDAR SYNC COMPLETATO in ${duration}ms`);
        console.log(`   ✅ Aggiunti: ${result.added}`);
        console.log(`   ⏭️  Skippati: ${result.skipped}`);
        console.log(`   ✂️  Filtrati (past): ${result.filtered || 0}`);
        console.log(`   ❌ Errori: ${result.errors.length}`);
        console.log(`${'='.repeat(60)}\n`);

        return res.json({
            ...result,
            duration_ms: duration,
            total_tasks_found: tasks.length,
            scanned_future_titles: (result.added > 0 || result.skipped > 0) ? tasks.map(t => `${t.due_date}: ${t.materia} - ${t.text.substring(0, 30)}...`) : []
        });

    } catch (e) {
        console.error('❌ CALENDAR SYNC FAILED:', e.message);
        return res.status(500).json({
            success: false,
            error: e.message,
            duration_ms: Date.now() - startTime
        });
    }
};
