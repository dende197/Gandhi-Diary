/**
 * api/remove-duplicates.js
 * Manual trigger for removing duplicate homework events in Google Calendar.
 */

const { removeDuplicates } = require('../lib/googleCalendar');
const { createHeaders } = require('../lib/helpers');

module.exports = async function handler(req, res) {
    // ============= CORS & HEADERS =============
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // ============= AUTH =============
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    // Authorization: Bearer <CRON_SECRET>
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        console.log('--- REMOVE DUPLICATES TRIGGERED ---');
        const start = Date.now();

        const result = await removeDuplicates();

        const duration = Date.now() - start;
        console.log(`--- REMOVE DUPLICATES FINISHED (${duration}ms) ---`, result);

        return res.status(200).json({
            ...result,
            duration_ms: duration
        });

    } catch (e) {
        console.error('API /api/remove-duplicates error:', e.message);
        return res.status(500).json({
            success: false,
            error: e.message
        });
    }
};
