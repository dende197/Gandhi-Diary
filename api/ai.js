module.exports = async function handler(req, res) {
    return require('../api_internal/ai/chat')(req, res);
};
