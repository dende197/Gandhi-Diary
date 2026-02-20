/**
 * Cache per sintesi AI delle circolari.
 * In ambiente serverless, usiamo /tmp (effimero per invocazione, ma spesso warm).
 * Per persistenza reale, usare Supabase o KV store.
 */
const fs = require('fs');
const path = require('path');

const CACHE_FILE = '/tmp/cache_sintesi.json';

function loadSintesiCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('❌ Errore caricamento cache sintesi:', e.message);
    }
    return {};
}

function saveSintesiCache(cache) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (e) {
        console.error('❌ Errore salvataggio cache sintesi:', e.message);
    }
}

function getSintesiFromCache(id) {
    if (!id) return null;
    const cache = loadSintesiCache();
    return cache[id] || null;
}

function setSintesiInCache(id, sintesi) {
    if (!id || !sintesi) return;
    const cache = loadSintesiCache();
    cache[id] = sintesi;
    saveSintesiCache(cache);
}

module.exports = { getSintesiFromCache, setSintesiInCache };
