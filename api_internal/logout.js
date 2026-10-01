const { handleCors, getRequestBody, verifySessionToken, normalizeUserId } = require('../lib/helpers');
const { revokeSession } = require('../lib/auth');
module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const body = getRequestBody(req),
        id = normalizeUserId(body.userId);
    if (!(await verifySessionToken(req, id, 14)))
        return res.status(403).json({ success: false, error: 'Non autorizzato' });
    const push = require('../lib/web-push');
    if (push.config()) {
        const { database, checked } = require('../lib/backend');
        let devices = database().from('web_push_devices').delete().eq('user_id', id);
        if (body.allDevices !== true) devices = devices.eq('session_hash', push.digest(req.headers['x-session-token']));
        await checked(devices);
    }
    await revokeSession(req, id, body.allDevices === true);
    return res.json({ success: true });
};

module.exports = require('../lib/backend').endpoint(module.exports);
