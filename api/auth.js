module.exports = async function handler(req, res) {
    const action = req.query.action || req.url.split('?')[0].replace('/api/', '');
    if (action === 'sync') return require('../api_internal/sync')(req, res);
    if (action === 'resolve-profile') return require('../api_internal/resolve-profile')(req, res);
    if (action === 'refresh-session') return require('../api_internal/refresh-session')(req, res);
    return require('../api_internal/login')(req, res);
};
