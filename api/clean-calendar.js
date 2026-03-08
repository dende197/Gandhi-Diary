/**
 * api/clean-calendar.js
 * Comprehensive cleanup for Google Calendar events.
 * 1. Removes past events (pre-today).
 * 2. Removes duplicates from future events.
 */

const { cleanOldEvents, removeDuplicates } = require('../lib/googleCalendar');

module.exports = async function handler(req, res) {
    // ============= CORS =============
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // ============= AUTH =============
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;

    if (cronSecret && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        console.log('--- COMPREHENSIVE CLEANUP START ---');
        const start = Date.now();

        // 1. Clean past events
        const past = await cleanOldEvents();

        // 2. Remove duplicates from future events
        const dupes = await removeDuplicates();

        const duration = Date.now() - start;
        console.log(`--- COMPREHENSIVE CLEANUP FINISHED (${duration}ms) ---`);

        return res.json({
            success: true,
            past_events: past,
            future_duplicates: dupes,
            duration_ms: duration
        });

    } catch (e) {
        console.error('Cleanup error:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
