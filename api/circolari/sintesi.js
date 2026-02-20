const axios = require('axios');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const { handleCors, USER_AGENT, debugLog } = require('../../lib/helpers');
const { getGroq } = require('../../lib/groq');
const { getSintesiFromCache, setSintesiInCache } = require('../../lib/sintesiCache');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { link, id } = req.body;
    if (!link) return res.status(400).json({ success: false, error: 'Link mancante', errorType: 'badRequest' });

    // Cache check
    if (id) {
        const cached = getSintesiFromCache(id);
        if (cached) return res.json({ success: true, sintesi: cached, id, cached: true });
    }

    try {
        let textContent = '';
        let finalPdfUrl = link;

        if (!link.toLowerCase().endsWith('.pdf')) {
            const htmlRes = await axios.get(link, { timeout: 10000 });
            const $ = cheerio.load(htmlRes.data);
            const pdfLinks = [];
            $('#attachmentsList a[href*=".pdf"]').each((i, el) => {
                pdfLinks.push($(el).attr('href'));
            });
            if (pdfLinks.length > 0) {
                const bestLink = pdfLinks.find(url => url.toLowerCase().includes('circolare') || url.toLowerCase().includes('comunicato')) || pdfLinks[0];
                finalPdfUrl = (bestLink.startsWith('http') ? bestLink : `https://www.liceogandhi.edu.it${bestLink}`).trim();
            } else {
                textContent = $('article, .entry-content, .content').text().trim() || $('body').text().trim();
            }
        }

        if (finalPdfUrl.toLowerCase().endsWith('.pdf') && !textContent) {
            try {
                const pdfRes = await axios.get(finalPdfUrl, {
                    headers: { 'User-Agent': USER_AGENT, 'Referer': 'https://www.liceogandhi.edu.it/' },
                    responseType: 'arraybuffer',
                    timeout: 15000
                });
                const data = await pdfParse(pdfRes.data);
                textContent = data.text;
            } catch (pdfErr) {
                console.error('PDF Error:', pdfErr.message);
                return res.status(500).json({ success: false, error: 'Impossibile scaricare il documento PDF.', errorType: 'pdfError' });
            }
        }

        if (!textContent || textContent.trim().length < 20) {
            return res.status(400).json({ success: false, error: 'Nessun contenuto testuale trovato nella circolare.', errorType: 'noContent' });
        }

        const groq = getGroq();
        if (!groq) return res.status(500).json({ success: false, error: 'AI key mancante' });

        const prompt = `Sei un assistente per studenti del Liceo Gandhi. Riassumi questa circolare scolastica in massimo 4 punti elenco brevi, molto chiari e pratici. 
REGOLE DI FORMATTAZIONE:
- Usa il formato **Markdown**.
- Usa **grassetto** per date, scadenze, classi o orari importanti.
- Usa punti elenco standard (es. - o *).
- Non aggiungere introduzioni come "Ecco il riassunto".

Circolare: "${textContent.substring(0, 7000)}"`;

        const MAX_RETRIES = 2;
        let lastError = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const completion = await groq.chat.completions.create({
                    messages: [{ role: 'user', content: prompt }],
                    model: 'openai/gpt-oss-120b',
                    temperature: 0.5,
                    max_completion_tokens: 1024,
                    top_p: 1,
                    stream: false
                });

                const sintesi = completion.choices?.[0]?.message?.content || 'Impossibile generare la sintesi.';

                if (id && sintesi && !sintesi.includes('Impossibile')) {
                    setSintesiInCache(id, sintesi);
                }

                return res.json({ success: true, sintesi, id });
            } catch (aiErr) {
                lastError = aiErr;
                const status = aiErr.status || aiErr.response?.status;
                if ((status === 429 || status === 500 || status === 503) && attempt < MAX_RETRIES - 1) {
                    await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
                    continue;
                }
                break;
            }
        }

        const status = lastError?.status || lastError?.response?.status;
        if (status === 429) {
            return res.status(429).json({ success: false, error: 'Quota AI temporaneamente esaurita. Riprova tra qualche minuto.', errorType: 'quotaExceeded' });
        }
        res.status(500).json({ success: false, error: lastError?.message || 'Errore AI sconosciuto', errorType: 'aiError' });

    } catch (error) {
        console.error('Synthesis Error:', error.message);
        res.status(500).json({ success: false, error: error.message, errorType: 'serverError' });
    }
}
