const { handleCors } = require('../lib/helpers');

module.exports = function handler(req, res) {
    if (handleCors(req, res)) return;
    res.status(200).json({ pong: true, ts: Date.now() });
}
