const textToSpeech = require('@google-cloud/text-to-speech');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { testo } = req.body;
    if (!testo) return res.status(400).json({ error: 'Testo mancante' });

    try {
        const client = new textToSpeech.TextToSpeechClient({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
            }
        });

        const [response] = await client.synthesizeSpeech({
            input: { text: testo },
            voice: {
                languageCode: 'it-IT',
                name: 'it-IT-Neural2-C',
                ssmlGender: 'FEMALE'
            },
            audioConfig: { audioEncoding: 'MP3' }
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        return res.send(Buffer.from(response.audioContent));
    } catch (e) {
        console.error('TTS error:', e.message);
        return res.status(500).json({ error: e.message });
    }
};
