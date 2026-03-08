module.exports = async function handler(req, res) {
    return require('../api_internal/debug/profile-raw')(req, res);
};
