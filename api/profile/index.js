module.exports = async function handler(req, res) {
    return require('../../api_internal/profile/index')(req, res);
};
