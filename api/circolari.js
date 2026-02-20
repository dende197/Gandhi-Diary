const axios = require('axios');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const { handleCors, USER_AGENT, generateStableId } = require('../lib/helpers');
const { getGroq } = require('../lib/groq');
const { getSintesiFromCache, setSintesiInCache } = require('../lib/sintesiCache');

const CACHE_FILE = '/tmp/circolari_cache.json';
const CACHE_TTL = 3600 * 1000;

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    const { action } = req.query;

    try {
        switch (action) {
            case 'index':
                return await handleIndex(req, res);
            case 'sintesi':
                return await handleSintesi(req, res);
            default:
                return res.status(400).json({ error: 'Azione non valida' });
        }
    } catch (e) {
        console.error(`Circolari Hub Error [${action}]:`, e.message);
        res.status(500).json({ success: false, error: e.message });
    }
};

async function handleIndex(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (Date.now() - cache.timestamp < CACHE_TTL) return res.json({ success: true, circolari: cache.data, cached: true });
        }
    } catch (e) { }

    const response = await axios.get('https://www.liceogandhi.edu.it/categoria/storico-circolari/', { headers: { 'User-Agent': USER_AGENT }, timeout: 10000 });
    const $ = cheerio.load(response.data);
    const circolari = [];
    $('.card-wrapper').each((i, el) => {
        const titleElem = $(el).find('.card-title a');
        const title = titleElem.text().trim(), link = titleElem.attr('href'), date = $(el).find('.category-date').text().trim() || new Date().toLocaleDateString('it-IT');
        const numeroMatch = title.match(/n\.?\s*(\d+)/i), numero = numeroMatch ? numeroMatch[1] : (i + 1);
        if (title && link && circolari.length < 10) circolari.push({ id: generateStableId(link), titolo: title, data: date, link, numero });
    });
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ data: circolari, timestamp: Date.now() })); } catch (e) { }
    res.json({ success: true, circolari });
}

async function handleSintesi(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { link, id } = req.body;
    if (!link) return res.status(400).json({ success: false, error: 'Link mancante' });
    if (id) {
        const cached = getSintesiFromCache(id);
        if (cached) return res.json({ success: true, sintesi: cached, id, cached: true });
    }
    let textContent = '', finalPdfUrl = link;
    if (!link.toLowerCase().endsWith('.pdf')) {
        const htmlRes = await axios.get(link, { timeout: 10000 });
        const $ = cheerio.load(htmlRes.data), pdfLinks = [];
        $('#attachmentsList a[href*=".pdf"]').each((i, el) => pdfLinks.push($(el).attr('href')));
        if (pdfLinks.length > 0) {
            const bestLink = pdfLinks.find(url => url.toLowerCase().includes('circolare') || url.toLowerCase().includes('comunicato')) || pdfLinks[0];
            finalPdfUrl = (bestLink.startsWith('http') ? bestLink : `https://www.liceogandhi.edu.it${bestLink}`).trim();
        } else textContent = $('article, .entry-content, .content').text().trim() || $('body').text().trim();
    }
    if (finalPdfUrl.toLowerCase().endsWith('.pdf') && !textContent) {
        const pdfRes = await axios.get(finalPdfUrl, { headers: { 'User-Agent': USER_AGENT, 'Referer': 'https://www.liceogandhi.edu.it/' }, responseType: 'arraybuffer', timeout: 15000 });
        const data = await pdfParse(pdfRes.data);
        textContent = data.text;
    }
    if (!textContent || textContent.trim().length < 20) throw new Error('Nessun contenuto testuale trovato');
    const groq = getGroq();
    if (!groq) throw new Error('AI key mancante');
    const prompt = `Sei un assistente per studenti del Liceo Gandhi. Riassumi questa circolare scolastica in massimo 4 punti elenco brevi, molto chiari e pratici.\nREGOLE DI FORMATTAZIONE:\n- Usa il formato **Markdown**.\n- Usa **grassetto** per date, scadenze, classi o orari importanti.\n- Usa punti elenco standard (es. - o *).\n- Non aggiungere introduzioni come "Ecco il riassunto".\n\nCircolare: "${textContent.substring(0, 7000)}"`;
    const completion = await groq.chat.completions.create({ messages: [{ role: 'user', content: prompt }], model: 'openai/gpt-oss-120b', temperature: 0.5, max_completion_tokens: 1024, top_p: 1, stream: false });
    const sintesi = completion.choices?.[0]?.message?.content || 'Impossibile generare la sintesi.';
    if (id && sintesi && !sintesi.includes('Impossibile')) setSintesiInCache(id, sintesi);
    res.json({ success: true, sintesi, id });
}
