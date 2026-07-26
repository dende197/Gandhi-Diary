module.exports = async function handler(req, res) {
    return require('../../api_internal/watch-summary/[user_id]')(req, res);
};
