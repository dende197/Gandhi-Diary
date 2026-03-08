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
        throw new Error('Google Calendar env vars mancanti (GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY)');
    }

    // Robust handling of private key (for Vercel/Docker/Local)
    privateKey = privateKey
        .replace(/\\n/g, '\n')      // replace literal \n with real newline
        .replace(/^"(.*)"$/, '$1')   // remove surrounding double quotes
        .replace(/^'(.*)'$/, '$1')   // remove surrounding single quotes
        .trim();

    return new google.auth.JWT(
        email,
        null,
        privateKey,
        ['https://www.googleapis.com/auth/calendar']
    );
}

const calendar = google.calendar('v3');

// ============= ANTI-DUPLICATE CHECK =============

/**
 * Checks if an event with the exact same title already exists on the given date.
 */
async function eventExists(title, dateStr) {
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    const auth = getAuth();

    try {
        const res = await calendar.events.list({
            auth,
            calendarId,
            timeMin: `${dateStr}T00:00:00Z`,
            timeMax: `${dateStr}T23:59:59Z`,
            singleEvents: true,
            maxResults: 10,
            q: title.substring(0, 50)
        });

        const events = res.data.items || [];
        return events.some(e => e.summary && e.summary.trim() === title.trim());
    } catch (e) {
        console.error('eventExists check error:', e.message);
        throw e; // throw so we can see the real error in the response
    }
}

// ============= ADD EVENT =============

async function addEventToCalendar(compito) {
    const { materia, descrizione, data_scadenza, note } = compito;
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    const auth = getAuth();

    if (!data_scadenza || !descrizione) {
        return { status: 'error', detail: 'Dati mancanti (data_scadenza o descrizione)' };
    }

    let dateStr = data_scadenza;
    if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
    if (dateStr.includes(' ')) dateStr = dateStr.split(' ')[0];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return { status: 'error', detail: `Formato data non valido: ${data_scadenza}` };
    }

    const title = `[${(materia || 'COMPITO').toUpperCase()}]: ${descrizione}`;

    try {
        const exists = await eventExists(title, dateStr);
        if (exists) {
            return { status: 'skipped', detail: `Già presente: ${title.substring(0, 40)}...` };
        }

        const event = {
            summary: title,
            description: note || descrizione,
            start: { date: dateStr },
            end: { date: dateStr },
            colorId: getColorForSubject(materia),
            reminders: {
                useDefault: false,
                overrides: [{ method: 'popup', minutes: 720 }] // 12h
            }
        };

        await calendar.events.insert({
            auth,
            calendarId,
            requestBody: event
        });

        return { status: 'added', detail: `Aggiunto: ${title.substring(0, 40)}` };

    } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        console.error('addEventToCalendar error:', msg);
        return { status: 'error', detail: msg };
    }
}

// ============= BATCH SYNC =============

async function syncTasksToCalendar(tasks) {
    const results = { success: true, added: 0, skipped: 0, errors: [] };

    if (!tasks || tasks.length === 0) return results;

    // Limit to 20 for testing to avoid huge responses/timeouts
    const tasksToProcess = tasks.slice(0, 20);

    for (const task of tasksToProcess) {
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
            else results.errors.push(`${compito.materia}: ${result.detail}`);
        } catch (e) {
            results.errors.push(`${compito.materia}: ${e.message}`);
        }
    }

    results.success = results.errors.length === 0;
    return results;
}

// ============= TEST CONNECTION =============

async function testConnection() {
    try {
        const auth = getAuth();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        console.log('--- Testing Google Auth ---');
        // Force token refresh to verify credentials
        const token = await auth.getAccessToken();
        console.log('✅ Auth Token generated successfully');

        const res = await calendar.calendarList.get({ auth, calendarId });
        console.log('✅ Google Calendar connected:', res.data.summary);
        return { success: true, calendar: res.data.summary };
    } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        console.error('❌ Google Calendar test failed:', msg);
        return { success: false, error: msg };
    }
}

module.exports = {
    addEventToCalendar,
    syncTasksToCalendar,
    testConnection,
    getCalendarClient
};
