/**
 * lib/googleCalendar.js
 * Google Calendar sync engine — Universal (per-user OAuth2).
 * Syncs school homework from Argo scraping to any user's Google Calendar.
 */

const { google } = require('googleapis');
const { resolveAttendanceJustification } = require('./helpers');

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
// Limit to keep Calendar description concise/readable and avoid oversized event bodies.
const MAX_REMINDER_ENTRIES = 12;

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
// If not set, falls back to the hardcoded default schedule (4D).
// Override via CLASS_SCHEDULE env var with a JSON blob:
//   {"lunedi":[{"materia":"MATEMATICA","inizio":"08:00","fine":"09:00"}], ...}

const DEFAULT_ORARIO_SCOLASTICO = {
    lunedi: [
        { materia: 'SCIENZE',        inizio: '08:00', fine: '09:00' },
        { materia: 'INGLESE',        inizio: '09:00', fine: '10:00' },
        { materia: 'FISICA',         inizio: '10:00', fine: '11:00' },
        { materia: 'FILOSOFIA',      inizio: '11:00', fine: '12:00' },
        { materia: 'ARTE',           inizio: '12:00', fine: '13:00' }
    ],
    martedi: [
        { materia: 'MATEMATICA',     inizio: '08:00', fine: '09:00' },
        { materia: 'SCIENZE',        inizio: '09:00', fine: '11:00' },
        { materia: 'STORIA',         inizio: '11:00', fine: '12:00' },
        { materia: 'FISICA',         inizio: '12:00', fine: '13:00' }
    ],
    mercoledi: [
        { materia: 'ITALIANO',       inizio: '08:00', fine: '09:00' },
        { materia: 'SCIENZE MOTORIE',inizio: '09:00', fine: '10:00' },
        { materia: 'FILOSOFIA',      inizio: '10:00', fine: '11:00' },
        { materia: 'STORIA',         inizio: '11:00', fine: '12:00' },
        { materia: 'FISICA',         inizio: '12:00', fine: '13:00' }
    ],
    giovedi: [
        { materia: 'INGLESE',        inizio: '08:00', fine: '10:00' },
        { materia: 'ARTE',           inizio: '10:00', fine: '11:00' },
        { materia: 'ITALIANO',       inizio: '11:00', fine: '13:00' }
    ],
    venerdi: [
        { materia: 'ITALIANO',       inizio: '08:00', fine: '09:00' },
        { materia: 'SCIENZE',        inizio: '09:00', fine: '11:00' },
        { materia: 'MATEMATICA',     inizio: '11:00', fine: '13:00' }
    ],
    sabato: [
        { materia: 'RELIGIONE',      inizio: '08:00', fine: '09:00' },
        { materia: 'SCIENZE MOTORIE',inizio: '09:00', fine: '10:00' },
        { materia: 'MATEMATICA',     inizio: '10:00', fine: '11:00' },
        { materia: 'INFORMATICA',    inizio: '11:00', fine: '13:00' }
    ]
};

let ORARIO_SCOLASTICO = DEFAULT_ORARIO_SCOLASTICO;
try {
    if (process.env.CLASS_SCHEDULE) {
        ORARIO_SCOLASTICO = JSON.parse(process.env.CLASS_SCHEDULE);
        console.log('[googleCalendar] Loaded class schedule from CLASS_SCHEDULE env var.');
    } else {
        console.log('[googleCalendar] CLASS_SCHEDULE env var not set — using default 4D schedule.');
    }
} catch (e) {
    console.warn('[googleCalendar] Invalid CLASS_SCHEDULE env var — falling back to default 4D schedule:', e.message);
    ORARIO_SCOLASTICO = DEFAULT_ORARIO_SCOLASTICO;
}

