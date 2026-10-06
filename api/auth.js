module.exports = async function handler(req, res) {
    const action = req.query.action || req.url.split('?')[0].replace('/api/', '');
    if (action === 'methods') return require('../api_internal/auth-methods')(req, res);
    if (action === 'logout') return require('../api_internal/logout')(req, res);
    if (action === 'sync') return require('../api_internal/sync')(req, res);
    if (action === 'resolve-profile') return require('../api_internal/resolve-profile')(req, res);
    if (action === 'refresh-session') return require('../api_internal/refresh-session')(req, res);
    if (action === 'login' || action === 'auth') return require('../api_internal/login')(req, res);
    return res.status(404).json({success:false,error:'Azione sconosciuta'});
};
