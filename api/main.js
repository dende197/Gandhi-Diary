module.exports = async function handler(req, res) {
    const action = req.query.action || req.url.split('?')[0].replace('/api/', '');
    
    if (action === 'health') return require('../api_internal/health')(req, res);
    if (action === 'ping') return require('../api_internal/ping')(req, res);
    if (action === 'debug' || action === 'profile-raw') return require('../api_internal/debug/profile-raw')(req, res);
    if (action === 'config') {
        const { handleCors } = require('../lib/helpers');
        if (handleCors(req, res)) return;
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return res.json({
            supabaseUrl: process.env.SUPABASE_URL || '',
            supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
        });
    }
    
    // Fallback default
    return require('../api_internal/ping')(req, res);
};