function getSlotForTask(materia, dataScadenza, schedule) {
    const giorniMap = {
        0: 'domenica', 1: 'lunedi', 2: 'martedi',
        3: 'mercoledi', 4: 'giovedi', 5: 'venerdi', 6: 'sabato'
    };

    const activeSchedule = schedule || ORARIO_SCOLASTICO;
    // Parse the date as UTC to avoid local-timezone day-of-week shifts
    const parts = String(dataScadenza || '').split('T')[0].split('-').map(Number);
    const date = (parts.length === 3 && parts[0] > 0)
        ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
        : new Date(dataScadenza);
    const nomeGiorno = giorniMap[date.getUTCDay()];
    const slotGiorno = activeSchedule[nomeGiorno] || [];

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
    const p = getRomeDateParts(new Date());
    return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}

function getRomeDateParts(baseDate = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    });
    const parts = fmt.formatToParts(baseDate);
    const get = (type) => parts.find(p => p.type === type)?.value || '';
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hour: Number(get('hour') || '0'),
        minute: Number(get('minute') || '0')
    };
}

function getTodayRomeISODate() {
    const p = getRomeDateParts(new Date());
    return `${p.year}-${p.month}-${p.day}`;
}

function isAttendanceEntryJustified(item) {
    if (!item || typeof item !== 'object') return false;
    return resolveAttendanceJustification(item).giustificata;
}

function extractUnjustifiedAttendance(assenzeData) {
    const source = assenzeData || {};
    const assenze = Array.isArray(source.assenze) ? source.assenze : [];
    const ritardi = Array.isArray(source.ritardi) ? source.ritardi : [];
    const uscite = Array.isArray(source.uscite) ? source.uscite : [];
    return [...assenze, ...ritardi, ...uscite].filter(item => {
        if (!item || typeof item !== 'object') return false;
        return !isAttendanceEntryJustified(item);
    });
}

function attendanceDescriptionLines(entries) {
    if (!Array.isArray(entries)) return '';
    const tipoLabel = { assenza: 'Assenza', ritardo: 'Ritardo', uscita: 'Uscita' };
    const lines = entries.slice(0, MAX_REMINDER_ENTRIES).map((e) => {
        const tipo = tipoLabel[(e.tipo || '').toLowerCase()] || 'Evento';
        const data = toCalendarDate(e.data || '') || (e.data || '');
        const nota = (e.nota || '').trim();
        return `• ${tipo} ${data}${nota ? ` — ${nota}` : ''}`;
    });
    if (entries.length > MAX_REMINDER_ENTRIES) {
        lines.push(`• ...altri ${entries.length - MAX_REMINDER_ENTRIES} eventi da giustificare`);
    }
    return lines.join('\n');
}

function addDaysToISODate(isoDate, days = 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || '')) return null;
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().split('T')[0];
}

// ============= SYNC ENGINE =============

/**
 * Sincronizza compiti su Google Calendar.
 * @param {Array} tasks - Array di compiti da sincronizzare
 * @param {string} calendarId - ID del calendario (default: 'primary')
 * @param {object} auth - Authenticated OAuth2 client (per-user)
 * @param {object|string|null} classSchedule - Orario scolastico per-utente (override del default)
 */
