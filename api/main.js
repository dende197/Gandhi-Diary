module.exports = async function handler(req, res) {
    const action = req.query.action || req.url.split('?')[0].replace('/api/', '');
    
    if (action === 'health') return require('../api_internal/health')(req, res);
    if (action === 'config') {
        const { handleCors } = require('../lib/helpers');
        if (handleCors(req, res)) return;
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        // Public config endpoint: avoid proxy/browser persistence of env-derived values.
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.json({
            supabaseUrl: process.env.SUPABASE_URL || 'https://mlcutgkfunbpmrnbeznd.supabase.co',
            supabaseAnonKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sY3V0Z2tmdW5icG1ybmJlem5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTg2NDgsImV4cCI6MjA4NDc3NDY0OH0.eWR7PxNsJjSGAM1WoaNseVkeQDpEqaUvO8xvXoDKLQg'
        });
    }
    
    // Fallback default
    return require('../api_internal/health')(req, res);
};
