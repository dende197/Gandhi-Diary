const { endpoint } = require('../lib/backend');
const { handleCors } = require('../lib/helpers');
const { getAuthMethods } = require('../lib/argo-auth-policy');

module.exports = endpoint(async function (req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    try {
        return res.json({ success: true, ...getAuthMethods() });
    } catch (error) {
        if (error.code !== 'ARGO_AUTH_POLICY_INVALID') throw error;
        return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    }
});
