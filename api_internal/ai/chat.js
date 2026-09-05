const { handleCors, getRequestBody, verifySessionToken } = require('../../lib/helpers');
const { hasGeminiKey, generateWithGemini } = require('../../lib/gemini');
const { getGroq } = require('../../lib/groq');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = getRequestBody(req);
    const { messages, userId } = body;

    if (!userId || !verifySessionToken(req, userId)) {
        return res.status(403).json({ error: 'Non autorizzato' });
    }

    // 1. Try Google Gemini (original engine)
    if (hasGeminiKey()) {
        try {
            const geminiRes = await generateWithGemini({
                messages,
                temperature: 0.7,
                maxTokens: 2048,
                preferredModel: 'gemini-1.5-flash'
            });

            if (geminiRes.success && geminiRes.text) {
                return res.json({
                    candidates: [{
                        content: {
                            parts: [{ text: geminiRes.text }],
                            role: 'model'
                        }
                    }]
                });
            }
        } catch (gemErr) {
            console.warn('[Chat] Gemini chat failed, attempting Groq fallback...', gemErr.message);
        }
    }

    // 2. Fallback to Groq
    const groq = getGroq();
    if (groq) {
        try {
            const openAIMessages = (messages || []).map(m => ({
                role: m.role === 'model' ? 'assistant' : m.role,
                content: m.parts?.[0]?.text || m.content || ''
            }));

            const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'];
            let lastError = null;

            for (const model of models) {
                try {
                    const completion = await groq.chat.completions.create({
                        messages: openAIMessages,
                        model,
                        temperature: 0.7,
                        max_completion_tokens: 2048,
                        top_p: 0.95,
                        stream: false
                    });

                    const aiText = completion.choices?.[0]?.message?.content || '';

                    return res.json({
                        candidates: [{
                            content: {
                                parts: [{ text: aiText }],
                                role: 'model'
                            }
                        }]
                    });
                } catch (gErr) {
                    lastError = gErr;
                    const status = gErr.status || gErr.response?.status;
                    if (status === 404) continue;
                    break;
                }
            }

            if (lastError) {
                return res.status(lastError.status || 500).json({ error: { message: lastError.message, code: lastError.status || 500 } });
            }
        } catch (error) {
            console.error('Groq Proxy Error:', error.message);
            return res.status(error.status || 500).json({ error: { message: error.message, code: error.status || 500 } });
        }
    }

    return res.status(500).json({ error: 'Backend error: Nessuna chiave AI configurata (GEMINI_API_KEY o GROQ_API_KEY).' });
};
