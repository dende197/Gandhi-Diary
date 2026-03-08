/**
 * lib/googleCalendar.js
 * Google Calendar integration via Service Account.
 * Syncs school homework from Argo scraping to Google Calendar.
 */

const { google } = require('googleapis');

// ============= COLOR MAP PER MATERIA =============
const SUBJECT_COLORS = {
    'ITALIANO': '9',       // Blueberry
    'MATEMATICA': '11',    // Tomato
    'INGLESE': '5',        // Banana
    'STORIA': '6',         // Tangerine
    'FILOSOFIA': '3',      // Grape
    'FISICA': '10',        // Basil
    'SCIENZE': '2',        // Sage
    'INFORMATICA': '7',    // Peacock
    'LATINO': '1',         // Lavender
    'GRECO': '4',          // Flamingo
    'ARTE': '8',           // Graphite
    'EDUCAZIONE FISICA': '10', // Basil
    'RELIGIONE': '8',      // Graphite
    'CHIMICA': '11',       // Tomato
    'SCIENZE NATURALI': '2', // Sage
    'DISEGNO': '4',        // Flamingo
    'FRANCESE': '5',       // Banana
    'SPAGNOLO': '6',       // Tangerine
    'TEDESCO': '3',        // Grape
};

function getColorForSubject(materia) {
    if (!materia) return '9';
    const upper = materia.toUpperCase();
    for (const [key, color] of Object.entries(SUBJECT_COLORS)) {
        if (upper.includes(key)) return color;
    }
    return '9'; // default: Blueberry
}

// ============= AUTH =============

/**
 * Returns a JWT auth client.
 */
function getAuth() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!email || !privateKey) {
        throw new Error('Google Calendar credentials missing in env');
    }

    // Clean private key
    const cleanKey = privateKey
        .replace(/\\n/g, '\n')
        .replace(/^"(.*)"$/, '$1')
        .replace(/^'(.*)'$/, '$1')
        .trim();

    const auth = new google.auth.JWT({
        email: email,
        key: cleanKey,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });
    return auth;
}

// ============= HELPERS =============

/**
 * Normalizza il titolo per il confronto anti-duplicati.
 */
function normalizeTitle(title) {
    if (!title) return '';
    return title
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')               // spazi multipli -> uno solo
        .replace(/[^\w\s:]/g, '')           // rimuove punteggiatura speciale
        .normalize('NFD')                   // scompone i caratteri accentati
        .replace(/[\u0300-\u036f]/g, '');   // rimuove i segni diacritici (accenti)
}

/**
 * Genera un ID univoco per un compito basato su materia, data e descrizione.
 * Utile per evitare duplicati anche se il titolo cambia leggermente.
 */
function generateArgoId(materia, data, descrizione = '') {
    // Normalizziamo la descrizione per l'ID (primi 80 caratteri per stabilità)
    const descClean = (descrizione || '').toLowerCase().trim().substring(0, 80);
    const raw = `${materia.toLowerCase().trim()}-${data}-${descClean}`;
    return Buffer.from(raw).toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase()
        .substring(0, 50);
}

/**
 * Normalizza una stringa data in formato YYYY-MM-DD per Google Calendar.
 */
function toCalendarDate(dateStr) {
    if (!dateStr) return null;
    // Già in formato YYYY-MM-DD o ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr.split('T')[0];
    }
    // Formato DD/MM/YYYY
    if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return null;
}

/**
 * Parses date strings from Argo (DD/MM/YYYY or YYYY-MM-DD) into a Date object.
 */
function parseDataArgo(dataString) {
    if (!dataString) return null;
    const normalized = toCalendarDate(dataString);
    if (normalized) return new Date(normalized);
    return new Date(dataString);
}

/**
 * Returns "today" at 00:00:00 in Europe/Rome timezone.
 */
function getOggiRome() {
    const d = new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" });
    const oggi = new Date(d);
    oggi.setHours(0, 0, 0, 0);
    return oggi;
}

// ============= SYNC ENGINE =============

/**
 * Sincronizza una lista di compiti sul calendario di Google.
 */
