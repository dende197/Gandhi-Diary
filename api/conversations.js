module.exports = async function handler(req, res) {
    return require('../api_internal/conversations/user/[user_id]')(req, res);
};
