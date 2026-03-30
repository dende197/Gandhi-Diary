/**
 * lib/googleCalendar.js
 * Google Calendar sync engine — Universal (per-user OAuth2).
 * Syncs school homework from Argo scraping to any user's Google Calendar.
 */

const { google } = require('googleapis');

// ============= COLOR MAP PER MATERIA =============

const SUBJECT_COLORS = {
    'ITALIANO': '9',
    'MATEMATICA': '11',
    'INGLESE': '5',
    'STORIA': '6',
    'FILOSOFIA': '3',
    'FISICA': '10',
    'SCIENZE': '2',
    'INFORMATICA': '7',
    'LATINO': '1',
    'GRECO': '4',
    'ARTE': '8',
    'EDUCAZIONE FISICA': '10',
    'SCIENZE MOTORIE': '10',
    'RELIGIONE': '8',
    'CHIMICA': '11',
    'SCIENZE NATURALI': '2',
    'DISEGNO': '4',
    'FRANCESE': '5',
    'SPAGNOLO': '6',
    'TEDESCO': '3',
};

function getColorForSubject(materia) {
    if (!materia) return '9';
    const upper = materia.toUpperCase();
    for (const [key, color] of Object.entries(SUBJECT_COLORS)) {
        if (upper.includes(key)) return color;
    }
    return '9';
}

// ============= HELPERS =============

/**
 * Normalizza un titolo per il confronto duplicati.
 * IMPORTANTE: deve essere identica ogni volta per lo stesso input.
 */
