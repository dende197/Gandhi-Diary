module.exports = async function handler(req, res) {
    const action = req.query.action || req.url.split('?')[0].replace('/api/', '');
    
    if (action === 'health') return require('../api_internal/health')(req, res);
    if (action === 'ping') return require('../api_internal/ping')(req, res);
    if (action === 'debug' || action === 'profile-raw') return require('../api_internal/debug/profile-raw')(req, res);
    
    // Fallback default
    return require('../api_internal/ping')(req, res);
};
