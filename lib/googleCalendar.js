/**
 * lib/googleCalendar.js
 * Google Calendar integration via Service Account.
 * Syncs school homework from Argo scraping to Google Calendar.
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
    'RELIGIONE': '8',
    'CHIMICA': '11',
    'SCIENZE NATURALI': '2',
    'DISEGNO': '4',
    'FRANCESE': '5',
    'SPAGNOLO': '6',
    'TEDESCO': '3',
};

// ============= ORARIO SCOLASTICO =============

const ORARIO_SCOLASTICO = {
    "lunedi": [
        { "materia": "SCIENZE", "inizio": "08:00", "fine": "09:00" },
        { "materia": "INGLESE", "inizio": "09:00", "fine": "10:00" },
        { "materia": "FISICA", "inizio": "10:00", "fine": "11:00" },
        { "materia": "FILOSOFIA", "inizio": "11:00", "fine": "12:00" },
        { "materia": "ARTE", "inizio": "12:00", "fine": "13:00" }
    ],
    "martedi": [
        { "materia": "MATEMATICA", "inizio": "08:00", "fine": "09:00" },
        { "materia": "SCIENZE", "inizio": "09:00", "fine": "11:00" },
        { "materia": "FILOSOFIA", "inizio": "11:00", "fine": "12:00" },
        { "materia": "FISICA", "inizio": "12:00", "fine": "13:00" }
    ],
    "mercoledi": [
        { "materia": "ITALIANO", "inizio": "08:00", "fine": "09:00" },
        { "materia": "SCIENZE MOTORIE", "inizio": "09:00", "fine": "10:00" },
        { "materia": "FILOSOFIA", "inizio": "10:00", "fine": "11:00" },
        { "materia": "STORIA", "inizio": "11:00", "fine": "12:00" },
        { "materia": "FISICA", "inizio": "12:00", "fine": "13:00" }
    ],
    "giovedi": [
        { "materia": "INGLESE", "inizio": "08:00", "fine": "09:00" },
        { "materia": "ARTE", "inizio": "09:00", "fine": "10:00" },
        { "materia": "ITALIANO", "inizio": "10:00", "fine": "13:00" }
    ],
    "venerdi": [
        { "materia": "ITALIANO", "inizio": "08:00", "fine": "09:00" },
        { "materia": "SCIENZE", "inizio": "09:00", "fine": "11:00" },
        { "materia": "MATEMATICA", "inizio": "11:00", "fine": "13:00" }
    ],
    "sabato": [
        { "materia": "RELIGIONE", "inizio": "08:00", "fine": "09:00" },
        { "materia": "SCIENZE MOTORIE", "inizio": "09:00", "fine": "10:00" },
        { "materia": "MATEMATICA", "inizio": "10:00", "fine": "11:00" },
        { "materia": "INFORMATICA", "inizio": "11:00", "fine": "13:00" }
    ]
};

function getSlotForTask(materia, dataScadenza) {
    const giorniMap = {
        0: 'domenica', 1: 'lunedi', 2: 'martedi',
        3: 'mercoledi', 4: 'giovedi', 5: 'venerdi', 6: 'sabato'
    };

    const date = new Date(dataScadenza);
    const nomeGiorno = giorniMap[date.getDay()];
    const slotGiorno = ORARIO_SCOLASTICO[nomeGiorno] || [];

    // Match parziale case-insensitive tra materia del compito e orario
    return slotGiorno.find(s =>
        s.materia.toUpperCase().includes(materia.toUpperCase()) ||
        materia.toUpperCase().includes(s.materia.toUpperCase())
    ) || null;
}

function getColorForSubject(materia) {
    if (!materia) return '9';
    const upper = materia.toUpperCase();
    for (const [key, color] of Object.entries(SUBJECT_COLORS)) {
        if (upper.includes(key)) return color;
    }
    return '9';
}

// ============= AUTH =============

function getAuth() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!email || !privateKey) throw new Error('Google Calendar credentials missing in env');

    const cleanKey = privateKey
        .replace(/\\n/g, '\n')
        .replace(/^"(.*)"$/, '$1')
        .replace(/^'(.*)'$/, '$1')
        .trim();

    return new google.auth.JWT({
        email,
        key: cleanKey,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });
}

// ============= HELPERS =============

function normalizeTitle(title) {
    if (!title) return '';
    return title
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s:]/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function generateArgoId(materia, data, descrizione = '', slotInizio = '') {
    const descClean = (descrizione || '').toLowerCase().trim().substring(0, 60);
    const raw = `${materia.toLowerCase().trim()}-${data}-${slotInizio}-${descClean}`;
    return Buffer.from(raw).toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase()
        .substring(0, 50);
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

async function syncTasksToCalendar(tasks) {
    const results = { success: true, added: 0, skipped: 0, filtered: 0, errors: [] };
    if (!tasks || tasks.length === 0) return results;

    try {
        const auth = getAuth();
        const calendar = google.calendar({ version: 'v3', auth });
        const calendarId = process.env.GOOGLE_CALENDAR_ID;
        const oggi = getOggiRome();

        // Filtra solo compiti futuri
        const tasksToProcess = tasks.filter(task => {
            const dateStr = task.due_date || task.datCompito || task.dataConsegna || '';
            const scadenza = parseDataArgo(dateStr);
            if (!scadenza || scadenza < oggi) { results.filtered++; return false; }
            return true;
        });

        // Carica tutti gli eventi futuri in memoria (una sola chiamata API)
        const allFutureEvents = await calendar.events.list({
            calendarId,
            timeMin: oggi.toISOString(),
            maxResults: 1000,
            singleEvents: true
        });

        // Costruisce un Set di chiavi già esistenti per controllo O(1)
        const existingKeys = new Set();
        for (const ev of allFutureEvents.data.items || []) {
            const argoId = ev.extendedProperties?.private?.argoId;
            if (argoId) existingKeys.add(`id:${argoId}`);
            const date = ev.start?.date || '';
            existingKeys.add(`title:${normalizeTitle(ev.summary || '')}_${date}`);
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

            const summary = `[${materia.toUpperCase()}]: ${description}`;
            const slot = getSlotForTask(materia, calendarDate);
            const argoId = generateArgoId(materia, calendarDate, description, slot?.inizio || '');
            const normTitle = normalizeTitle(summary);

            // Controlla duplicati nel Set in memoria
            if (existingKeys.has(`id:${argoId}`) || existingKeys.has(`title:${normTitle}_${calendarDate}`)) {
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
                            private: { argoId, source: 'argo-sync' }
                        }
                    }
                });

                // Aggiunge al Set per evitare duplicati nello stesso batch
                existingKeys.add(`id:${argoId}`);
                existingKeys.add(`title:${normTitle}_${calendarDate}`);
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

        const targets = (res.data.items || []).filter(e => e.summary?.startsWith('['));
        let deleted = 0;
        for (const event of targets) {
            await calendar.events.delete({ calendarId, eventId: event.id });
            deleted++;
        }

        return { success: true, deleted, total_checked: res.data.items?.length || 0 };
    } catch (e) {
        console.error('cleanOldEvents error:', e.message);
        throw e;
    }
}

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

        const homeworks = (res.data.items || []).filter(e => e.summary?.startsWith('['));

        const groups = {};
        homeworks.forEach(ev => {
            const date = ev.start.date || ev.start.dateTime.split('T')[0];
            const key = `${normalizeTitle(ev.summary + (ev.description || ''))}_${date}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(ev);
        });

        let removed = 0;
        for (const list of Object.values(groups)) {
            if (list.length > 1) {
                // Mantieni il più vecchio, elimina i duplicati successivi
                list.sort((a, b) => new Date(a.created) - new Date(b.created));
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

async function nukeAllArgoEvents() {
    const auth = getAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    let deleted = 0;
    let pageToken = null;

    do {
        const res = await calendar.events.list({
            calendarId,
            timeMin: '2024-01-01T00:00:00Z',
            maxResults: 250,
            singleEvents: true,
            pageToken: pageToken || undefined
        });

        for (const event of (res.data.items || []).filter(e => e.summary?.startsWith('['))) {
            await calendar.events.delete({ calendarId, eventId: event.id });
            deleted++;
        }

        pageToken = res.data.nextPageToken;
    } while (pageToken);

    return { success: true, deleted };
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
    nukeAllArgoEvents,
    testConnection,
    parseDataArgo,
    getOggiRome
};
