module.exports = async function handler(req, res) {
    return require('../api_internal/planner/[user_id]')(req, res);
};
