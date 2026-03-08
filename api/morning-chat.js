const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { message, history = [] } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Messaggio mancante' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            systemInstruction: `
Sei G-Connect AI, l'assistente personale mattutino di Andrea, uno studente italiano di 4a superiore scienze applicate.

PERSONALITÀ:
- Tono amichevole, diretto, mai eccessivamente formale.
- Conciso: max 3 frasi per risposta.
- Motivante ma senza essere stucchevole.
- Ironico e intelligente quando appropriato.
- Parli SEMPRE in italiano.

COMPORTAMENTO:
- Se ti chiede le notizie -> dai 1-2 notizie plausibili e interessanti.
- Se ti chiede il meteo -> rispondi in base alla stagione attuale.
- Se ti chiede una curiosità -> scientifica o tecnologica preferibilmente.
- Se ti chiede di un compito -> aiutalo brevemente.
- Se dice "ciao", "arrivederci", "a dopo", "bye" -> concludi con un saluto motivante tipo "Vai Andrea, spacca tutto oggi!".
- Ricorda il contesto della conversazione precedente.

IMPORTANTE: Non usare mai elenchi puntati o markdown. Parla come se stessi telefonando a un amico.
            `
        });

        const chat = model.startChat({
            history: history.map(m => ({
                role: m.role,
                parts: Array.isArray(m.parts) ? m.parts : [{ text: m.parts }]
            })),
            generationConfig: {
                maxOutputTokens: 150,
            },
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();

        return res.json({ success: true, response: text });

    } catch (e) {
        console.error('Morning chat error:', e);
        return res.status(500).json({ error: e.message });
    }
};
