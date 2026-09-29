/**
 * lib/googleCalendar.js
 * Google Calendar sync engine — Universal (per-user OAuth2).
 * Syncs school homework from Argo scraping to any user's Google Calendar.
 */

const crypto = require('crypto');
const { signal, isoDate } = require('./backend');
const { google } = require('googleapis');
const { resolveAttendanceJustification, getSubjectCanonicalName } = require('./helpers');

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

function generateArgoId(materia, data, descrizione = '', slotInizio = '') {
    return crypto.createHash('sha256').update(JSON.stringify([materia, data, descrizione, slotInizio])).digest('hex');
}

// ============= ORARIO SCOLASTICO (Configurable) =============
// Orario definitivo classe 5 D sa (provvisorio / definitivo).
// Lunedì: riposo (nessuna lezione).
// Martedì-Sabato: 4 ore al giorno (08:00–12:00).
// Override via CLASS_SCHEDULE env var with a JSON blob:
//   {"lunedi":[], "martedi":[{"materia":"SCIENZE","inizio":"08:00","fine":"09:00"}], ...}

const DEFAULT_ORARIO_SCOLASTICO = {
    lunedi: [],
    martedi: [
        { materia: 'SCIENZE',        inizio: '08:00', fine: '09:00' },
        { materia: 'SCIENZE',        inizio: '09:00', fine: '10:00' },
        { materia: 'ITALIANO',       inizio: '10:00', fine: '11:00' },
        { materia: 'MATEMATICA',     inizio: '11:00', fine: '12:00' }
    ],
    mercoledi: [
        { materia: 'STORIA',         inizio: '08:00', fine: '09:00' },
        { materia: 'RELIGIONE',      inizio: '09:00', fine: '10:00' },
        { materia: 'ITALIANO',       inizio: '10:00', fine: '11:00' },
        { materia: 'ITALIANO',       inizio: '11:00', fine: '12:00' }
    ],
    giovedi: [
        { materia: 'MATEMATICA',     inizio: '08:00', fine: '09:00' },
        { materia: 'FISICA',         inizio: '09:00', fine: '10:00' },
        { materia: 'INGLESE',        inizio: '10:00', fine: '11:00' },
        { materia: 'INGLESE',        inizio: '11:00', fine: '12:00' }
    ],
    venerdi: [
        { materia: 'SCIENZE MOTORIE',inizio: '08:00', fine: '09:00' },
        { materia: 'ARTE',           inizio: '09:00', fine: '10:00' },
        { materia: 'INFORMATICA',    inizio: '10:00', fine: '11:00' },
        { materia: 'FILOSOFIA',      inizio: '11:00', fine: '12:00' }
    ],
    sabato: [
        { materia: 'STORIA',         inizio: '08:00', fine: '09:00' },
        { materia: 'MATEMATICA',     inizio: '09:00', fine: '10:00' },
        { materia: 'FISICA',         inizio: '10:00', fine: '11:00' },
        { materia: 'SCIENZE',        inizio: '11:00', fine: '12:00' }
    ]
};

let ORARIO_SCOLASTICO = DEFAULT_ORARIO_SCOLASTICO;
try {
    if (process.env.CLASS_SCHEDULE) {
        ORARIO_SCOLASTICO = JSON.parse(process.env.CLASS_SCHEDULE);
        console.log('[googleCalendar] Loaded class schedule from CLASS_SCHEDULE env var.');
    } else {
        console.log('[googleCalendar] CLASS_SCHEDULE env var not set — using default 5D sa schedule.');
    }
} catch (e) {
    console.warn('[googleCalendar] Invalid CLASS_SCHEDULE env var — falling back to default 5D sa schedule:', e.message);
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

    if (!slotGiorno || slotGiorno.length === 0) return null;

    const taskCanonical = typeof getSubjectCanonicalName === 'function' ? getSubjectCanonicalName(materia) : null;
    if (taskCanonical) {
        const canonicalMatch = slotGiorno.find(s => {
            const slotCanonical = typeof getSubjectCanonicalName === 'function' ? getSubjectCanonicalName(s.materia) : null;
            return slotCanonical && slotCanonical.toLowerCase() === taskCanonical.toLowerCase();
        });
        if (canonicalMatch) return canonicalMatch;
    }

    const m = (materia || '').toUpperCase().trim();
    const exactMatch = slotGiorno.find(s => (s.materia || '').toUpperCase().trim() === m);
    if (exactMatch) return exactMatch;

    return slotGiorno.find(s => {
        const sm = (s.materia || '').toUpperCase().trim();
        const isMotorieTask = m.includes('MOTOR') || m.includes('SPORT') || m.includes('GINNAS');
        const isMotorieSlot = sm.includes('MOTOR') || sm.includes('SPORT') || sm.includes('GINNAS');
        if (isMotorieTask !== isMotorieSlot) return false;
        return m.includes(sm) || sm.includes(m);
    }) || null;
}

