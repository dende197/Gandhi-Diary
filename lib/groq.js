const Groq = require('groq-sdk');

let _groq = null;

function getGroq() {
    if (_groq) return _groq;
    if (!process.env.GROQ_API_KEY) return null;
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return _groq;
}

module.exports = { getGroq };
