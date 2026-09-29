const { handleCors, getRequestBody, verifySessionToken, normalizeUserId } = require('../lib/helpers');
const { revokeSession } = require('../lib/auth');
module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const body = getRequestBody(req),
        id = normalizeUserId(body.userId);
    if (!(await verifySessionToken(req, id, 14)))
        return res.status(403).json({ success: false, error: 'Non autorizzato' });
    await revokeSession(req, id, body.allDevices === true);
    return res.json({ success: true });
};

module.exports = require('../lib/backend').endpoint(module.exports);
