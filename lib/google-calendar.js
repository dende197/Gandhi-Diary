/**
 * Google Calendar Service — G-Connect Backend
 * Gestisce la sincronizzazione dei compiti scolastici con Google Calendar.
 *
 * Funzionalità:
 * - OAuth2 flow (authorization URL, token exchange, refresh)
 * - Creazione eventi nel giorno di scadenza (all-day events)
 * - Deduplicazione tramite extendedProperties (g_connect_id)
 * - Listing eventi futuri
 */

const { google } = require('googleapis');
const crypto = require('crypto');

// ============= CONSTANTS =============
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const ENCRYPTION_ALG = 'aes-256-cbc';
const G_CONNECT_SOURCE_KEY = 'g_connect_source';
const G_CONNECT_ID_KEY = 'g_connect_id';
const G_CONNECT_SOURCE_VALUE = 'g-connect-school';

// ============= OAUTH2 CLIENT FACTORY =============

/**
 * Crea e ritorna un client OAuth2 di Google configurato con le variabili d'ambiente.
 */
function createOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Google OAuth2 env vars mancanti (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)');
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Genera l'URL di autorizzazione Google OAuth2.
 * @param {string} state - Parametro di stato (es. profile_id codificato in base64)
 */
function getAuthUrl(state) {
    const oauth2Client = createOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // Forza il refresh_token anche se già autorizzato
        scope: SCOPES,
        state
    });
}

/**
 * Scambia il codice di autorizzazione con i token di accesso e refresh.
 * @param {string} code - Codice di autorizzazione da Google
 * @returns {Object} token - { access_token, refresh_token, expiry_date, ... }
 */
async function exchangeCodeForTokens(code) {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

/**
 * Costruisce un client OAuth2 autenticato dai token salvati.
 * Aggiorna automaticamente l'access_token se scaduto.
 * @param {Object} storedTokens - { access_token, refresh_token, expiry_date }
 * @returns {google.auth.OAuth2}
 */
function buildAuthClient(storedTokens) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
        access_token: storedTokens.access_token,
        refresh_token: storedTokens.refresh_token,
        expiry_date: storedTokens.expiry_date
    });

    // Aggiorna i token automaticamente quando scadono
    oauth2Client.on('tokens', (tokens) => {
        storedTokens.access_token = tokens.access_token;
        if (tokens.refresh_token) {
            storedTokens.refresh_token = tokens.refresh_token;
        }
        if (tokens.expiry_date) {
            storedTokens.expiry_date = tokens.expiry_date;
        }
    });

    return oauth2Client;
}

// ============= ENCRYPTION UTILS =============
// Per proteggere le credenziali Argo salvate in DB per la sincronizzazione automatica

/**
 * Cifra un testo con AES-256-CBC usando CALENDAR_ENCRYPTION_KEY dall'env.
 * @param {string} plaintext
 * @returns {string} "iv:ciphertext" hex-encoded
 */
