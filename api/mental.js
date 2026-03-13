module.exports = async function handler(req, res) {
    const action = req.query.action || (req.url.split('?')[0].includes('/history') ? 'history' : 'save');
    const url = req.url.split('?')[0];

    // Mental Health Actions
    if (action === 'history' || url.includes('/history')) return require('../api_internal/mental-health/history')(req, res);
    if (action === 'ai-advice' || url.includes('/ai-advice')) return require('../api_internal/mental-health/ai-advice')(req, res);
    
    // AI Chat Actions
    if (action === 'chat' || url.includes('/chat')) return require('../api_internal/ai/chat')(req, res);

    // Save is default for mental health
    return require('../api_internal/mental-health/save')(req, res);
};
