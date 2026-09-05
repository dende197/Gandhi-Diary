const axios = require('axios');

/**
 * Helper module for Google Gemini Generative Language API.
 * Restores the original Gemini engine used for circular summaries and AI chat.
 */

function getGeminiApiKey() {
    return (
        process.env.GEMINI_API_KEY_SINTESI ||
        process.env.GEMINI_API_KEY ||
        process.env.GEMINI_API_KEY_PLANNER ||
        ''
    ).trim();
}

function hasGeminiKey() {
    return !!getGeminiApiKey();
}

const FALLBACK_MODELS = [
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-flash-latest'
];

/**
 * Sends a generation request to Google Gemini API.
 * @param {Object} opts
 * @param {string} [opts.prompt] - Single text prompt
 * @param {Array} [opts.messages] - Gemini format messages array [{ parts: [{ text }] }]
 * @param {number} [opts.temperature=0.4]
 * @param {number} [opts.maxTokens=1024]
 * @param {string} [opts.preferredModel]
 * @returns {Promise<{ success: boolean, text?: string, error?: string, status?: number, model?: string }>}
 */
async function generateWithGemini({
    prompt,
    messages,
    temperature = 0.4,
    maxTokens = 1024,
    preferredModel
} = {}) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        return { success: false, error: 'GEMINI_API_KEY non configurata', status: 500 };
    }

    const modelsToTry = preferredModel
        ? [preferredModel, ...FALLBACK_MODELS.filter(m => m !== preferredModel)]
        : FALLBACK_MODELS;

    const contents = messages || [{ parts: [{ text: prompt }] }];
    let lastError = null;

    for (const model of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await axios.post(url, {
                contents,
                generationConfig: {
                    temperature,
                    maxOutputTokens: maxTokens
                }
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 22000
            });

            const candidate = response.data?.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text;
            if (text && text.trim().length > 0) {
                return {
                    success: true,
                    text: text.trim(),
                    model,
                    raw: response.data
                };
            }
        } catch (err) {
            lastError = err;
            const status = err.response?.status;
            // If model is not found (404), continue trying next model in list
            if (status === 404) {
                console.warn(`[Gemini] Model ${model} returned 404, trying next...`);
                continue;
            }
            // For rate limit (429) or other errors, log and break
            console.error(`[Gemini] Request failed with model ${model} (status: ${status}):`, err.message);
            break;
        }
    }

    const status = lastError?.response?.status || 500;
    return {
        success: false,
        error: lastError?.response?.data?.error?.message || lastError?.message || 'Errore Gemini API',
        status
    };
}

module.exports = {
    getGeminiApiKey,
    hasGeminiKey,
    generateWithGemini
};