function encryptCredentials(plaintext) {
    const key = process.env.CALENDAR_ENCRYPTION_KEY;
    if (!key || key.length < 32) throw new Error('CALENDAR_ENCRYPTION_KEY mancante o troppo corta (min 32 caratteri)');
    const keyBuf = Buffer.from(key.substring(0, 32), 'utf8');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALG, keyBuf, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decifra un testo cifrato con encryptCredentials.
 * @param {string} ciphertext - "iv:ciphertext" hex-encoded
 * @returns {string} plaintext
 */
function decryptCredentials(ciphertext) {
    const key = process.env.CALENDAR_ENCRYPTION_KEY;
    if (!key || key.length < 32) throw new Error('CALENDAR_ENCRYPTION_KEY mancante o troppo corta (min 32 caratteri)');
    const keyBuf = Buffer.from(key.substring(0, 32), 'utf8');
    const [ivHex, encryptedHex] = ciphertext.split(':');
    if (!ivHex || !encryptedHex) throw new Error('Formato ciphertext non valido');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALG, keyBuf, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ============= CALENDAR OPERATIONS =============

/**
 * Controlla se un evento con il dato g_connect_id esiste già nel calendario.
 * @param {google.auth.OAuth2} auth
 * @param {string} calendarId
 * @param {string} gConnectId
 * @returns {boolean}
 */
async function eventExists(auth, calendarId, gConnectId) {
    const calendar = google.calendar({ version: 'v3', auth });
    try {
        const res = await calendar.events.list({
            calendarId,
            privateExtendedProperty: `${G_CONNECT_ID_KEY}=${gConnectId}`,
            maxResults: 1,
            showDeleted: false,
            singleEvents: true
        });
        return (res.data.items || []).length > 0;
    } catch (e) {
        console.error(`[GCal] Errore verifica duplicato (${gConnectId}):`, e.message);
        return false; // In caso di errore, permetti l'inserimento
    }
}

/**
 * Crea un evento nel Google Calendar per un compito scolastico.
 * @param {google.auth.OAuth2} auth
 * @param {string} calendarId - ID del calendario (default 'primary')
 * @param {Object} task - { id, subject, text, due_date, materia, notes }
 * @returns {Object|null} Evento creato o null in caso di duplicato/errore
 */
async function createSchoolEvent(auth, calendarId, task) {
    const calendar = google.calendar({ version: 'v3', auth });

    // Normalizza la data (formato: YYYY-MM-DD oppure DD/MM/YYYY)
    const dateStr = normalizeDateForCalendar(task.due_date || task.datCompito);
    if (!dateStr) {
        console.warn(`[GCal] Data non valida per task ${task.id}: ${task.due_date}`);
        return null;
    }

    const subject = task.subject || task.materia || 'Scolastico';
    const description = task.text || task.desCompito || '';
    const notes = task.notes || '';

    // Genera un ID stabile basato su soggetto + testo + data
    const gConnectId = task.id || generateTaskId(subject, description, dateStr);

    // Controlla duplicato
    const exists = await eventExists(auth, calendarId, gConnectId);
    if (exists) {
        return null; // Già presente, evita duplicato
    }

    const summary = `[${subject.toUpperCase()}] ${description.substring(0, 100)}`;
    const fullDescription = [
        `📚 Materia: ${subject}`,
        `📝 Compito: ${description}`,
        notes ? `📌 Note: ${notes}` : null,
        `🤖 Sincronizzato da G-Connect`
    ].filter(Boolean).join('\n');

    const event = {
        summary,
        description: fullDescription,
        start: { date: dateStr },
        end: { date: dateStr },
        colorId: subjectToColorId(subject),
        extendedProperties: {
            private: {
                [G_CONNECT_ID_KEY]: gConnectId,
                [G_CONNECT_SOURCE_KEY]: G_CONNECT_SOURCE_VALUE,
                g_connect_subject: subject
            }
        }
    };

    try {
        const res = await calendar.events.insert({ calendarId, resource: event });
        return res.data;
    } catch (e) {
        console.error(`[GCal] Errore creazione evento (${gConnectId}):`, e.message);
        return null;
    }
}

/**
 * Sincronizza una lista di task scolastici con Google Calendar.
 * Evita duplicati, salta le date passate di oltre 1 giorno.
 * @param {Object} storedTokens - Token OAuth2 salvati
 * @param {string} calendarId - ID del calendario
 * @param {Array} tasks - Array di task scolastici
 * @returns {{ created: number, skipped: number, errors: number }}
 */
async function syncTasksToCalendar(storedTokens, calendarId, tasks) {
    const auth = buildAuthClient(storedTokens);
    const stats = { created: 0, skipped: 0, errors: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const task of tasks) {
        try {
            const dateStr = normalizeDateForCalendar(task.due_date || task.datCompito);
            if (!dateStr) { stats.skipped++; continue; }

            // Salta task scadute da più di 1 giorno (permette oggi e ieri per evitare
            // di perdere task assegnate nella giornata precedente non ancora sincronizzate)
            const taskDate = new Date(dateStr);
            const daysDiff = (taskDate - today) / (1000 * 60 * 60 * 24);
            if (daysDiff < -1) { stats.skipped++; continue; }

            const result = await createSchoolEvent(auth, calendarId || 'primary', task);
            if (result === null) {
                stats.skipped++; // Duplicato o errore gestito
            } else {
                stats.created++;
            }
        } catch (e) {
            console.error(`[GCal] Errore sync task ${task.id}:`, e.message);
            stats.errors++;
        }
    }

    // Ritorna i token aggiornati (potrebbe essere avvenuto un refresh)
    const updatedCredentials = auth.credentials;
    return { stats, updatedTokens: updatedCredentials };
}

/**
 * Recupera gli eventi futuri di G-Connect dal calendario.
 * @param {Object} storedTokens
 * @param {string} calendarId
 * @returns {Array} Lista eventi
 */
async function listCalendarEvents(storedTokens, calendarId) {
    const auth = buildAuthClient(storedTokens);
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date().toISOString();

    try {
        const res = await calendar.events.list({
            calendarId: calendarId || 'primary',
            timeMin: now,
            privateExtendedProperty: `${G_CONNECT_SOURCE_KEY}=${G_CONNECT_SOURCE_VALUE}`,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 100
        });
        return res.data.items || [];
    } catch (e) {
        console.error('[GCal] Errore listing eventi:', e.message);
        return [];
    }
}

// ============= HELPER FUNCTIONS =============

/**
 * Normalizza una data nel formato YYYY-MM-DD richiesto da Google Calendar.
 * Accetta: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
 */
function normalizeDateForCalendar(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).trim();

    // Già in formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // Formato DD/MM/YYYY o DD-MM-YYYY
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
        const day = m[1].padStart(2, '0');
        const month = m[2].padStart(2, '0');
        const year = m[3];
        return `${year}-${month}-${day}`;
    }

    return null;
}

