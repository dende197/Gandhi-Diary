module.exports = async function handler(req, res) {
    return require('../api_internal/upload_logic')(req, res);
};
