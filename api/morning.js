const { GoogleGenerativeAI } = require('@google/generative-ai');
const { google } = require('googleapis');
const textToSpeech = require('@google-cloud/text-to-speech');
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Configurazione WebPush
webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@gconnect.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action || req.body?.action;

    try {
        switch (action) {
            case 'briefing':
                return await handleBriefing(req, res);
            case 'chat':
                return await handleChat(req, res);
            case 'tts':
                return await handleTTS(req, res);
            case 'subscribe':
                return await handleSubscribe(req, res);
            case 'push':
                return await handlePush(req, res);
            case 'models':
                return await handleModels(req, res);
            default:
                return res.status(400).json({ error: 'Action mancante o non valida' });
        }
    } catch (error) {
        console.error(`Error in morning API [${action}]:`, error);
        return res.status(500).json({ error: error.message });
    }
};

async function handleBriefing(req, res) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!email || !privateKey) {
        throw new Error('Google Calendar credentials missing');
    }

    const auth = new google.auth.JWT({
        email,
        key: privateKey.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/calendar.readonly']
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Calcola oggi a Roma
    const now = new Date();
    const romeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));

    const startOfDay = new Date(romeTime);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(romeTime);
    endOfDay.setHours(23, 59, 59, 999);

    const eventsRes = await calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
    });

    const compiti = (eventsRes.data.items || [])
        .map(e => {
            const time = e.start.dateTime
                ? new Date(e.start.dateTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                : 'Tutto il giorno';
            return `- ${e.summary} (${time})`;
        })
        .join('\n') || 'Nessun impegno specifico oggi';

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    const oggiNome = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][romeTime.getDay()];
    const ora = romeTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    const prompt = `
Sei un assistente personale AI amichevole, motivante e conciso di nome G-Connect AI.
Stai parlando con Andrea, uno studente di 4a superiore, alle ${ora} di ${oggiNome} mattina.

Compiti/impegni di oggi nel calendario:
${compiti}

Genera un briefing mattutino parlato in italiano (max 100 parole) che:
1. Lo saluti calorosamente.
2. Gli elenchi brevemente cosa deve fare oggi basandosi sul calendario. Se non ci sono compiti, fagli un complimento o auguragli buona giornata.
3. Gli dia una piccola pillola di motivazione o una curiosità tecnologica/scientifica breve.
4. Concluda chiedendo se ha bisogno di altro o se può iniziare la giornata.

IMPORTANTE: Scrivi solo il testo parlato, senza elenchi puntati o markdown pesante. Sii naturale, usa un tono da "telefonata mattutina".
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const testo = response.text();

    return res.json({ success: true, briefing: testo });
}

async function handleChat(req, res) {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Messaggio mancante' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-latest',
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
        generationConfig: { maxOutputTokens: 150 }
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    return res.json({ success: true, response: text });
}

async function handleTTS(req, res) {
    const { testo } = req.body;
    if (!testo) return res.status(400).json({ error: 'Testo mancante' });

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
}

async function handleSubscribe(req, res) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'Subscription mancante' });

    const { error } = await supabase.from('push_subscriptions').insert({ subscription });
    if (error) throw error;

    return res.json({ success: true });
}

async function handlePush(req, res) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data: subs, error } = await supabase.from('push_subscriptions').select('subscription');
    if (error) throw error;

    const payload = JSON.stringify({
        title: '☀️ Buongiorno Andrea!',
        body: 'Il tuo briefing mattutino è pronto. Tocca per iniziare.',
        url: '/morning',
        icon: '/icon-192.png'
    });

    let sent = 0;
    let failed = 0;

    for (const { subscription } of subs || []) {
        try {
            await webpush.sendNotification(subscription, payload);
            sent++;
        } catch (e) {
            console.error('Push failed for sub:', e.message);
            failed++;
        }
    }

    return res.json({ success: true, sent, failed });
}

async function handleModels(req, res) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
    const response = await axios.get(url);
    return res.json({ success: true, models: response.data.models });
}
