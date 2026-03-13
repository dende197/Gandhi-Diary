module.exports = async function handler(req, res) {
    const action = req.query.action || (req.url.split('?')[0].includes('/history') ? 'history' : 'save');
    
    if (action === 'history') return require('../api_internal/mental-health/history')(req, res);
    if (action === 'ai-advice') return require('../api_internal/mental-health/ai-advice')(req, res);
    
    return require('../api_internal/mental-health/save')(req, res);
};
