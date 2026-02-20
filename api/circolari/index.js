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

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Controlla cache /tmp
    const cached = loadCache();
    if (cached) return res.json({ success: true, circolari: cached, cached: true });

    try {
        const SCHOOL_URL = 'https://www.liceogandhi.edu.it/categoria/storico-circolari/';
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
            const date = $(el).find('.category-date').text().trim() || new Date().toLocaleDateString('it-IT');
            const numeroMatch = title.match(/n\.?\s*(\d+)/i);
            const numero = numeroMatch ? numeroMatch[1] : (i + 1);

            if (title && link && circolari.length < 10) {
                circolari.push({
                    id: generateStableId(link),
                    titolo: title,
                    data: date,
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