async function syncTasksToCalendar(tasks, calendarId = 'primary', auth, classSchedule = null) {
    const results = { success: true, added: 0, skipped: 0, filtered: 0, errors: [], usedScheduleFallback: false };
    if (!tasks || tasks.length === 0) return results;
    if (!auth) {
        results.success = false;
        results.errors.push('Auth mancante — impossibile sincronizzare');
        return results;
    }

    // Resolve per-user schedule: accepts object or JSON string, falls back to global default
    let resolvedSchedule = ORARIO_SCOLASTICO;
    if (classSchedule) {
        if (typeof classSchedule === 'string') {
            try {
                resolvedSchedule = JSON.parse(classSchedule);
            } catch (e) {
                results.usedScheduleFallback = true;
            }
        } else {
            resolvedSchedule = classSchedule;
        }
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

            const slot = getSlotForTask(materia, calendarDate, resolvedSchedule);
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

/**
 * Crea/aggiorna 2 promemoria giornalieri (18:00 e 21:00) per eventi di presenza non giustificati.
 * @param {object} assenzeData - Struttura risultante da extractAssenzeFromDashboard
 * @param {string} calendarId
 * @param {object} auth - Authenticated OAuth2 client
 * @param {object} options
 */
async function syncUnjustifiedAttendanceReminders(assenzeData, calendarId = 'primary', auth, options = {}) {
    const results = {
        success: true,
        scheduled: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        pending: 0,
        errors: [],
        reminderDate: options.reminderDate || getTodayRomeISODate()
    };
    if (!auth) {
        results.success = false;
        results.errors.push('Auth mancante — impossibile sincronizzare promemoria assenze');
        return results;
    }

    const pendingEntries = extractUnjustifiedAttendance(assenzeData);
    results.pending = pendingEntries.length;

    const reminderHours = Array.isArray(options.reminderHours) && options.reminderHours.length
        ? options.reminderHours
        : [18, 21];

    try {
        const calendar = google.calendar({ version: 'v3', auth });
        const reminderDate = results.reminderDate;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(reminderDate || '')) {
            results.success = false;
            results.errors.push(`Attendance reminder sync error: reminderDate non valido (${reminderDate || 'empty'})`);
            return results;
        }

        // Fetch existing reminders for today before the early-return so we can clean up
        // stale reminders when all absences have been justified (#2, #3).
        // timeMin bounds the scan to today's events, avoiding slow scans over history (#4).
        const existingRes = await calendar.events.list({
            calendarId,
            timeMin: `${reminderDate}T00:00:00Z`,
            maxResults: 50,
            singleEvents: true,
            privateExtendedProperty: [
                'source=g-connect-attendance-reminder',
                `reminderDate=${reminderDate}`
            ]
        });

        const existingBySlot = new Map();
        for (const ev of (existingRes.data.items || [])) {
            const slot = ev?.extendedProperties?.private?.reminderSlot;
            if (slot) existingBySlot.set(String(slot), ev);
        }

        // All absences justified: delete any lingering reminders created earlier today (#2, #3)
        if (pendingEntries.length === 0) {
            for (const [, ev] of existingBySlot) {
                if (ev?.id) {
                    try {
                        await calendar.events.delete({ calendarId, eventId: ev.id });
                        results.deleted++;
                    } catch (delErr) {
                        results.errors.push(`Delete reminder error: ${delErr.message}`);
                    }
                }
            }
            return results;
        }

        const summary = `⚠️ Giustifica assenze/ritardi/uscite (${pendingEntries.length})`;
        const description =
            'Promemoria automatico G-Connect: hai eventi non giustificati su Argo.\n\n' +
            attendanceDescriptionLines(pendingEntries);

        for (const hour of reminderHours) {
            const parsedHour = Number(hour);
            if (!Number.isInteger(parsedHour) || parsedHour < 0 || parsedHour > 23) {
                console.warn('[googleCalendar] Invalid reminder hour, clamped to valid range', { hour });
            }
            const normalizedHour = Math.max(0, Math.min(23, Number.isInteger(parsedHour) ? parsedHour : 18));
            const slotKey = String(hour);
            const startDate = reminderDate;
            const endDate = normalizedHour === 23 ? addDaysToISODate(reminderDate, 1) : reminderDate;
            const endHour = normalizedHour === 23 ? '00' : String(normalizedHour + 1).padStart(2, '0');
            const body = {
                summary,
                description,
                start: { dateTime: `${startDate}T${String(normalizedHour).padStart(2, '0')}:00:00`, timeZone: 'Europe/Rome' },
                end: { dateTime: `${endDate}T${endHour}:00:00`, timeZone: 'Europe/Rome' },
                colorId: '11',
                extendedProperties: {
                    private: {
                        source: 'g-connect-attendance-reminder',
                        reminderDate,
                        reminderSlot: slotKey,
                        pendingCount: String(pendingEntries.length)
                    }
                }
            };

            const existing = existingBySlot.get(slotKey);
            if (existing?.id) {
                await calendar.events.patch({
                    calendarId,
                    eventId: existing.id,
                    requestBody: body
                });
                results.updated++;
            } else {
                await calendar.events.insert({
                    calendarId,
                    requestBody: body
                });
                results.scheduled++;
            }
        }

        return results;
    } catch (e) {
        results.success = false;
        results.errors.push(`Attendance reminder sync error: ${e.message}`);
        return results;
    }
}

// ============= VERIFICHE (UPCOMING TESTS) SYNC =============

/**
 * Sincronizza verifiche/interrogazioni future su Google Calendar.
 * Aggiunge solo eventi non ancora presenti (by argoId or title+date dedup).
 * @param {Array} verifiche - Array di verifiche da extractVerificheFromDashboard
 * @param {string} calendarId
 * @param {object} auth - Authenticated OAuth2 client
 */
async function syncVerificheToCalendar(verifiche, calendarId = 'primary', auth) {
    const results = { success: true, added: 0, skipped: 0, filtered: 0, errors: [] };
    if (!verifiche || verifiche.length === 0) return results;
    if (!auth) {
        results.success = false;
        results.errors.push('Auth mancante — impossibile sincronizzare verifiche');
        return results;
    }

    try {
        const calendar = google.calendar({ version: 'v3', auth });
        const oggi = getOggiRome();

        // Only future verifiche with a valid date
        const toProcess = verifiche.filter(v => {
            const dateStr = v.data || '';
            const d = parseDataArgo(dateStr);
            if (!d || d < oggi) { results.filtered++; return false; }
            return true;
        });
        if (toProcess.length === 0) return results;

        // Fetch existing verifica events from calendar
        const existing = await calendar.events.list({
            calendarId,
            timeMin: oggi.toISOString(),
            maxResults: 2000,
            singleEvents: true,
            privateExtendedProperty: ['source=g-connect-verifica']
        });

        const existingArgoIds = new Set();
        const existingTitleKeys = new Set();
        for (const ev of existing.data.items || []) {
            const argoId = ev.extendedProperties?.private?.argoId;
            if (argoId) existingArgoIds.add(argoId);
            const date = ev.start?.date || ev.start?.dateTime?.split('T')[0] || '';
            existingTitleKeys.add(normalizeTitle(ev.summary || '') + '_' + date);
        }

        for (const v of toProcess) {
            const materia = v.materia ? v.materia.toUpperCase() : 'MATERIA SCONOSCIUTA';
            const text = (v.text || '').trim();
            const calendarDate = toCalendarDate(v.data || '');
            if (!calendarDate) {
                results.errors.push(`${materia}: data non valida (${v.data})`);
                continue;
            }

            let tipoLabel = '';
            if (v.tipo === 'scritta') tipoLabel = ' 📝 scritta';
            else if (v.tipo === 'orale') tipoLabel = ' 🗣 orale';
            else if (v.tipo && v.tipo !== 'unknown') {
                // Log truly unexpected tipo values (not the 'unknown' fallback set by the extractor)
                console.warn('[syncVerificheToCalendar] Unexpected tipo value for verifica:', { tipo: v.tipo, materia, date: v.data });
            }
            const summary = `[VERIFICA ${materia}]${tipoLabel}: ${text || 'Verifica programmata'}`;
            const argoId = generateArgoId(materia, calendarDate, text, 'verifica');

            if (existingArgoIds.has(argoId)) { results.skipped++; continue; }
            const normKey = normalizeTitle(summary) + '_' + calendarDate;
            if (existingTitleKeys.has(normKey)) { results.skipped++; continue; }

            try {
                await calendar.events.insert({
                    calendarId,
                    requestBody: {
                        summary,
                        description: text,
                        start: { date: calendarDate },
                        end: { date: calendarDate },
                        colorId: getColorForSubject(materia),
                        extendedProperties: {
                            private: { argoId, source: 'g-connect-verifica', tipo: v.tipo || 'unknown' }
                        }
                    }
                });
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
        results.errors.push(`Verifiche sync error: ${e.message}`);
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
    syncVerificheToCalendar,
    syncUnjustifiedAttendanceReminders,
    testConnection,
    parseDataArgo,
    getOggiRome
};
