module.exports = async function handler(req, res) {
    const action = req.url.split('?')[0].includes('/history') ? 'history' : 'save';
    if (action === 'history') return require('../api_internal/mental-health/history')(req, res);
    return require('../api_internal/mental-health/save')(req, res);
};