/**
 * Genera un ID stabile per un task scolastico.
 */
function generateTaskId(subject, text, dateStr) {
    const raw = `${subject}-${text}-${dateStr}`.toLowerCase().replace(/\s+/g, '');
    return crypto.createHash('md5').update(raw).digest('hex').substring(0, 12);
}

/**
 * Mappa la materia scolastica a un colore Google Calendar (colorId 1-11).
 */
function subjectToColorId(subject) {
    const s = (subject || '').toUpperCase();
    const map = {
        MATEMATICA: '11', // Tomato
        FISICA: '11',
        SCIENZE: '2',     // Sage
        BIOLOGIA: '2',
        CHIMICA: '2',
        ITALIANO: '5',    // Banana
        STORIA: '5',
        FILOSOFIA: '5',
        INGLESE: '7',     // Peacock
        FRANCESE: '7',
        TEDESCO: '7',
        SPAGNOLO: '7',
        ARTE: '6',        // Tangerine
        DISEGNO: '6',
        MUSICA: '6',
        INFORMATICA: '9', // Blueberry
        TECNOLOGIA: '9',
        LATINO: '3',      // Grape
        GRECO: '3',
        RELIGIONE: '10',  // Basil
        EDUCAZIONE: '4'   // Flamingo
    };

    for (const [key, color] of Object.entries(map)) {
        if (s.includes(key)) return color;
    }
    return '8'; // Graphite (default)
}

module.exports = {
    getAuthUrl,
    exchangeCodeForTokens,
    buildAuthClient,
    encryptCredentials,
    decryptCredentials,
    eventExists,
    createSchoolEvent,
    syncTasksToCalendar,
    listCalendarEvents,
    normalizeDateForCalendar,
    generateTaskId
};
