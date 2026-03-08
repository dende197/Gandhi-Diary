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

let calendarClient = null;

function getCalendarClient() {
    if (calendarClient) return calendarClient;

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    if (!email || !privateKey || !calendarId) {
        throw new Error('Google Calendar env vars mancanti (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_CALENDAR_ID)');
    }

    // Vercel stores \n as literal backslash-n in env vars, fix it
    privateKey = privateKey.replace(/\\n/g, '\n');

    const auth = new google.auth.JWT(
        email,
        null,
        privateKey,
        ['https://www.googleapis.com/auth/calendar']
    );

    calendarClient = google.calendar({ version: 'v3', auth });
    return calendarClient;
}

// ============= ANTI-DUPLICATE CHECK =============

/**
 * Checks if an event with the exact same title already exists on the given date.
 * @param {string} title - Event title to check
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<boolean>} true if duplicate exists
 */
async function eventExists(title, dateStr) {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    try {
        const res = await calendar.events.list({
            calendarId,
            timeMin: `${dateStr}T00:00:00Z`,
            timeMax: `${dateStr}T23:59:59Z`,
            singleEvents: true,
            q: title.substring(0, 50) // use first 50 chars as search query
        });

        const events = res.data.items || [];
        return events.some(e => e.summary && e.summary.trim() === title.trim());
    } catch (e) {
        console.error('eventExists check error:', e.message);
        return false; // on error, try to insert anyway
    }
}

// ============= ADD EVENT =============

/**
 * Add a single homework event to Google Calendar.
 * @param {Object} compito - { materia, descrizione, data_scadenza, note }
 * @returns {Promise<{status: 'added'|'skipped'|'error', detail?: string}>}
 */
async function addEventToCalendar(compito) {
    const { materia, descrizione, data_scadenza, note } = compito;

    if (!data_scadenza || !descrizione) {
        return { status: 'error', detail: 'Dati mancanti (data_scadenza o descrizione)' };
    }

    // Normalize date to YYYY-MM-DD
    let dateStr = data_scadenza;
    if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
    if (dateStr.includes(' ')) dateStr = dateStr.split(' ')[0];

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return { status: 'error', detail: `Formato data non valido: ${data_scadenza}` };
    }

    const title = `[${(materia || 'COMPITO').toUpperCase()}]: ${descrizione}`;

    try {
        // Anti-duplicate check
        const exists = await eventExists(title, dateStr);
        if (exists) {
            return { status: 'skipped', detail: `Già presente: ${title.substring(0, 60)}...` };
        }

        const calendar = getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        const event = {
            summary: title,
            description: note || descrizione,
            start: {
                date: dateStr // all-day event
            },
            end: {
                date: dateStr
            },
            colorId: getColorForSubject(materia),
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 60 * 12 } // reminder 12h before
                ]
            }
        };

        await calendar.events.insert({
            calendarId,
            requestBody: event
        });

        return { status: 'added', detail: `Aggiunto: ${title.substring(0, 60)}` };

    } catch (e) {
        console.error('addEventToCalendar error:', e.message);
        return { status: 'error', detail: e.message };
    }
}

// ============= BATCH SYNC =============

/**
 * Sync an array of homework tasks to Google Calendar.
 * @param {Array} tasks - Array from extractHomeworkFromDashboard()
 * @returns {Promise<{success: boolean, added: number, skipped: number, errors: Array}>}
 */
async function syncTasksToCalendar(tasks) {
    const results = { success: true, added: 0, skipped: 0, errors: [] };

    if (!tasks || tasks.length === 0) {
        return results;
    }

    for (const task of tasks) {
        const compito = {
            materia: task.materia || task.subject || 'Compito',
            descrizione: task.text || task.desCompito || task.compito || 'Attività scolastica',
            data_scadenza: task.due_date || task.datCompito || task.dataConsegna || '',
            note: task.note || ''
        };

        try {
            const result = await addEventToCalendar(compito);

            if (result.status === 'added') results.added++;
            else if (result.status === 'skipped') results.skipped++;
            else if (result.status === 'error') results.errors.push(result.detail);

        } catch (e) {
            results.errors.push(`${compito.materia}: ${e.message}`);
        }
    }

    if (results.errors.length > 0) {
        results.success = results.added > 0 || results.skipped > 0;
    }

    return results;
}

// ============= TEST CONNECTION =============

async function testConnection() {
    try {
        const calendar = getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;
        const res = await calendar.calendarList.get({ calendarId });
        console.log('✅ Google Calendar connesso:', res.data.summary);
        return { success: true, calendar: res.data.summary };
    } catch (e) {
        console.error('❌ Google Calendar connection failed:', e.message);
        return { success: false, error: e.message };
    }
}

module.exports = {
    addEventToCalendar,
    syncTasksToCalendar,
    testConnection,
    getCalendarClient
};
