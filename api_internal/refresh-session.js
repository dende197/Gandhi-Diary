const { handleCors, getRequestBody, normalizeUserId, verifySessionToken } = require('../lib/helpers');
const { loadArgoDashboard } = require('../lib/argo-session');
const { database, checked } = require('../lib/backend');
module.exports = async function (req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const userId = normalizeUserId(getRequestBody(req).userId);
    if (!userId || !(await verifySessionToken(req, userId, 14)))
        return res.status(403).json({ success: false, error: 'Non autorizzato' });
    const { row } = await loadArgoDashboard(userId);
    const student = await checked(database().from('profiles').select('*').eq('id', userId).maybeSingle());
    // Keep the per-device refresh credential, extending only its access validity.
    // Its absolute 14-day lifetime cannot be extended by repeatedly refreshing it.
    const crypto = require('crypto');
    await checked(
        database()
            .from('app_sessions')
            .update({ expires_at: new Date(Date.now() + 86400000).toISOString() })
            .eq(
                'token_hash',
                crypto.createHash('sha256').update(req.headers['x-session-token']).digest('hex'),
            )
            .eq('user_id', userId),
    );
    return res.json({
        success: true,
        sessionToken: req.headers['x-session-token'],
        student: student || { id: userId },
        session: {
            schoolCode: row.argo_school_code,
            userName: row.argo_username,
            profileIndex: row.profile_index,
            idSoggetto: row.argo_id_soggetto,
            accessToken: row.argo_access_token,
            authToken: row.argo_auth_token,
        },
    });
};

module.exports = require('../lib/backend').endpoint(module.exports);
