module.exports = async function handler(req, res) {
    const action = req.query.action || req.url.split('?')[0].replace('/api/', '');
    if (action === 'health') {
        return require('./health')(req, res);
    }
    return require('./ping')(req, res);
};
