/**
 * api/clean-calendar.js
 * Manual cleanup tool to remove past homework events from Google Calendar.
 * Call this once to fix mistakes from the initial sync.
 */

const { cleanOldEvents } = require('../lib/googleCalendar');

module.exports = async function handler(req, res) {
    // ============= CORS =============
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // ============= AUTH CHECK =============
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

    try {
        console.log('--- MANUALLY TRIGGERED CALENDAR CLEANUP ---');
        const result = await cleanOldEvents();
        return res.json(result);
    } catch (e) {
        console.error('Cleanup failed:', e.message);
        return res.status(500).json({
            success: false,
            error: e.message
        });
    }
};
