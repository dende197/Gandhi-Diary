module.exports = async function handler(req, res) {
    // If it's a GET with user_id or part of the URL path
    const urlParts = req.url.split('?')[0].split('/');
    if (req.method === 'GET' || urlParts.length > 3 || req.query.user_id) {
        return require('../api_internal/profile/[user_id]')(req, res);
    }
    return require('../api_internal/profile/index')(req, res);
};
