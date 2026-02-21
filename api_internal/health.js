const { handleCors, DEBUG_MODE } = require('../lib/helpers');

module.exports = function handler(req, res) {
    if (handleCors(req, res)) return;
    res.status(200).json({
        status: 'ok',
        debug: DEBUG_MODE,
        ts: new Date().toISOString()
    });
}
