module.exports = async function handler(req, res) {
    const action = req.query.action || '';

    if (action === 'subscribe') {
        return require('../api_internal/notifications/subscribe')(req, res);
    }
    if (action === 'settings') {
        return require('../api_internal/notifications/settings')(req, res);
    }

    return res.status(404).json({ success: false, error: 'Action not found' });
};
