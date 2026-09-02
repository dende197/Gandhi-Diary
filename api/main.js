module.exports = async function handler(req, res) {
    const action = req.query.action || req.url.split('?')[0].replace('/api/', '');
    
    if (action === 'health') return require('../api_internal/health')(req, res);
    if (action === 'config') {
        const { handleCors } = require('../lib/helpers');
        if (handleCors(req, res)) return;
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnonKey) {
            return res.status(500).json({ error: 'Server configuration incomplete: SUPABASE_URL and SUPABASE_ANON_KEY must be set.' });
        }
        // Public config endpoint: avoid proxy/browser persistence of env-derived values.
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.json({ supabaseUrl, supabaseAnonKey });
    }
    
    // Fallback default
    return require('../api_internal/health')(req, res);
};
