const { handleCors, getRequestBody } = require('../../lib/helpers');
const { getGroq } = require('../../lib/groq');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const groq = getGroq();
    if (!groq) return res.status(500).json({ error: 'Backend error: GROQ_API_KEY non configurata.' });

    const body = getRequestBody(req);
    const { messages } = body;

    try {
        const openAIMessages = (messages || []).map(m => ({
            role: m.role === 'model' ? 'assistant' : m.role,
            content: m.parts?.[0]?.text || m.content || ''
        }));

        const completion = await groq.chat.completions.create({
            messages: openAIMessages,
            model: 'openai/gpt-oss-120b',
            temperature: 0.7,
            max_completion_tokens: 2048,
            top_p: 0.95,
            stream: false
        });

        const aiText = completion.choices?.[0]?.message?.content || '';

        res.json({
            candidates: [{
                content: {
                    parts: [{ text: aiText }],
                    role: 'model'
                }
            }]
        });
    } catch (error) {
        console.error('AI Proxy Error:', error.message);
        res.status(error.status || 500).json({ error: { message: error.message, code: error.status || 500 } });
    }
}
