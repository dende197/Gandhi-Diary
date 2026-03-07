module.exports = async function handler(req, res) {
    return require('../api_internal/calendar/index')(req, res);
};