function toCalendarDate(dateStr) {
    if (typeof dateStr !== 'string') return null;
    if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        return isoDate(`${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`);
    }
    return isoDate(dateStr);
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
async function listEvents(calendar, params) {
    const events = [];
    let pageToken;
    do {
        signal()?.throwIfAborted();
        const { data } = await calendar.events.list({ ...params, pageToken }, requestOptions());
        events.push(...(data.items || []));
        pageToken = data.nextPageToken;
    } while (pageToken);
    return events;
}
function requestOptions() { return { timeout: 15000, signal: signal(), retry: false }; }
function comparable(event) {
    return JSON.stringify([event.summary, event.description, event.start, event.end, event.colorId, event.extendedProperties]);
}
// Reconcile only this application's tagged events. Deterministic Google IDs make
// concurrent/retried inserts idempotent; source IDs allow date/text edits in place.
async function reconcileEvents(desired, source, calendarId, auth, authoritative) {
    const result = { success: true, added: 0, updated: 0, deleted: 0, skipped: 0, errors: [] };
    if (!auth) return { ...result, success: false, errors: ['Auth mancante'] };
    try {
        const calendar = google.calendar({ version: 'v3', auth });
        // Midnight +02 also covers the earliest possible Rome midnight (DST).
        const existing = await listEvents(calendar, { calendarId, timeMin: `${getTodayRomeISODate()}T00:00:00+02:00`,
            maxResults: 2500, singleEvents: true, privateExtendedProperty: [`source=${source}`] });
        const byId = new Map(existing.map(e => [e.extendedProperties?.private?.argoId, e]));
        const retained = new Set();
        for (const body of new Map(desired.map(e => [e.id, e])).values()) {
            signal()?.throwIfAborted();
            const old = byId.get(body.extendedProperties.private.argoId) || existing.find(e =>
                !retained.has(e.id) && e.summary === body.summary &&
                (e.start?.date || e.start?.dateTime?.slice(0,10)) === (body.start.date || body.start.dateTime?.slice(0,10)));
            try {
                if (old) {
                    retained.add(old.id);
                    const { id, ...patch } = body;
                    if (comparable(old) === comparable(patch)) result.skipped++;
                    else { await calendar.events.patch({calendarId,eventId:old.id,requestBody:patch},requestOptions()); result.updated++; }
                } else {
                    retained.add(body.id);
                    try { await calendar.events.insert({calendarId,requestBody:body},requestOptions()); result.added++; }
                    catch (e) {
                        if (Number(e.code || e.response?.status) !== 409) throw e;
                        const {id,...patch} = body;
                        await calendar.events.patch({calendarId,eventId:id,requestBody:patch},requestOptions()); result.updated++;
                    }
                }
            } catch (e) { result.errors.push(e.message); }
        }
        // Never delete after an incomplete update or a caller-provided partial list.
        if (authoritative && !result.errors.length) for (const old of existing) {
            if (!retained.has(old.id)) {
                signal()?.throwIfAborted();
                try { await calendar.events.delete({calendarId,eventId:old.id},requestOptions()); result.deleted++; }
                catch(e) { if (![404,410].includes(Number(e.code || e.response?.status))) result.errors.push(e.message); }
            }
        }
    } catch (e) { result.errors.push(e.message); }
    result.success = result.errors.length === 0;
    return result;
}
async function syncTasksToCalendar(tasks, calendarId = 'primary', auth, classSchedule = null, options = {}) {
    let schedule = classSchedule || ORARIO_SCOLASTICO;
    let usedScheduleFallback = false;
    if (typeof schedule === 'string') try { schedule = JSON.parse(schedule); }
    catch { schedule = ORARIO_SCOLASTICO; usedScheduleFallback = true; }
    const desired = [];
    let filtered = 0;
    for (const task of tasks || []) {
        const date = toCalendarDate(task.due_date || task.datCompito || task.dataConsegna);
        if (!date || date < getTodayRomeISODate()) { filtered++; continue; }
        const materia = String(task.materia || task.subject || 'COMPITO');
        const description = String(task.text || task.desCompito || task.compito || '');
        const slot = getSlotForTask(materia,date,schedule);
        const argoId = task.source_id || task.id
            ? generateArgoId('task',String(task.source_id || task.id))
            : generateArgoId(materia,date,description);
        desired.push({ id: generateArgoId('g-connect-sync',argoId), summary:`[${materia.toUpperCase()}]: ${description}`,
            description, start:slot ? {dateTime:`${date}T${slot.inizio}:00`,timeZone:'Europe/Rome'} : {date},
            end:slot ? {dateTime:`${date}T${slot.fine}:00`,timeZone:'Europe/Rome'} : {date:addDaysToISODate(date,1)},
            colorId:getColorForSubject(materia),extendedProperties:{private:{argoId,source:'g-connect-sync'}} });
    }
    return { ...await reconcileEvents(desired,'g-connect-sync',calendarId,auth,options.authoritative === true), filtered, usedScheduleFallback };
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
        if (!isoDate(reminderDate)) {
            results.success = false;
            results.errors.push(`Attendance reminder sync error: reminderDate non valido (${reminderDate || 'empty'})`);
            return results;
        }

        // Fetch existing reminders for today before the early-return so we can clean up
        // stale reminders when all absences have been justified (#2, #3).
        // timeMin bounds the scan to today's events, avoiding slow scans over history (#4).
        const existingEvents = await listEvents(calendar, {
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
        for (const ev of existingEvents) {
            const slot = ev?.extendedProperties?.private?.reminderSlot;
            if (slot) existingBySlot.set(String(slot), ev);
        }

        // All absences justified: delete any lingering reminders created earlier today (#2, #3)
        if (pendingEntries.length === 0) {
            for (const ev of existingEvents) {
                if (ev?.id) {
                    try {
                        await calendar.events.delete({ calendarId, eventId: ev.id }, requestOptions());
                        results.deleted++;
                    } catch (delErr) {
                        results.errors.push(`Delete reminder error: ${delErr.message}`);
                    }
                }
            }
            results.success = results.errors.length === 0;
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
            const slotKey = String(normalizedHour);
            const startDate = reminderDate;
            const endDate = normalizedHour === 23 ? addDaysToISODate(reminderDate, 1) : reminderDate;
            const endHour = normalizedHour === 23 ? '00' : String(normalizedHour + 1).padStart(2, '0');
            signal()?.throwIfAborted();
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
                }, requestOptions());
                results.updated++;
            } else {
                const id = generateArgoId('attendance',reminderDate,slotKey);
                try {
                    await calendar.events.insert({calendarId,requestBody:{id,...body}},requestOptions());
                    results.scheduled++;
                } catch(e) {
                    if (Number(e.code || e.response?.status) !== 409) throw e;
                    await calendar.events.patch({calendarId,eventId:id,requestBody:body},requestOptions());
                    results.updated++;
                }
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
async function syncVerificheToCalendar(verifiche, calendarId = 'primary', auth, options = {}) {
    const desired = [];
    let filtered = 0;
    for (const v of verifiche || []) {
        const date = toCalendarDate(v.data);
        if (!date || date < getTodayRomeISODate()) { filtered++; continue; }
        const materia = String(v.materia || 'MATERIA SCONOSCIUTA').toUpperCase();
        const description = String(v.text || '').trim();
        const argoId = v.id ? generateArgoId('verifica',String(v.id)) : generateArgoId(materia,date,description,'verifica');
        const label = v.tipo === 'scritta' ? ' 📝 scritta' : v.tipo === 'orale' ? ' 🗣 orale' : '';
        desired.push({id:generateArgoId('g-connect-verifica',argoId),summary:`[VERIFICA ${materia}]${label}: ${description || 'Verifica programmata'}`,
            description,start:{date},end:{date:addDaysToISODate(date,1)},colorId:getColorForSubject(materia),
            extendedProperties:{private:{argoId,source:'g-connect-verifica',tipo:v.tipo || 'unknown'}}});
    }
    return {...await reconcileEvents(desired,'g-connect-verifica',calendarId,auth,options.authoritative === true),filtered};
}

module.exports = {
    syncTasksToCalendar,
    syncVerificheToCalendar,
    syncUnjustifiedAttendanceReminders,
    parseDataArgo,
    getOggiRome, generateArgoId, listEvents
};
