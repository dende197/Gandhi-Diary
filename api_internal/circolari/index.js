/**
 * GET /api/circolari
 * 
 * NOTA SERVERLESS: La cache in-memory dura solo per invocazione.
 * Per cache persistente, usare Supabase, KV store (Vercel KV), o Redis.
 * Il modulo circolariCache.js usa /tmp come cache di breve durata.
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { handleCors, USER_AGENT, generateStableId, debugLog } = require('../../lib/helpers');
const fs = require('fs');

const CACHE_FILE = '/tmp/circolari_cache.json';
const CACHE_TTL = 3600 * 1000; // 1 ora

function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (Date.now() - cache.timestamp < CACHE_TTL) return cache.data;
        }
    } catch (e) { }
    return null;
}

function saveCache(data) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) { }
}

const IT_MONTHS = {
    'gen': '01', 'gennaio': '01',
    'feb': '02', 'febbraio': '02',
    'mar': '03', 'marzo': '03',
    'apr': '04', 'aprile': '04',
    'mag': '05', 'maggio': '05',
    'giu': '06', 'giugno': '06',
    'lug': '07', 'luglio': '07',
    'ago': '08', 'agosto': '08',
    'set': '09', 'sett': '09', 'settembre': '09',
    'ott': '10', 'ottobre': '10',
    'nov': '11', 'novembre': '11',
    'dic': '12', 'dicembre': '12'
};

function parseDateToIso(raw) {
    if (!raw) return null;
    const str = String(raw).trim();
    
    // ISO format: YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    
    // Numeric format: DD/MM/YYYY or DD-MM-YYYY
    const numMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (numMatch) {
        const day = numMatch[1].padStart(2, '0');
        const month = numMatch[2].padStart(2, '0');
        const year = numMatch[3];
        return `${year}-${month}-${day}`;
    }
    
    // Text format: "28 ago 2026" or "28 agosto 2026"
    const textMatch = str.match(/^(\d{1,2})\s+([a-zA-Zàèéìòù]+)\s+(\d{4})/i);
    if (textMatch) {
        const day = textMatch[1].padStart(2, '0');
        const mKey = textMatch[2].toLowerCase();
        const month = IT_MONTHS[mKey] || IT_MONTHS[mKey.substring(0, 3)];
        const year = textMatch[3];
        if (month) return `${year}-${month}-${day}`;
    }
    
    return null;
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Controlla cache /tmp
    const cached = loadCache();
    if (cached) return res.json({ success: true, circolari: cached, cached: true });

    try {
        const SCHOOL_URL = process.env.SCHOOL_CIRCOLARI_URL || 'https://www.liceogandhi.edu.it/categoria/storico-circolari/';
        const response = await axios.get(SCHOOL_URL, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const circolari = [];

        $('.card-wrapper').each((i, el) => {
            const titleElem = $(el).find('.card-title a');
            const title = titleElem.text().trim();
            const link = titleElem.attr('href');
            const rawDate = $(el).find('.category-date').text().trim();
            const isoDate = parseDateToIso(rawDate);
            const numeroMatch = title.match(/n\.?\s*(\d+)/i);
            const numero = numeroMatch ? numeroMatch[1] : (i + 1);

            if (title && link && circolari.length < 20) {
                circolari.push({
                    id: generateStableId(link),
                    titolo: title,
                    data: rawDate || (isoDate ? isoDate.split('-').reverse().join('/') : ''),
                    dataPubblicazione: isoDate || '',
                    date: isoDate || '',
                    link,
                    numero
                });
            }
        });

        saveCache(circolari);
        res.json({ success: true, circolari });
    } catch (error) {
        console.error('Scraping Error:', error.message);
        res.json({ success: true, circolari: [], error: 'Scraping fallito' });
    }
}
