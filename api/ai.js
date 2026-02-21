module.exports = async function handler(req, res) {
    const action = req.url.split('?')[0].includes('/ai-advice') ? 'ai-advice' : 'chat';
    if (action === 'ai-advice') return require('../api_internal/mental-health/ai-advice')(req, res);
    return require('../api_internal/ai/chat')(req, res);
};