function normalizeTitle(title) {
    if (!title) return '';
    return title
        .toLowerCase()
        .trim()
        .replace(/[\[\]():]/g, '')   // rimuove parentesi e due punti
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function generateArgoId(materia, data, descrizione = '', slotInizio = '') {
    const descClean = (descrizione || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9àèéìòù ]/gi, '')
        .substring(0, 60);
    const materiaClean = (materia || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const raw = `${materiaClean}-${data}-${slotInizio}-${descClean}`;
    return Buffer.from(raw).toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase()
        .substring(0, 50);
}

// ============= ORARIO SCOLASTICO (Configurable) =============
// Load the class schedule from CLASS_SCHEDULE environment variable (JSON blob).
// If not set, falls back to empty — all tasks will be created as all-day events.
// Example value for CLASS_SCHEDULE env var:
//   {"lunedi":[{"materia":"MATEMATICA","inizio":"08:00","fine":"09:00"}], ...}

let ORARIO_SCOLASTICO = {};
try {
    if (process.env.CLASS_SCHEDULE) {
        ORARIO_SCOLASTICO = JSON.parse(process.env.CLASS_SCHEDULE);
    }
} catch (e) {
    console.warn('[googleCalendar] Invalid CLASS_SCHEDULE env var — using all-day events as fallback:', e.message);
}

function getSlotForTask(materia, dataScadenza) {
    const giorniMap = {
        0: 'domenica', 1: 'lunedi', 2: 'martedi',
        3: 'mercoledi', 4: 'giovedi', 5: 'venerdi', 6: 'sabato'
    };

    const date = new Date(dataScadenza);
    const nomeGiorno = giorniMap[date.getDay()];
    const slotGiorno = ORARIO_SCOLASTICO[nomeGiorno] || [];

    const m = (materia || '').toUpperCase();
    return slotGiorno.find(s =>
        m.includes(s.materia.toUpperCase()) ||
        s.materia.toUpperCase().includes(m)
    ) || null;
}

function toCalendarDate(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.split('T')[0];
    if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return null;
}

function parseDataArgo(dataString) {
    if (!dataString) return null;
    const normalized = toCalendarDate(dataString);
    return normalized ? new Date(normalized) : new Date(dataString);
}

function getOggiRome() {
    const d = new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' });
    const oggi = new Date(d);
    oggi.setHours(0, 0, 0, 0);
    return oggi;
}

// ============= SYNC ENGINE =============

/**
 * Sincronizza compiti su Google Calendar.
 * @param {Array} tasks - Array di compiti da sincronizzare
 * @param {string} calendarId - ID del calendario (default: 'primary')
 * @param {object} auth - Authenticated OAuth2 client (per-user)
 */
async function syncTasksToCalendar(tasks, calendarId = 'primary', auth) {
    const results = { success: true, added: 0, skipped: 0, filtered: 0, errors: [] };
    if (!tasks || tasks.length === 0) return results;
    if (!auth) {
        results.success = false;
        results.errors.push('Auth mancante — impossibile sincronizzare');
        return results;
    }

    try {
        const calendar = google.calendar({ version: 'v3', auth });
        const oggi = getOggiRome();

        // Filtra solo compiti futuri
        const tasksToProcess = tasks.filter(task => {
            const dateStr = task.due_date || task.datCompito || task.dataConsegna || '';
            const scadenza = parseDataArgo(dateStr);
            if (!scadenza || scadenza < oggi) { results.filtered++; return false; }
            return true;
        });

        if (tasksToProcess.length === 0) return results;

        // Carica eventi futuri esistenti (una sola chiamata API)
        const allFutureEvents = await calendar.events.list({
            calendarId,
            timeMin: oggi.toISOString(),
            maxResults: 2000,
            singleEvents: true,
            // Recupera anche extendedProperties per il confronto argoId
            privateExtendedProperty: ['source=g-connect-sync']
        });

        // Set di chiavi per duplicati O(1)
        // Strategia doppia: per argoId (preciso) e per titolo+data (fallback)
        const existingArgoIds = new Set();
        const existingTitleKeys = new Set();

        for (const ev of allFutureEvents.data.items || []) {
            const argoId = ev.extendedProperties?.private?.argoId;
            if (argoId) existingArgoIds.add(argoId);

            // Chiave titolo: normalizza e combina con data
            const date = ev.start?.date || ev.start?.dateTime?.split('T')[0] || '';
            const normKey = normalizeTitle(ev.summary || '') + '_' + date;
            existingTitleKeys.add(normKey);
        }

        for (const task of tasksToProcess) {
            const materia = task.materia || task.subject || 'COMPITO';
            const description = task.text || task.desCompito || task.compito || '';
            const rawDate = task.due_date || task.datCompito || task.dataConsegna || '';
            const calendarDate = toCalendarDate(rawDate);

            if (!calendarDate) {
                results.errors.push(`${materia}: Data non valida (${rawDate})`);
                continue;
            }

            const slot = getSlotForTask(materia, calendarDate);
            const summary = `[${materia.toUpperCase()}]: ${description}`;
            const argoId = generateArgoId(materia, calendarDate, description, slot?.inizio || '');

            // --- Controllo duplicati ---
            // 1. Controlla per argoId (match esatto)
            if (existingArgoIds.has(argoId)) {
                results.skipped++;
                continue;
            }
            // 2. Controlla per titolo normalizzato + data (fallback per eventi pre-argoId)
            const normKey = normalizeTitle(summary) + '_' + calendarDate;
            if (existingTitleKeys.has(normKey)) {
                results.skipped++;
                continue;
            }

            try {
                const eventStart = slot
                    ? { dateTime: `${calendarDate}T${slot.inizio}:00`, timeZone: 'Europe/Rome' }
                    : { date: calendarDate };

                const eventEnd = slot
                    ? { dateTime: `${calendarDate}T${slot.fine}:00`, timeZone: 'Europe/Rome' }
                    : { date: calendarDate };

                await calendar.events.insert({
                    calendarId,
                    requestBody: {
                        summary,
                        description,
                        start: eventStart,
                        end: eventEnd,
                        colorId: getColorForSubject(materia),
                        extendedProperties: {
                            private: { argoId, source: 'g-connect-sync' }
                        }
                    }
                });

                // Aggiorna i set locali per evitare duplicati nella stessa sessione di sync
                existingArgoIds.add(argoId);
                existingTitleKeys.add(normKey);
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

// ============= CONNECTION TEST =============

async function testConnection(calendarId = 'primary', auth) {
    try {
        const calendar = google.calendar({ version: 'v3', auth });
        const res = await calendar.calendars.get({ calendarId });
        return { success: true, calendar: res.data.summary };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = {
    syncTasksToCalendar,
    testConnection,
    parseDataArgo,
    getOggiRome
};
