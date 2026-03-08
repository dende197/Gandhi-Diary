const { GoogleGenerativeAI } = require('@google/generative-ai');
const { google } = require('googleapis');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
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
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

    } catch (e) {
        console.error('Morning briefing error:', e);
        return res.status(500).json({ error: e.message });
    }
};
