module.exports = async function handler(req, res) {
    return require('../../api_internal/class-representative/index')(req, res);
};
