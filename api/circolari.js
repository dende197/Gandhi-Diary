module.exports = async function handler(req, res) {
    const action = req.url.split('?')[0].includes('/sintesi') ? 'sintesi' : 'index';
    if (action === 'sintesi') return require('../api_internal/circolari/sintesi')(req, res);
    return require('../api_internal/circolari/index')(req, res);
};
