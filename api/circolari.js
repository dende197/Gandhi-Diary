module.exports = async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'index';
    
    if (action === 'sintesi') {
        return require('../api_internal/circolari/sintesi')(req, res);
    }
    return require('../api_internal/circolari/index')(req, res);
};