async function syncTasksToCalendar(tasks) {
    const results = { success: true, added: 0, skipped: 0, filtered: 0, errors: [] };
    if (!tasks || tasks.length === 0) return results;

    try {
        const auth = getAuth();
        const calendar = google.calendar({ version: 'v3', auth });
        const calendarId = process.env.GOOGLE_CALENDAR_ID;
        const oggi = getOggiRome();

        // 1. Filtriamo solo i compiti futuri
        const tasksToProcess = tasks.filter(task => {
            const dateStr = task.due_date || task.datCompito || task.dataConsegna || '';
            const scadenza = parseDataArgo(dateStr);
            if (!scadenza || scadenza < oggi) {
                results.filtered++;
                return false;
            }
            return true;
        });

        // 2. Loop di inserimento con anti-duplicati robusto
        for (const task of tasksToProcess) {
            const materia = task.materia || task.subject || 'COMPITO';
            const description = task.text || task.desCompito || task.compito || '';
            const rawDate = task.due_date || task.datCompito || task.dataConsegna || '';
            const calendarDate = toCalendarDate(rawDate);

            if (!calendarDate) {
                results.errors.push(`${materia}: Data non valida (${rawDate})`);
                continue;
            }

            // Ripristiniamo il formato originale del titolo per compatibilità
            const summary = `[${materia.toUpperCase()}]: ${description}`;
            const argoId = generateArgoId(materia, calendarDate, description);

            // Finestra di ricerca: ±1 giorno per sicurezza
            const dataTarget = parseDataArgo(calendarDate);
            const timeMin = new Date(dataTarget);
            timeMin.setDate(timeMin.getDate() - 1);
            timeMin.setHours(0, 0, 0, 0);

            const timeMax = new Date(dataTarget);
            timeMax.setDate(timeMax.getDate() + 1);
            timeMax.setHours(23, 59, 59, 999);

            try {
                // A. Cerca per argoId (metodo robusto)
                const searchById = await calendar.events.list({
                    calendarId,
                    timeMin: timeMin.toISOString(),
                    timeMax: timeMax.toISOString(),
                    privateExtendedProperty: `argoId=${argoId}`
                });

                if (searchById.data.items && searchById.data.items.length > 0) {
                    results.skipped++;
                    continue;
                }

                // B. Cerca per titolo normalizzato (legacy backup)
                const searchByTitle = await calendar.events.list({
                    calendarId,
                    timeMin: timeMin.toISOString(),
                    timeMax: timeMax.toISOString(),
                    q: materia.toUpperCase()
                });

                const normNuovoTitolo = normalizeTitle(summary + description);
                const esistePerTitolo = (searchByTitle.data.items || []).some(ev => {
                    return normalizeTitle(ev.summary + (ev.description || '')) === normNuovoTitolo;
                });

                if (esistePerTitolo) {
                    results.skipped++;
                    continue;
                }

                // C. Inserimento
                await calendar.events.insert({
                    calendarId,
                    requestBody: {
                        summary,
                        description,
                        start: { date: calendarDate },
                        end: { date: calendarDate },
                        colorId: getColorForSubject(materia),
                        extendedProperties: {
                            private: {
                                argoId: argoId,
                                source: 'argo-sync'
                            }
                        }
                    }
                });
                results.added++;

            } catch (err) {
                results.errors.push(`${materia}: ${err.message}`);
            }
        }

        results.success = results.errors.length === 0;
        return results;

    } catch (e) {
        results.success = false;
        results.errors.push(`Sync Error: ${e.message}`);
        return results;
    }
}

// ============= CLEANUP TOOLS =============

/**
 * Elimina tutti i compiti passati anteriori a oggi.
 */
async function cleanOldEvents() {
    const auth = getAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    const oggi = getOggiRome();

    try {
        const yesterday = new Date(oggi);
        yesterday.setMilliseconds(-1);

        const res = await calendar.events.list({
            calendarId,
            timeMin: '2024-09-01T00:00:00Z',
            timeMax: yesterday.toISOString(),
            singleEvents: true,
            maxResults: 2500
        });

        const events = res.data.items || [];
        const targets = events.filter(e => e.summary && e.summary.startsWith('['));

        let deleted = 0;
        for (const event of targets) {
            await calendar.events.delete({ calendarId, eventId: event.id });
            deleted++;
        }

        return { success: true, deleted, total_checked: events.length };
    } catch (e) {
        console.error('cleanOldEvents error:', e.message);
        throw e;
    }
}

/**
 * Rimuove i duplicati dagli eventi futuri.
 */
async function removeDuplicates() {
    const auth = getAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    const oggi = getOggiRome();

    try {
        const res = await calendar.events.list({
            calendarId,
            timeMin: oggi.toISOString(),
            singleEvents: true,
            maxResults: 1000,
            orderBy: 'startTime'
        });

        const events = res.data.items || [];
        // Consideriamo solo compiti (iniziano con [)
        const homeworks = events.filter(e => e.summary && e.summary.startsWith('['));

        // Gruppo per Titolo Normalizzato + Data
        const groups = {};
        homeworks.forEach(ev => {
            const date = ev.start.date || ev.start.dateTime.split('T')[0];
            const key = `${normalizeTitle(ev.summary + (ev.description || ''))}_${date}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(ev);
        });

        let removed = 0;
        for (const key in groups) {
            const list = groups[key];
            if (list.length > 1) {
                // Ordina per data creazione crescente (il più vecchio primo)
                list.sort((a, b) => new Date(a.created) - new Date(b.created));

                // Mantieni il primo (il più vecchio), elimina gli altri (duplicati successivi)
                for (let i = 1; i < list.length; i++) {
                    await calendar.events.delete({ calendarId, eventId: list[i].id });
                    removed++;
                }
            }
        }

        return { success: true, removed, total_checked: homeworks.length };
    } catch (e) {
        console.error('removeDuplicates error:', e.message);
        throw e;
    }
}

// ============= CONNECTION TEST =============

async function testConnection() {
    try {
        const auth = getAuth();
        const calendar = google.calendar({ version: 'v3', auth });
        const res = await calendar.calendars.get({ calendarId: process.env.GOOGLE_CALENDAR_ID });
        return { success: true, calendar: res.data.summary };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = {
    syncTasksToCalendar,
    cleanOldEvents,
    removeDuplicates,
    testConnection,
    parseDataArgo,
    getOggiRome
};
