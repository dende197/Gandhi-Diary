const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const crypto = require('crypto');
const cheerio = require('cheerio');
const {
    debugLog, isValidName, normalizeClass, safeData,
    buildName, createHeaders, USER_AGENT, ENDPOINT,
    generateStableId, generatePid, CLASS_REGEX, DEBUG_MODE, resolveAttendanceJustification,
    detectTrack, parseClassDetails, getSubjectCanonicalName, detectSubjectFromText
} = require('./helpers');
const { getSupabase } = require('./supabase');

const CHALLENGE_URL = 'https://auth.portaleargo.it/oauth2/auth';
const LOGIN_URL = 'https://www.portaleargo.it/auth/sso/login';
const TOKEN_URL = 'https://auth.portaleargo.it/oauth2/token';
const REDIRECT_URI = 'it.argosoft.didup.famiglia.new://login-callback';
const CLIENT_ID = '72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c';

// ============= PKCE HELPERS =============

// Private helpers for identity validation across resolveIdentity* functions
function _isValidIdentity(s) {
    if (!s) return false;
    const t = s.toUpperCase();
    return t.length >= 3 && !/PASSWORD|RECUPERA|CAMBIA|LOGOUT|ESC|ACCEDI|REGISTRA|MENU|CERCA/i.test(t);
}
function _cleanIdentity(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('hex');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest()
        .toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

// ============= ARGO LOGIN =============

class AdvancedArgo {
    static async rawLogin(school, username, password) {
        try {
            const jar = new CookieJar();
            const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 30000 }));

            const CODE_VERIFIER = generateCodeVerifier();
            const CODE_CHALLENGE = generateCodeChallenge(CODE_VERIFIER);
            const STATE = generateState();

            const challengeParams = new URLSearchParams({
                redirect_uri: REDIRECT_URI,
                client_id: CLIENT_ID,
                response_type: 'code',
                prompt: 'login',
                state: STATE,
                scope: 'openid offline profile user.roles argo',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'S256'
            });

            debugLog('PKCE: Richiesta Challenge...');
            const reqChallenge = await client.get(`${CHALLENGE_URL}?${challengeParams.toString()}`);

            const finalUrl = reqChallenge.request?.res?.responseUrl || reqChallenge.config.url || '';
            let loginChallenge = null;
            const matchChallenge = finalUrl.match(/login_challenge=([0-9a-f]+)/);

            if (matchChallenge) {
                loginChallenge = matchChallenge[1];
            } else if (reqChallenge.data) {
                try {
                    const $ = cheerio.load(reqChallenge.data);
                    const hidden = $('input[name="challenge"]').val();
                    if (hidden) loginChallenge = hidden;
                } catch (_) { }
            }

            if (!loginChallenge) throw new Error('Login challenge non trovata (URL/HTML)');

            const loginBody = new URLSearchParams();
            loginBody.append('challenge', loginChallenge);
            loginBody.append('client_id', CLIENT_ID);
            loginBody.append('prefill', 'true');
            loginBody.append('famiglia_customer_code', school);
            loginBody.append('username', username);
            loginBody.append('password', password);
            loginBody.append('login', 'true');

            const reqLogin = await client.post(LOGIN_URL, loginBody, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 0,
                validateStatus: () => true
            });

            let location = reqLogin.headers['location'];
            if (!location && reqLogin.data) {
                try {
                    const $ = cheerio.load(reqLogin.data);
                    location = $('a[href*="code="]').attr('href') || null;
                    if (!location) {
                        const meta = $('meta[http-equiv="refresh"]').attr('content') || '';
                        const m = meta.match(/url=(.+)$/i);
                        if (m) location = m[1];
                    }
                } catch (_) { }
            }
            if (!location) throw new Error('Credenziali errate o scuola non valida (No Location header)');

            let code = null;
            for (let loopCount = 0; loopCount < 10 && location; loopCount++) {
                const codeMatch = location.match(/code=([0-9a-zA-Z-_.]+)/);
                if (codeMatch) { code = codeMatch[1]; break; }
                const reqRedirect = await client.get(location, { maxRedirects: 0, validateStatus: () => true });
                location = reqRedirect.headers['location'];
            }

            if (!code) throw new Error('Auth code non trovato dopo i redirect');

            const tokenBody = new URLSearchParams();
            tokenBody.append('code', code);
            tokenBody.append('grant_type', 'authorization_code');
            tokenBody.append('redirect_uri', REDIRECT_URI);
            tokenBody.append('code_verifier', CODE_VERIFIER);
            tokenBody.append('client_id', CLIENT_ID);

            const tokenRes = await client.post(TOKEN_URL, tokenBody);
            const accessToken = tokenRes.data.access_token;
            if (!accessToken) throw new Error('No access_token in response');

            const argoLoginHeaders = {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken,
                'Accept': 'application/json'
            };

            const payload = {
                clientID: crypto.randomBytes(32).toString('hex'),
                'lista-x-auth-token': [],
                'x-auth-token-corrente': null,
                'lista-opzioni-notifiche': {}
            };

            const argoResp = await axios.post(ENDPOINT + 'login', payload, {
                headers: argoLoginHeaders,
                timeout: 30000
            });

            const soggetti = argoResp.data.data || [];

            const profiles = soggetti.map((sog, idx) => {
                const alunno = sog.alunno || sog;

                const rawName = buildName(alunno) || '';

                let rawClass = alunno.desClasse || alunno.classe || alunno.codiceClasse ||
                    sog.desClasse || sog.classe || '';
                rawClass = rawClass.trim().toUpperCase();

                const rawSezione = alunno.desSezione || alunno.sezione || sog.desSezione || sog.sezione || '';
                const rawCorso = alunno.desCorso || alunno.corso || sog.desCorso || sog.corso || '';

                const classDetails = parseClassDetails(rawClass, { section: rawSezione, course: rawCorso });
                const finalClass = classDetails?.formatted || normalizeClass(rawClass, { section: rawSezione, course: rawCorso }) || rawClass || 'N/D';

                const subjectId = sog.idSoggetto || sog.prgSoggetto || sog.prgAlunno ||
                    sog.idAlunno || sog.pk || sog.id ||
                    alunno.pk || alunno.prgAlunno || alunno.idAlunno || alunno.id || null;

                return {
                    index: idx,
                    name: rawName,
                    class: finalClass,
                    specialization: classDetails?.track || null,
                    school: (sog.codMin || sog.codiceScuola || school || '').trim().toUpperCase(),
                    username: (sog.username || username || '').trim().toLowerCase(),
                    token: sog.token || '',
                    idSoggetto: subjectId,
                    raw: sog
                };
            });

            return { access_token: accessToken, profiles, jar };

        } catch (e) {
            const status = e.response?.status;
            const data = e.response?.data;
            debugLog('❌ Errore Raw Login', {
                message: e.message,
                status: status,
                data: typeof data === 'string' ? data.substring(0, 500) : data
            });
            if (status === 403) {
                const err = new Error('Accesso negato da Argo (403). Possibile blocco di sicurezza o rate-limit.');
                err.status = 403;
                throw err;
            }
            throw e;
        }
    }
}

// ============= DASHBOARD =============
const DASHBOARD_OPTIONS = {
    // ── Official Argo DidUp uppercase flags (mandatory for Argo API backend) ──
    COMPITI_ASSEGNATI: true,
    ARGOMENTI_LEZIONE: true,
    ASSENZE_PER_DATA: true,
    VALUTAZIONI_GIORNALIERE: true,
    VALUTAZIONI_PERIODICHE: true,
    PROMEMORIA_CLASSE: true,
    DOCENTI_CLASSE: true,
    ORARIO_SCOLASTICO: true,
    NOTE_DISCIPLINARI: true,
    GIUSTIFICAZIONI_ASSENZE: true,
    VOTI_GIUDIZI: true,
    CONSIGLIO_DI_CLASSE: true,
    PAGELLE_ONLINE: true,
    PRENOTAZIONE_ALUNNI: true,
    TASSE_SCOLASTICHE: true,
    RENDI_VISIBILE_CURRICULUM: true,

    // ── Additional lowercase / camelCase compatibility flags ──
    votiGiornalieri: true,
    votiScrutinio: true,
    compiti: true,
    argomenti: true,
    attivita: true,
    promemoria: true,
    bacheca: true,
    noteDisciplinari: true,
    assenze: true,
    votiPeriodici: true,
    appello: true,
    prenotazioniAlunni: true,
    registro: true
};

const HOMEWORK_LIKE_ACTIVITY_PATTERN = /compit|consegn|da\s+fare|per\s+casa|studiare|esercizi?|homework|lettura|leggere|tav\.\s*\d+|ripass|svolgere|completare|esercitazione|scheda/i;

const DEFAULT_DASHBOARD_LOOKBACK_DAYS = 300;
const DEFAULT_DASHBOARD_MAX_LOOKBACK_DAYS = 3650;
const DEFAULT_DASHBOARD_BACKFILL_STEP_DAYS = 180;
const DEFAULT_DASHBOARD_MAX_REQUESTS = 12;
// If a single dashboard batch is near 500 entries, Argo responses are often truncated.
// Use backfill when we are close to that boundary.
const DASHBOARD_BACKFILL_MIN_BATCH = 450;
const PROFILE_PRG_KEY_PATTERN = /(prg.*(soggett|alunn|profil))|((soggett|alunn|profil).*prg)/;
const MAX_PROFILE_COLLECTION_DEPTH = 3;

function formatDashboardDateTime(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().replace('T', ' ').substring(0, 19);
}

function normalizeDashboardDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const raw = String(value || '').trim();
    if (!raw) return '';

    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];

    const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\b|$)/);
    if (dmy) {
        const day = dmy[1].padStart(2, '0');
        const month = dmy[2].padStart(2, '0');
        const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
        return `${year}-${month}-${day}`;
    }

    const monthMap = {
        gen: '01', gennaio: '01',
        feb: '02', febbraio: '02',
        mar: '03', marzo: '03',
        apr: '04', aprile: '04',
        mag: '05', maggio: '05',
        giu: '06', giugno: '06',
        lug: '07', luglio: '07',
        ago: '08', agosto: '08',
        set: '09', sett: '09', settembre: '09',
        ott: '10', ottobre: '10',
        nov: '11', novembre: '11',
        dic: '12', dicembre: '12'
    };
    const lower = raw.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
    const italianTextDate = lower.match(/^(\d{1,2})\s+([a-zàèéìòù]+)\s+(\d{4})(?:\b|$)/);
    if (italianTextDate) {
        const day = italianTextDate[1].padStart(2, '0');
        const month = monthMap[italianTextDate[2]];
        const year = italianTextDate[3];
        if (month) return `${year}-${month}-${day}`;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return raw.split('T')[0].split(' ')[0];
}

function extractDashboardDati(payload) {
    return payload?.data?.dati || payload?.dati || [];
}

function buildDashboardBloccoKey(blocco) {
    const day = normalizeDashboardDate(blocco?.datGiorno || blocco?.data || '');
    if (day) return `day:${day}`;
    return `hash:${generateStableId(JSON.stringify(blocco || {}))}`;
}

function scoreDashboardBlocco(blocco) {
    if (!blocco || typeof blocco !== 'object') return 0;
    let score = 0;
    for (const [k, v] of Object.entries(blocco)) {
        if (Array.isArray(v)) score += v.length * 3;
        else if (v && typeof v === 'object') score += 2;
        else if (String(v || '').trim()) score += 1;
        if (k === 'registro' || k === 'argomenti' || k === 'attivita') score += 3;
    }
    return score;
}

function mergeDashboardDati(lists) {
    const map = new Map();
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const blocco of list) {
            const key = buildDashboardBloccoKey(blocco);
            const existing = map.get(key);
            if (!existing) {
                map.set(key, blocco);
                continue;
            }
            if (scoreDashboardBlocco(blocco) > scoreDashboardBlocco(existing)) {
                map.set(key, blocco);
            }
        }
    }
    const merged = [...map.values()];
    merged.sort((a, b) => {
        const da = normalizeDashboardDate(a?.datGiorno || a?.data || '');
        const db = normalizeDashboardDate(b?.datGiorno || b?.data || '');
        if (!da && !db) return 0;
        if (!da) return -1;
        if (!db) return 1;
        return da.localeCompare(db);
    });
    return merged;
}

function getOldestDashboardDate(datiList) {
    if (!Array.isArray(datiList) || datiList.length === 0) return '';
    let oldest = '';
    for (const blocco of datiList) {
        const d = normalizeDashboardDate(blocco?.datGiorno || blocco?.data || '');
        if (!d) continue;
        if (!oldest || d < oldest) oldest = d;
    }
    return oldest;
}

async function getDashboard(headers, options = {}) {
    const today = new Date();
    // School year in Italy begins September 1st.
    // If today is September 2026, starting from 300 days ago queries back into November 2025 (last school year).
    // Because Argo limits responses to ~500 items, the batch gets filled with old records and truncates
    // before ever reaching September 2026!
    // To ensure the active school year (2026/2027) is ALWAYS captured in the first batch without truncation,
    // calculate days since September 1st of the current school year (with a 15-day buffer into August).
    const syStartYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
    const syStartDate = new Date(syStartYear, 8, 1, 0, 0, 0);
    const daysSinceSyStart = Math.max(30, Math.ceil((today.getTime() - syStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 15);

    const initialLookbackDays = Number.isFinite(Number(options.lookbackDays))
        ? Math.max(1, Number(options.lookbackDays))
        : Math.min(daysSinceSyStart, DEFAULT_DASHBOARD_LOOKBACK_DAYS);

    const maxLookbackDays = Number.isFinite(Number(options.maxLookbackDays))
        ? Math.max(initialLookbackDays, Number(options.maxLookbackDays))
        : DEFAULT_DASHBOARD_MAX_LOOKBACK_DAYS;
    const backfillStepDays = Number.isFinite(Number(options.backfillStepDays))
        ? Math.max(1, Number(options.backfillStepDays))
        : DEFAULT_DASHBOARD_BACKFILL_STEP_DAYS;
    const maxRequests = Number.isFinite(Number(options.maxRequests))
        ? Math.max(1, Number(options.maxRequests))
        : DEFAULT_DASHBOARD_MAX_REQUESTS;
    const shouldBackfill = options.enableBackfill !== false;

    const fetchDashboardFromLookback = async (days) => {
        const startRange = new Date(today);
        startRange.setDate(today.getDate() - days);
        const payload = {
            dataultimoaggiornamento: formatDashboardDateTime(startRange),
            opzioni: JSON.stringify(DASHBOARD_OPTIONS)
        };
        const res = await axios.post(ENDPOINT + 'dashboard/dashboard', payload, { headers, timeout: 25000 });
        return res.data;
    };

    try {
        let currentLookback = initialLookbackDays;
        const firstPayload = await fetchDashboardFromLookback(currentLookback);
        const batches = [extractDashboardDati(firstPayload)];

        // Diagnostic logging guarded by DEBUG_MODE to avoid noisy/sensitive production logs.
        const dati = batches[0];
        if (DEBUG_MODE) {
            const first = Array.isArray(dati) && dati.length > 0 ? dati[0] : null;
            debugLog('Dashboard payload summary', {
                batchSize: Array.isArray(dati) ? dati.length : 0,
                responseKeys: Object.keys(firstPayload || {}),
                responseDataKeys: firstPayload?.data ? Object.keys(firstPayload.data) : [],
                firstBlockKeys: first ? Object.keys(first) : []
            });
        }

        if (shouldBackfill && dati.length >= DASHBOARD_BACKFILL_MIN_BATCH && maxRequests > 1) {
            let oldestSeen = getOldestDashboardDate(dati);
            let roundsWithoutNewData = 0;
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() - maxLookbackDays);
            const targetOldest = normalizeDashboardDate(targetDate.toISOString());

            for (let requestIdx = 1; requestIdx < maxRequests; requestIdx++) {
                const nextLookback = Math.min(maxLookbackDays, currentLookback + backfillStepDays);
                if (nextLookback <= currentLookback) break;
                currentLookback = nextLookback;

                const payload = await fetchDashboardFromLookback(currentLookback);
                const batch = extractDashboardDati(payload);
                if (!Array.isArray(batch) || batch.length === 0) break;
                batches.push(batch);

                const merged = mergeDashboardDati(batches);
                const oldestNow = getOldestDashboardDate(merged);
                if (!oldestNow) {
                    roundsWithoutNewData++;
                } else if (oldestNow < oldestSeen) {
                    roundsWithoutNewData = 0;
                    oldestSeen = oldestNow;
                } else {
                    roundsWithoutNewData++;
                }

                debugLog('Dashboard backfill step', {
                    requestIdx: requestIdx + 1,
                    lookbackDays: currentLookback,
                    batchSize: batch.length,
                    mergedSize: merged.length,
                    oldestSeen
                });

                if (oldestSeen && oldestSeen <= targetOldest) break;
                if (roundsWithoutNewData >= 2) break;
            }
        }

        const mergedDati = mergeDashboardDati(batches);
        if (firstPayload?.data && typeof firstPayload.data === 'object') {
            return { ...firstPayload, data: { ...firstPayload.data, dati: mergedDati } };
        }
        return { ...firstPayload, dati: mergedDati };
    } catch (e) {
        const status = e.response?.status;
        if (status === 401 || status === 403) {
            debugLog('⚠️ Errore Dashboard auth', { status, message: e.message });
        } else {
            console.error('⚠️ Errore Dashboard', e.message);
        }
        throw e;
    }
}

// ============= GRADE EXTRACTION =============

function extractGradesFromDashboard(dashboardData) {
    const grades = [];
    try {
        const datiList = dashboardData?.data?.dati || dashboardData?.dati || [];
        for (const mainData of datiList) {
            const votiKeys = ['votiGiornalieri', 'votiPeriodici', 'votiScrutinio', 'voti', 'valutazioni'];
            for (const key of votiKeys) {
                const votiRaw = mainData[key];
                if (Array.isArray(votiRaw) && votiRaw.length > 0) {
                    for (const v of votiRaw) {
                        const valore = v.codVoto || v.voto || v.valore || v.desValutazione || '';
                        const materia = v.desMateria || v.materia || v.materiaDes || 'N/D';
                        const data = v.datGiorno || v.data || '';
                        const tipo = v.desVoto || v.tipo || v.codVoto || 'N/D';
                        const stableId = generateStableId(`${materia}-${valore}-${data}`);
                        grades.push({ materia, valore, data, tipo, subject: materia, value: valore, date: data, id: stableId });
                    }
                }
            }
        }
    } catch (e) {
        debugLog('⚠️ Grade extraction fallita', e.message);
    }
    return grades;
}

// ============= HOMEWORK EXTRACTION =============

function parseDateFromText(text, referenceDateOrYear = new Date().getFullYear()) {
    if (!text || typeof text !== 'string') return null;

    let refYear = new Date().getFullYear();
    let refDate = null;
    if (typeof referenceDateOrYear === 'number') {
        refYear = referenceDateOrYear;
    } else if (typeof referenceDateOrYear === 'string') {
        const parsed = new Date(referenceDateOrYear);
        if (!Number.isNaN(parsed.getTime())) {
            refDate = parsed;
            refYear = parsed.getFullYear();
        } else {
            const yr = referenceDateOrYear.match(/^(\d{4})/);
            if (yr) refYear = parseInt(yr[1], 10);
        }
    } else if (referenceDateOrYear instanceof Date && !Number.isNaN(referenceDateOrYear.getTime())) {
        refDate = referenceDateOrYear;
        refYear = referenceDateOrYear.getFullYear();
    }

    const clean = text.trim();
    const lower = clean.toLowerCase();

    // 1. Relative dates: "per domani", "domani", "per dopodomani"
    if (refDate) {
        if (/\b(?:per\s+)?dopodomani\b/i.test(lower)) {
            const d = new Date(refDate);
            d.setDate(d.getDate() + 2);
            return d.toISOString().slice(0, 10);
        }
        if (/\b(?:per\s+)?domani\b/i.test(lower)) {
            const d = new Date(refDate);
            d.setDate(d.getDate() + 1);
            return d.toISOString().slice(0, 10);
        }

        // Italian relative weekdays: "per martedì", "per lunedì prossimo", "consegna mercoledì"
        const weekdayMap = {
            'domenica': 0, 'dom': 0,
            'lunedì': 1, 'lunedi': 1, 'lun': 1,
            'martedì': 2, 'martedi': 2, 'mar': 2,
            'mercoledì': 3, 'mercoledi': 3, 'mer': 3,
            'giovedì': 4, 'giovedi': 4, 'gio': 4,
            'venerdì': 5, 'venerdi': 5, 'ven': 5,
            'sabato': 6, 'sab': 6
        };
        const weekdayOnlyMatch = lower.match(/(?:per\s+(?:il\s+)?|entro\s+(?:il\s+)?|consegna\s+(?:il\s+)?)(?:giorno\s+)?(luned[ìi]|marted[ìi]|mercoled[ìi]|gioved[ìi]|venerd[ìi]|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)(?:\s+prossim[oa])?(?!\s*\d)/i);
        if (weekdayOnlyMatch) {
            const targetWd = weekdayMap[weekdayOnlyMatch[1].toLowerCase()];
            if (targetWd !== undefined) {
                const currentWd = refDate.getDay();
                let diffDays = (targetWd - currentWd + 7) % 7;
                if (diffDays === 0) diffDays = 7;
                const d = new Date(refDate);
                d.setDate(d.getDate() + diffDays);
                return d.toISOString().slice(0, 10);
            }
        }
    }

    // Helper: resolve year considering Italian school year boundary (Sep - Jun)
    const resolveYearForMonth = (month) => {
        if (!refDate) return refYear;
        const refMonth = refDate.getMonth() + 1; // 1-12
        if (refMonth >= 9 && month < 8) {
            // e.g. Reference is Oct 2026, task due in Jan -> 2027
            return refYear + 1;
        }
        if (refMonth <= 8 && month >= 9) {
            // e.g. Reference is Feb 2027, task assigned in Nov -> 2026
            return refYear - 1;
        }
        return refYear;
    };

    // 2. Full date with 4-digit year: "22/09/2026", "22-09-2026", "2026-09-22"
    const fullIso = lower.match(/\b(20\d{2})[\/\.\-](0?[1-9]|1[0-2])[\/\.\-](0?[1-9]|[12]\d|3[01])\b/);
    if (fullIso) {
        return `${fullIso[1]}-${fullIso[2].padStart(2, '0')}-${fullIso[3].padStart(2, '0')}`;
    }
    const fullIta = lower.match(/\b(0?[1-9]|[12]\d|3[01])[\/\.\-](0?[1-9]|1[0-2])[\/\.\-](20\d{2})\b/);
    if (fullIta) {
        return `${fullIta[3]}-${fullIta[2].padStart(2, '0')}-${fullIta[1].padStart(2, '0')}`;
    }

    // 3. Month names in Italian (e.g. "15 marzo", "per il 22 settembre", "entro il 2 maggio", "22 sett", "15 ott")
    const monthNames = [
        'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
        'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
    ];
    for (let i = 0; i < monthNames.length; i++) {
        const mName = monthNames[i];
        const mShort = mName.substring(0, 4);
        const mPattern = `(?:${mName}|${mShort}\\.?)`;
        const mRegex = new RegExp(`(?:per\\s+(?:il\\s+)?|entro\\s+(?:il\\s+)?|consegna\\s+(?:il\\s+)?|scadenza\\s+(?:il\\s+)?|il\\s+|del\\s+|giorno\\s+)?\\b(\\d{1,2})\\s+${mPattern}`, 'i');
        const dayMatch = lower.match(mRegex);
        if (dayMatch) {
            const day = parseInt(dayMatch[1], 10);
            if (day > 0 && day <= 31) {
                const month = i + 1;
                const yearResolved = resolveYearForMonth(month);
                return `${yearResolved}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            }
        }
    }

    // 4. Explicit date pattern with numbers: "per il 15/03", "per 22/09", "entro 20/04", "del 10/05", "consegna 12/03", "per lunedì 22/09"
    const dateMatch = lower.match(/(?:per\s+(?:il\s+)?(?:giorno\s+)?(?:luned[ìi]|marted[ìi]|mercoled[ìi]|gioved[ìi]|venerd[ìi]|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)?|entro\s+(?:il\s+)?|consegna\s+(?:entro\s+)?(?:il\s+)?|scadenza\s+(?:il\s+)?|data\s*[:\-]?\s*|giorno\s+|del\s+|il\s+|x\s+(?:il\s+)?)\s*(\d{1,2})[\/\.\-](0?[1-9]|1[0-2])\b/i);
    if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10);
        if (day > 0 && day <= 31 && month > 0 && month <= 12) {
            const yearResolved = resolveYearForMonth(month);
            return `${yearResolved}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        }
    }

    // 5. Day-only relative to reference month: "per martedì 22", "per il 22", "consegna il 24" (without month)
    if (refDate) {
        const dayOnlyMatch = lower.match(/(?:per\s+(?:il\s+)?(?:giorno\s+)?(?:luned[ìi]|marted[ìi]|mercoled[ìi]|gioved[ìi]|venerd[ìi]|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)?|entro\s+(?:il\s+)?|consegna\s+(?:entro\s+)?(?:il\s+)?|scadenza\s+(?:il\s+)?)\s*(\d{1,2})\b(?!\s*[\/\.\-]\s*\d|\s+[a-zàèéìòù]+)/i);
        if (dayOnlyMatch) {
            const dayNum = parseInt(dayOnlyMatch[1], 10);
            if (dayNum >= 1 && dayNum <= 31) {
                const refMonth = refDate.getMonth();
                const refDay = refDate.getDate();
                let targetYear = refDate.getFullYear();
                let targetMonth = refMonth;
                if (dayNum < refDay) {
                    targetMonth += 1;
                    if (targetMonth > 11) {
                        targetMonth = 0;
                        targetYear += 1;
                    }
                }
                const mStr = String(targetMonth + 1).padStart(2, '0');
                const dStr = String(dayNum).padStart(2, '0');
                return `${targetYear}-${mStr}-${dStr}`;
            }
        }
    }

    return null;
}

function extractHomeworkFromDashboard(dashboardData) {
    const tasksData = [];
    if (!dashboardData || typeof dashboardData !== 'object') return tasksData;

    try {
        const rawHomework = {};
        const toValidIsoDate = (value) => {
            const normalized = normalizeDashboardDate(value);
            return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
        };

        const resolveAssignedDate = (compito, fallbackDate) => {
            return (
                toValidIsoDate(compito?.dataAssegnazione) ||
                toValidIsoDate(compito?.datAssegnazione) ||
                toValidIsoDate(compito?.dataAssCompito) ||
                toValidIsoDate(compito?.datAssCompito) ||
                toValidIsoDate(compito?.datGiorno) ||
                toValidIsoDate(compito?.data) ||
                toValidIsoDate(fallbackDate)
            );
        };

        const addRawTask = (dueDate, materia, testo, assignedDate, assignedAt) => {
            const cleanText = String(testo || '').trim();
            if (!cleanText) return;
            const normalizedDueDate = toValidIsoDate(dueDate);
            const normalizedAssignedDate = toValidIsoDate(assignedDate);
            const groupingDate = normalizedDueDate || normalizedAssignedDate;
            if (!groupingDate) return;

            // Resolve subject name: if missing or generic, attempt detection from text
            let cleanMateria = String(materia || '').trim();
            if (!cleanMateria || cleanMateria.toUpperCase() === 'GENERICO' || cleanMateria.toUpperCase() === 'AVVISO' || cleanMateria.toUpperCase() === 'ARGOMENTO' || cleanMateria.toUpperCase() === 'N/D') {
                const detected = detectSubjectFromText(cleanText);
                if (detected) cleanMateria = detected;
                else cleanMateria = 'Generico';
            }
            const canonicalMateria = getSubjectCanonicalName(cleanMateria);

            if (!rawHomework[groupingDate]) rawHomework[groupingDate] = [];
            const isDup = rawHomework[groupingDate].some(t =>
                (t.canonicalMateria === canonicalMateria || t.materia === cleanMateria) &&
                t.testo === cleanText
            );
            if (!isDup) {
                rawHomework[groupingDate].push({
                    materia: cleanMateria,
                    canonicalMateria,
                    testo: cleanText,
                    assignedDate: normalizedAssignedDate || groupingDate,
                    assignedAt: assignedAt || null
                });
            }
        };

        const processCompitoItem = (compito, defaultMateria, fallbackDate) => {
            if (!compito) return;
            if (typeof compito === 'string') {
                const text = compito.trim();
                if (!text) return;
                const textDate = parseDateFromText(text, fallbackDate);
                addRawTask(textDate || fallbackDate, defaultMateria, text, fallbackDate, null);
                return;
            }
            if (typeof compito === 'object') {
                const text = String(
                    compito.desCompito || compito.compito || compito.testo ||
                    compito.desOggetto || compito.descrizione || compito.desCompiti ||
                    compito.desAttivita || compito.desNota || compito.nota || ''
                ).trim();
                if (!text) return;

                const materia = compito.materia || compito.desMateria || compito.materiaDes ||
                    compito.desMateriaBreve || compito.disciplina || compito.desDisciplina || defaultMateria;

                const explicitDueDate = compito.dataConsegna || compito.datConsegna ||
                    compito.desDataConsegna || compito.dtConsegna || compito.data_consegna ||
                    compito.dataCompito || compito.datCompito || compito.dataScadenza ||
                    compito.datScadenza || compito.dataFine || compito.datFine ||
                    compito.datAttivita || compito.dataAttivita ||
                    compito.datPianificata || compito.dataPianificata ||
                    (compito.datGiorno && compito.datGiorno !== fallbackDate ? compito.datGiorno : null) ||
                    (compito.data && compito.data !== fallbackDate ? compito.data : null);

                const assignedDate = resolveAssignedDate(compito, fallbackDate);
                const assignedAt = compito.datOraIns || compito.datOraInserimento || compito.dataOraInserimento || compito.tsInserimento || null;

                const textDate = parseDateFromText(text, fallbackDate);
                const dueDate = (textDate && (!explicitDueDate || explicitDueDate === fallbackDate))
                    ? textDate
                    : (explicitDueDate || textDate || fallbackDate);

                addRawTask(dueDate, materia, text, assignedDate, assignedAt);
            }
        };

        // 1. Root-level compiti containers (e.g. dashboardData.compiti, dashboardData.data.compiti, etc.)
        const rootCandidateArrays = [
            dashboardData.compiti,
            dashboardData.data?.compiti,
            dashboardData.compitiAssegnati,
            dashboardData.data?.compitiAssegnati,
            dashboardData.compitiGiornalieri,
            dashboardData.data?.compitiGiornalieri,
            dashboardData.agenda,
            dashboardData.data?.agenda,
            dashboardData.attivita?.pianificate,
            dashboardData.data?.attivita?.pianificate
        ];
        for (const pool of rootCandidateArrays) {
            if (!Array.isArray(pool)) continue;
            for (const item of pool) {
                processCompitoItem(item, 'Generico', '');
            }
        }

        // 2. Daily blocks in datiList
        const dati = dashboardData?.data?.dati || dashboardData?.dati || [];
        for (const blocco of dati) {
            const datGiorno = blocco.datGiorno || blocco.data || '';

            // A. Direct compiti on block
            const directCompiti = [
                ...(Array.isArray(blocco.compiti) ? blocco.compiti : (blocco.compiti ? [blocco.compiti] : [])),
                ...(Array.isArray(blocco.compitiAssegnati) ? blocco.compitiAssegnati : []),
                ...(Array.isArray(blocco.compitiGiornalieri) ? blocco.compitiGiornalieri : []),
                ...(Array.isArray(blocco.compitiDaSvolgere) ? blocco.compitiDaSvolgere : []),
                ...(Array.isArray(blocco.agenda) ? blocco.agenda : [])
            ];
            for (const compito of directCompiti) {
                processCompitoItem(compito, blocco.materia || blocco.desMateria || 'Generico', datGiorno);
            }

            // B. Attività pianificate on block
            const plannedActivities = [
                ...(Array.isArray(blocco.attivitaPianificate) ? blocco.attivitaPianificate : []),
                ...(Array.isArray(blocco.attivita) ? blocco.attivita : [])
            ];
            for (const act of plannedActivities) {
                if (!act) continue;
                const actText = typeof act === 'string'
                    ? act.trim()
                    : (act.desAttivita || act.desAttivitaSvolta || act.desDescrizione || act.desAnnotazioni || act.testo || act.attivita || '').trim();
                const isPlanned = Array.isArray(blocco.attivitaPianificate) && blocco.attivitaPianificate.includes(act);
                const isTaskLike = HOMEWORK_LIKE_ACTIVITY_PATTERN.test(actText);
                if (actText && (isPlanned || isTaskLike)) {
                    const actMateria = (typeof act === 'object' && (act.desMateria || act.materia)) || blocco.materia || 'Generico';
                    processCompitoItem(act, actMateria, datGiorno);
                }
            }

            // C. Registro lessons and teacher assignments
            const registro = blocco.registro || [];
            for (const element of registro) {
                const materia = element.desMateria || element.materia || element.desDisciplina || element.disciplina || element.desMateriaBreve || 'Generico';

                const elementCompiti = [
                    ...(Array.isArray(element.compiti) ? element.compiti : (element.compiti ? [element.compiti] : [])),
                    ...(Array.isArray(element.compito) ? element.compito : (element.compito ? [element.compito] : [])),
                    ...(Array.isArray(element.compitiAssegnati) ? element.compitiAssegnati : []),
                    ...(Array.isArray(element.compitiDaSvolgere) ? element.compitiDaSvolgere : [])
                ];
                for (const compito of elementCompiti) {
                    processCompitoItem(compito, materia, datGiorno);
                }

                // If element has attivita with homework keywords
                const elemAttivita = typeof element.attivita === 'string' ? element.attivita.trim() : (element.attivita?.desAttivita || element.attivita?.testo || '');
                if (elemAttivita && HOMEWORK_LIKE_ACTIVITY_PATTERN.test(elemAttivita)) {
                    processCompitoItem(elemAttivita, materia, datGiorno);
                }

                // If element has argomenti with homework keywords
                const elemArgomenti = Array.isArray(element.argomenti) ? element.argomenti : (element.argomenti ? [element.argomenti] : []);
                for (const a of elemArgomenti) {
                    const aText = typeof a === 'string' ? a.trim() : (a?.desArgomento || a?.argomento || a?.testo || '').trim();
                    if (aText && HOMEWORK_LIKE_ACTIVITY_PATTERN.test(aText)) {
                        processCompitoItem(a, materia, datGiorno);
                    }
                }

                // Annotazioni: scan for assignments/deadlines
                const annotazioni = element.annotazioni || element.note || [];
                const notesArray = Array.isArray(annotazioni) ? annotazioni : [annotazioni];
                for (const note of notesArray) {
                    const testo = typeof note === 'string' ? note.trim() : (note?.desAnnotazione || note?.desNota || note?.testo || '').trim();
                    if (!testo) continue;
                    const textDate = parseDateFromText(testo, datGiorno);
                    const isTaskLike = HOMEWORK_LIKE_ACTIVITY_PATTERN.test(testo);
                    if (textDate || isTaskLike) {
                        addRawTask(textDate || datGiorno, materia, testo, datGiorno, null);
                    }
                }
            }

            // D. Promemoria, Bacheca e Msg
            const notices = [...(blocco.promemoria || []), ...(blocco.bachecaAlunno || []), ...(blocco.bacheca || []), ...(blocco.msg || [])];
            for (const p of notices) {
                const testo = (p.desAnnotazioni || p.testo || p.desMessaggio || p.desOggetto || p.titolo || '').trim();
                if (!testo) continue;
                const textDate = parseDateFromText(testo, datGiorno);
                const isTaskLike = HOMEWORK_LIKE_ACTIVITY_PATTERN.test(testo);
                if (textDate || isTaskLike) {
                    const noticeMateria = p.materia || p.desMateria || 'AVVISO';
                    addRawTask(textDate || datGiorno, noticeMateria, testo, datGiorno, null);
                }
            }

            // E. Argomenti on block with task/homework keywords
            for (const a of (blocco.argomenti || [])) {
                const testo = (a.desArgomento || a.argomento || '').trim();
                if (testo && HOMEWORK_LIKE_ACTIVITY_PATTERN.test(testo)) {
                    const textDate = parseDateFromText(testo, datGiorno);
                    addRawTask(textDate || datGiorno, a.materia || a.desMateria || 'ARGOMENTO', testo, datGiorno, null);
                }
            }
        }

        // 3. Format final tasks array with all backward-compatible properties
        for (const [dateStr, items] of Object.entries(rawHomework)) {
            items.forEach((item) => {
                const stableId = generateStableId(`${item.testo}-${item.canonicalMateria}-${dateStr}`);
                tasksData.push({
                    id: stableId,
                    text: item.testo,
                    subject: item.canonicalMateria,
                    materia: item.canonicalMateria,
                    raw_materia: item.materia,
                    due_date: dateStr,
                    datCompito: dateStr,
                    assigned_date: item.assignedDate || dateStr,
                    assigned_at: item.assignedAt || null,
                    done: false
                });
            });
        }

        if (tasksData.length > 0) {
            console.log(`📚 [DidUp Compiti] Estratti ${tasksData.length} compiti:`);
            tasksData.forEach(t => {
                console.log(`  📌 [${t.due_date}] ${t.subject} (raw: "${t.raw_materia}"): ${t.text}`);
            });
        } else {
            console.log('📚 [DidUp Compiti] Nessun compito trovato nel dashboard.');
        }
    } catch (e) {
        debugLog('⚠️ Errore estrazione compiti', e.message);
    }
    return tasksData;
}

// ============= PROMEMORIA EXTRACTION =============

function extractPromemoriaFromDashboard(dashboardData) {
    const promemoria = [];
    try {
        const datiList = dashboardData?.data?.dati || dashboardData?.dati || [];
        for (const blocco of datiList) {
            const items = [...(blocco.bachecaAlunno || []), ...(blocco.promemoria || [])];
            for (const i of items) {
                const titolo = i.desOggetto || i.titolo || 'Avviso';
                const testo = i.desMessaggio || i.testo || i.desAnnotazioni || '';
                const autore = i.desMittente || 'Scuola';
                const data = i.datGiorno || i.data || '';
                const stableId = generateStableId(`${titolo}-${testo}-${data}`);
                promemoria.push({ titolo, testo, autore, data, url: i.urlAllegato || '', oggetto: titolo, date: data, id: stableId });
            }
        }
    } catch (e) {
        debugLog('⚠️ Errore promemoria', e.message);
    }
    return promemoria;
}

function normalizeProfileSubjectId(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
}

function collectProfileSubjectIds(value, out = new Set(), depth = 0) {
    // Argo payload trees for activity/registro/profile identifiers are typically shallow.
    // Capping depth avoids scanning huge nested branches that are unrelated to profile identity.
    if (depth > MAX_PROFILE_COLLECTION_DEPTH || value === null || value === undefined) return out;
    if (Array.isArray(value)) {
        value.forEach((item) => collectProfileSubjectIds(item, out, depth + 1));
        return out;
    }
    if (typeof value !== 'object') return out;

    for (const [rawKey, rawVal] of Object.entries(value)) {
        const key = String(rawKey || '').toLowerCase();
        const isProfileKey =
            key.includes('soggetto') ||
            key.includes('alunno') ||
            key.includes('profilo') ||
            PROFILE_PRG_KEY_PATTERN.test(key);
        if (isProfileKey && (typeof rawVal === 'string' || typeof rawVal === 'number')) {
            const normalized = normalizeProfileSubjectId(rawVal);
            if (normalized) out.add(normalized);
        }
        if (rawVal && typeof rawVal === 'object') {
            collectProfileSubjectIds(rawVal, out, depth + 1);
        }
    }
    return out;
}

function belongsToSelectedProfile(entry, blocco, targetSubjectId) {
    if (!targetSubjectId) return true;
    const ids = collectProfileSubjectIds(entry, new Set(), 0);
    if (ids.size === 0) collectProfileSubjectIds(blocco, ids, 0);
    if (ids.size === 0) return true;
    return ids.has(targetSubjectId);
}

function extractClassActivitiesFromDashboard(dashboardData, profileContext = {}) {
    const completedActivities = [];
    const plannedActivities = [];
    const targetSubjectId = normalizeProfileSubjectId(profileContext?.subjectId);
    const isHomeworkLikeActivity = (text) => HOMEWORK_LIKE_ACTIVITY_PATTERN.test(String(text || ''));
    const normalizeText = (text) => String(text || '').trim();
    const normalizeKeyPart = (text) => normalizeText(text).toLowerCase().replace(/\s+/g, ' ');
    const todayIso = normalizeDashboardDate(new Date().toISOString());
    const COMPLETED_ACTIVITY_PATTERN = /spiegazione|spiegazioni|correzione|correzioni|ripasso|lezione|lezioni|introduzione|introduzioni|approfond|discuss|svolt[oaie]|interrogazione.*svolt|interrogazioni.*svolt|verifica\s+svolt/i;
    const PLANNED_ACTIVITY_PATTERN = /compit|da\s+fare|per\s+casa|consegn|scadenz|studiare|leggere|esercizi?|tav\.\s*\d+/i;
    const isIsoDate = (dateValue) => /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''));
    const classifyActivityType = (rowDate, content, source, forcedType) => {
        if (forcedType === 'svolta' || forcedType === 'pianificata') return forcedType;
        const normalizedDate = normalizeDashboardDate(normalizeText(rowDate));
        const normalizedContent = normalizeText(content);
        const sourceText = normalizeText(source).toLowerCase();
        if (sourceText.includes('pianificata') || sourceText.includes('pianificate')) return 'pianificata';
        if (isIsoDate(normalizedDate) && normalizedDate > todayIso) return 'pianificata';
        const looksPlanned = PLANNED_ACTIVITY_PATTERN.test(normalizedContent) || isHomeworkLikeActivity(normalizedContent);
        const looksCompleted = COMPLETED_ACTIVITY_PATTERN.test(normalizedContent);
        if (looksPlanned && !looksCompleted) return 'pianificata';
        return 'svolta';
    };
    const pushActivity = (rowDate, subject, content, source = 'generic', useLegacyId = false, forcedType = '') => {
        const normalizedContent = normalizeText(content);
        if (!normalizedContent) return;
        const normalizedSubject = normalizeText(subject) || 'Materia';
        const normalizedDate = normalizeDashboardDate(normalizeText(rowDate));
        const type = classifyActivityType(normalizedDate, normalizedContent, source, forcedType);
        const dedupeContent = normalizeKeyPart(normalizedContent);
        const dedupeSubject = normalizeKeyPart(normalizedSubject);
        const id = useLegacyId
            ? generateStableId(`act-${normalizedDate}-${normalizedSubject}-${normalizedContent}`)
            : generateStableId(`act-${source}-${normalizedDate}-${dedupeSubject}-${dedupeContent}`);
        const item = {
            id,
            date: normalizedDate,
            subject: normalizedSubject,
            content: normalizedContent,
            type
        };
        if (type === 'pianificata') plannedActivities.push(item);
        else completedActivities.push(item);
    };
    try {
        const datiList = dashboardData?.data?.dati || dashboardData?.dati || [];
        // ✅ DIAGNOSTIC — always log extraction progress
        let _diagCounts = {
            blocchi: datiList.length,
            argomenti: 0,
            attivita: 0,
            attivitaPianificate: 0,
            registro: 0,
            registroNested: 0,
            pushed: 0,
            pushedSvolte: 0,
            pushedPianificate: 0
        };

        for (const blocco of datiList) {
            const date = blocco.datGiorno || blocco.data || '';
            const fromArgomenti = Array.isArray(blocco.argomenti) ? blocco.argomenti : [];
            _diagCounts.argomenti += fromArgomenti.length;
            fromArgomenti.forEach((entry) => {
                if (!belongsToSelectedProfile(entry, blocco, targetSubjectId)) return;
                const subject = entry?.desMateria || entry?.materia || 'Materia';
                const rowDate = entry?.datGiorno || date;
                const content = entry?.desAttivitaSvolta || entry?.desArgomento || entry?.argomento || '';
                if (content) {
                    _diagCounts.pushed++;
                    const type = classifyActivityType(rowDate, content, 'argomenti', '');
                    if (type === 'pianificata') _diagCounts.pushedPianificate++;
                    else _diagCounts.pushedSvolte++;
                }
                pushActivity(rowDate, subject, content, 'argomenti', true);
            });

            const fromAttivita = Array.isArray(blocco.attivita) ? blocco.attivita : [];
            _diagCounts.attivita += fromAttivita.length;
            fromAttivita.forEach((entry) => {
                if (!belongsToSelectedProfile(entry, blocco, targetSubjectId)) return;
                const content = entry?.desAttivitaSvolta || entry?.desAttivita || entry?.desDescrizione || entry?.desAnnotazioni || entry?.testo || '';
                const subject = entry?.desMateria || entry?.materia || 'Materia';
                const rowDate = entry?.datGiorno || date;
                if (content) {
                    _diagCounts.pushed++;
                    const type = classifyActivityType(rowDate, content, 'attivita', '');
                    if (type === 'pianificata') _diagCounts.pushedPianificate++;
                    else _diagCounts.pushedSvolte++;
                }
                pushActivity(rowDate, subject, content, 'attivita', true);
            });

            const fromAttivitaPianificate = Array.isArray(blocco.attivitaPianificate) ? blocco.attivitaPianificate : [];
            _diagCounts.attivitaPianificate += fromAttivitaPianificate.length;
            fromAttivitaPianificate.forEach((entry) => {
                if (!belongsToSelectedProfile(entry, blocco, targetSubjectId)) return;
                const content = entry?.desAttivitaSvolta || entry?.desAttivita || entry?.desDescrizione || entry?.desAnnotazioni || entry?.testo || '';
                const subject = entry?.desMateria || entry?.materia || 'Materia';
                const rowDate = entry?.datGiorno || date;
                if (content) {
                    _diagCounts.pushed++;
                    _diagCounts.pushedPianificate++;
                }
                pushActivity(rowDate, subject, content, 'attivita-pianificate', true, 'pianificata');
            });

            const fromRegistro = Array.isArray(blocco.registro) ? blocco.registro : [];
            _diagCounts.registro += fromRegistro.length;
            if (!_diagCounts.attivitaString) _diagCounts.attivitaString = 0;
            fromRegistro.forEach((entry) => {
                if (!belongsToSelectedProfile(entry, blocco, targetSubjectId)) return;
                const subject = entry?.desMateria || entry?.materia || 'Materia';
                const rowDate = entry?.datGiorno || entry?.data || date;
                const docente = entry?.docente || '';

                // ── PRIMARY: entry.attivita as a direct string ──
                // In the Argo dashboard API, registro entries have an `attivita` field
                // that is a plain string describing the lesson activity (the "attività svolta").
                const rawAttivita = entry?.attivita;
                const attivitaIsString = typeof rawAttivita === 'string' && rawAttivita.trim().length > 0;

                if (attivitaIsString) {
                    _diagCounts.attivitaString++;
                    _diagCounts.pushed++;
                    const type = classifyActivityType(rowDate, rawAttivita.trim(), 'registro-attivita-direct', '');
                    if (type === 'pianificata') _diagCounts.pushedPianificate++;
                    else _diagCounts.pushedSvolte++;
                    pushActivity(rowDate, subject, rawAttivita.trim(), 'registro-attivita-direct');
                }

                // ── SECONDARY: prefixed field names (for compatibility with other schools) ──
                const argLezione = entry?.desArgomentoLezione || entry?.desArgomento || entry?.argomento || '';
                const attSvolta = entry?.desAttivitaSvolta || entry?.desAttivita || '';
                if (argLezione) {
                    _diagCounts.pushed++;
                    const type = classifyActivityType(rowDate, argLezione, 'registro-argomento', '');
                    if (type === 'pianificata') _diagCounts.pushedPianificate++;
                    else _diagCounts.pushedSvolte++;
                    pushActivity(rowDate, subject, argLezione, 'registro-argomento');
                }
                if (attSvolta && attSvolta !== (attivitaIsString ? rawAttivita.trim() : '')) {
                    _diagCounts.pushed++;
                    const type = classifyActivityType(rowDate, attSvolta, 'registro-attivita', '');
                    if (type === 'pianificata') _diagCounts.pushedPianificate++;
                    else _diagCounts.pushedSvolte++;
                    pushActivity(rowDate, subject, attSvolta, 'registro-attivita');
                }

                // ── FALLBACK: contenuto, descrizione, testo ──
                const fallbackContent = entry?.contenuto || entry?.descrizione || entry?.testo || '';
                if (fallbackContent && fallbackContent !== argLezione && fallbackContent !== attSvolta && fallbackContent !== (rawAttivita || '').trim()) {
                    _diagCounts.pushed++;
                    const type = classifyActivityType(rowDate, fallbackContent, 'registro-fallback', '');
                    if (type === 'pianificata') _diagCounts.pushedPianificate++;
                    else _diagCounts.pushedSvolte++;
                    pushActivity(rowDate, subject, fallbackContent, 'registro-fallback');
                }

                // ── NESTED: argomenti array (if present) ──
                const nestedArgomenti = Array.isArray(entry?.argomenti) ? entry.argomenti : [];
                _diagCounts.registroNested += nestedArgomenti.length;
                nestedArgomenti.forEach((a) => {
                    const nestedContent = a?.desArgomento || a?.argomento || '';
                    if (nestedContent) {
                        _diagCounts.pushed++;
                        const type = classifyActivityType(rowDate, nestedContent, 'registro-argomento-nested', '');
                        if (type === 'pianificata') _diagCounts.pushedPianificate++;
                        else _diagCounts.pushedSvolte++;
                    }
                    pushActivity(rowDate, a?.desMateria || subject, nestedContent, 'registro-argomento-nested');
                });

                // ── NESTED: attivita array (only if it's actually an array, not a string) ──
                const nestedAttivita = (!attivitaIsString && Array.isArray(rawAttivita)) ? rawAttivita : [];
                _diagCounts.registroNested += nestedAttivita.length;
                nestedAttivita.forEach((a) => {
                    const content = a?.desAttivita || a?.desDescrizione || a?.desAttivitaSvolta || a?.attivita || a?.testo || '';
                    const subj = a?.desMateria || a?.materia || subject;
                    if (!isHomeworkLikeActivity(content)) {
                        if (content) {
                            _diagCounts.pushed++;
                            const type = classifyActivityType(rowDate, content, 'registro-attivita-nested', '');
                            if (type === 'pianificata') _diagCounts.pushedPianificate++;
                            else _diagCounts.pushedSvolte++;
                        }
                        pushActivity(rowDate, subj, content, 'registro-attivita-nested');
                    }
                });

                // ── ANNOTATIONS ──
                const annotazioni = entry?.annotazioni || entry?.note || [];
                const notesArray = Array.isArray(annotazioni) ? annotazioni : [annotazioni];
                notesArray.forEach((note) => {
                    const noteText = normalizeText(note?.desAnnotazione || note?.desNota || note?.testo || note || '');
                    if (!noteText || isHomeworkLikeActivity(noteText)) return;
                    _diagCounts.pushed++;
                    const type = classifyActivityType(rowDate, noteText, 'registro-annotazioni', '');
                    if (type === 'pianificata') _diagCounts.pushedPianificate++;
                    else _diagCounts.pushedSvolte++;
                    pushActivity(rowDate, subject, noteText, 'registro-annotazioni');
                });
            });
        }

        if (DEBUG_MODE) {
            debugLog('extractClassActivities raw counts', {
                ..._diagCounts,
                svolteRaw: completedActivities.length,
                pianificateRaw: plannedActivities.length
            });
        }
    } catch (e) {
        debugLog('⚠️ Errore estrazione attività svolte', {
            message: e?.message || String(e),
            stack: e?.stack || null
        });
    }
    const dedupeById = (list) => {
        const seen = new Set();
        return list.filter((a) => {
            if (!a?.id || seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
        });
    };
    const resultSvolte = dedupeById(completedActivities);
    const resultPianificate = dedupeById(plannedActivities);
    if (DEBUG_MODE) {
        debugLog('extractClassActivities final counts', {
            svolte: resultSvolte.length,
            pianificate: resultPianificate.length
        });
    }
    return {
        svolte: resultSvolte,
        pianificate: resultPianificate
    };
}

// ============= ASSENZE / RITARDI / USCITE EXTRACTION =============

function extractAssenzeFromDashboard(dashboardData) {
    const ORE_PER_GIORNO = 5; // Standard Italian high school: 8:00-13:00
    const ORA_INIZIO_SCUOLA = 8;  // 8:00
    const ORA_FINE_SCUOLA = 13;   // 13:00
    const result = {
        assenze: [],
        ritardi: [],
        uscite: [],
        note: [],
        totaleAssenze: 0,
        totaleRitardi: 0,
        totaleUscite: 0,
        oreAssenzaTotali: 0,
        daGiustificare: 0
    };
    if (DEBUG_MODE) result._debug = {};

    // Helper: normalize date to YYYY-MM-DD
    function normalizeDate(d) {
        if (!d) return '';
        return d.split(' ')[0].split('T')[0]; // strip time
    }

    // Helper: parse "domani" / "dopodomani" / specific dates from note text
    function getTargetDate(noteText, noteDate) {
        const lower = noteText.toLowerCase();
        const nd = new Date(noteDate);
        
        if (/dopodomani/i.test(lower)) {
            nd.setDate(nd.getDate() + 2);
            return normalizeDate(nd.toISOString());
        }
        if (/domani/i.test(lower)) {
            nd.setDate(nd.getDate() + 1);
            return normalizeDate(nd.toISOString());
        }
        // Try to find a specific date like "11 marzo", "25/03", "25-03"
        const months = { 'gennaio':1,'febbraio':2,'marzo':3,'aprile':4,'maggio':5,'giugno':6,
                         'luglio':7,'agosto':8,'settembre':9,'ottobre':10,'novembre':11,'dicembre':12 };
        const dateMatch = lower.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/);
        if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            const month = months[dateMatch[2]];
            const noteYear = nd.getFullYear();
            const noteUTC = Date.UTC(nd.getFullYear(), nd.getMonth(), nd.getDate());
            const candidateUTC = Date.UTC(noteYear, month - 1, day);
            const resolvedYear = candidateUTC < noteUTC ? noteYear + 1 : noteYear;
            return `${resolvedYear}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        }
        // Default: the note's own date
        return normalizeDate(noteDate);
    }

    try {
        const datiList = dashboardData?.data?.dati || dashboardData?.dati || [];
        
        // Debug: dump all available keys from first blocco
        if (DEBUG_MODE && datiList.length > 0) {
            const sampleKeys = Object.keys(datiList[0]);
            result._debug.bloccoKeys = sampleKeys;
            debugLog('🔑 Dashboard blocco keys', JSON.stringify(sampleKeys));
            for (const k of sampleKeys) {
                if (/assen|ritard|uscit|appell|ingress|presenz|event|attivit|pianific/i.test(k)) {
                    const sample = datiList[0][k];
                    result._debug[`key_${k}`] = Array.isArray(sample) ? sample.slice(0, 1) : sample;
                }
            }
        }

        // ── PASS 1: Collect all absences and notes ──
        for (const blocco of datiList) {
            const datGiorno = blocco.datGiorno || '';

            // 1. Assenze (appello)
            const assenzeRaw = blocco.assenze || blocco.eventiClasse || blocco.eventi || 
                               blocco.appello || blocco.registroAssenze || blocco.fupiAssenze || [];
            
            for (const a of assenzeRaw) {
                const tipo = (a.codEvento || a.tipo || a.tipoEvento || a.descrizione || '').toUpperCase();
                const { giustificata, daGiustificare } = resolveAttendanceJustification(a);
                const oraInizio = a.oraInizio || a.numOra || a.hInizio || '';
                const oraFine = a.oraFine || a.hFine || '';
                const numOre = a.numOre || a.durataOre || a.numUnitaOra || 1;
                const nota = a.desAnnotazione || a.desMotivo || a.nota || a.note || a.motivo || '';
                const data = a.datGiorno || a.datAssenza || a.datEvento || a.data || datGiorno;

                const entry = {
                    id: generateStableId(`${tipo}-${data}-${oraInizio}-${nota.substring(0,10)}`),
                    data,
                    tipo: 'assenza',
                    giustificata,
                    daGiustificare,
                    oraInizio, oraFine, numOre: parseFloat(numOre), nota
                };

                // Better classification: check both tipo AND nota for ritardo/uscita
                const isRitardo = /RITARD|INGRESSO|^R$|^I$|ENTR/i.test(tipo) || /RITARD|INGRESSO|ENTR/i.test(nota);
                const isUscita = /USCIT|ANTICIPAT|^U$/i.test(tipo) || /USCIT|ANTICIPAT|ESCE|ESCA/i.test(nota);

                if (isRitardo) {
                    entry.tipo = 'ritardo';
                    result.ritardi.push(entry);
                    result.totaleRitardi++;
                } else if (isUscita) {
                    entry.tipo = 'uscita';
                    result.uscite.push(entry);
                    result.totaleUscite++;
                } else {
                    entry.tipo = 'assenza';
                    result.assenze.push(entry);
                    result.totaleAssenze++;
                }

                if (!giustificata) result.daGiustificare++;
            }

            // 2. Note
            const noteRaw = blocco.noteDisciplinari || blocco.note || blocco.noteGeneriche || [];
            for (const n of noteRaw) {
                const testo = n.desDescrizione || n.desAnnotazione || n.desNota || n.desNotaDisciplinare || 
                              n.testo || n.descrizione || n.nota || '';
                const autore = n.docente || n.desDocente || n.desMittente || n.autore || '';
                const data = n.datNota || n.datGiorno || n.data || datGiorno;
                
                if (DEBUG_MODE && result.note.length === 0) {
                    result._debug.rawNotaSample = n;
                }

                const isAbsenceCorrection = /uscit\w*\s+(autorizz|permess|anticipat)|ingress\w*\s+(second|terz|quart|ritard)|entr\w*\s+(dopo|ritard)/i.test(testo);

                result.note.push({
                    id: generateStableId(`nota-${testo || autore}-${data}`),
                    data, testo, autore, isAbsenceCorrection, tipo: 'nota'
                });
            }
        }

        // ── PASS 2: Build day modifiers from notes ──
        const dayModifiers = new Map();

        // Configurable assembly dates (ASSEMBLY_DATES env var: JSON array of "YYYY-MM-DD" strings).
        // Dynamic detection from notes text below handles the common case; env var is for edge cases.
        let assemblyDates = [];
        if (process.env.ASSEMBLY_DATES) {
            try {
                const parsed = JSON.parse(process.env.ASSEMBLY_DATES);
                if (Array.isArray(parsed)) assemblyDates = parsed;
            } catch (e) {
                console.warn('[argo] Invalid ASSEMBLY_DATES env var:', e.message);
            }
        }
        for (const ad of assemblyDates) {
            dayModifiers.set(ad, 1);
        }

        for (const note of result.note) {
            const testo = (note.testo || '').toLowerCase();
            if (!testo) continue;
            const targetDate = getTargetDate(note.testo, note.data);

            const exitMatch = testo.match(/(?:esc[ea]|uscit[ae]|termin\w+|finisce)\s+(?:alle\s+)?(?:ore\s+)?(\d{1,2})[,.:]\s*(\d{2})?/);
            if (exitMatch) {
                const exitHour = parseInt(exitMatch[1]);
                if (exitHour > ORA_INIZIO_SCUOLA && exitHour <= ORA_FINE_SCUOLA) {
                    const effectiveHours = exitHour - ORA_INIZIO_SCUOLA;
                    const current = dayModifiers.get(targetDate);
                    dayModifiers.set(targetDate, current ? Math.min(current, effectiveHours) : effectiveHours);
                }
            }
            const entryMatch = testo.match(/(?:entr[ao]|ingress[oi])\s+(?:alle\s+)?(?:ore\s+)?(\d{1,2})[,.:]\s*(\d{2})?/);
            if (entryMatch) {
                const entryHour = parseInt(entryMatch[1]);
                if (entryHour >= ORA_INIZIO_SCUOLA && entryHour < ORA_FINE_SCUOLA) {
                    const effectiveHours = ORA_FINE_SCUOLA - entryHour;
                    const current = dayModifiers.get(targetDate);
                    dayModifiers.set(targetDate, current ? Math.min(current, effectiveHours) : effectiveHours);
                }
            }
            if (/assemblea\s+d['i]?\s*istituto/i.test(testo)) {
                dayModifiers.set(targetDate, 1);
            }
            const oreMatch = testo.match(/(?:solo|soltanto)\s+(\d)\s+or[ea]/);
            if (oreMatch) {
                const hours = parseInt(oreMatch[1]);
                dayModifiers.set(targetDate, hours);
            }
        }
        if (DEBUG_MODE) result._debug.dayModifiers = Object.fromEntries(dayModifiers);

        // ── PASS 3: Calculate precise absence hours ──
        result.oreAssenzaTotali = 0;

        // 3a. Full Absences
        for (const assenza of result.assenze) {
            const dateKey = normalizeDate(assenza.data);
            const dayLimit = dayModifiers.get(dateKey) || ORE_PER_GIORNO;
            assenza.oreEffettive = dayLimit;
            result.oreAssenzaTotali += dayLimit;
        }

        // 3b. Partial Absences (Ritardi / Uscite)
        const allPartials = [...result.ritardi, ...result.uscite];
        for (const p of allPartials) {
            const testo = (p.nota || '').toLowerCase();
            const dateKey = normalizeDate(p.data);
            const dayLimit = dayModifiers.get(dateKey) || ORE_PER_GIORNO;
            let partialHours = 1; // default fallback

            // Try to parse "ora" (e.g. "Ingresso in 2^ ora")
            const hourOrderMatch = testo.match(/(\d)(?:\^|ª|°|位)?\s+ora/i);
            if (hourOrderMatch) {
                const hourOrdinal = parseInt(hourOrderMatch[1]);
                if (p.tipo === 'ritardo') {
                    partialHours = hourOrdinal - 1; // e.g. 2nd hour = 1 hour missed
                } else if (p.tipo === 'uscita') {
                    partialHours = Math.max(0, dayLimit - (hourOrdinal - 1)); // e.g. exit at 4th hour in a 5h day = 2h missed
                }
            } else {
                // Try to parse timestamp "alle ore 09:01"
                const timeMatch = testo.match(/(?:ore\s+)?(\d{1,2})[:.](\d{2})/);
                if (timeMatch) {
                    const h = parseInt(timeMatch[1]);
                    const m = parseInt(timeMatch[2]);
                    const decimalTime = h + (m / 60);
                    if (p.tipo === 'ritardo') {
                        partialHours = Math.max(0, decimalTime - ORA_INIZIO_SCUOLA);
                    } else if (p.tipo === 'uscita') {
                        const effectiveEnd = Math.min(ORA_FINE_SCUOLA, ORA_INIZIO_SCUOLA + dayLimit);
                        partialHours = Math.max(0, effectiveEnd - decimalTime);
                    }
                }
            }
            
            p.oreEffettive = partialHours;
            result.oreAssenzaTotali += partialHours;
        }

        debugLog(`✅ Assenze: ${result.totaleAssenze} full (${result.oreAssenzaTotali.toFixed(1)}h total)`);

    } catch (e) {
        debugLog('⚠️ Errore estrazione assenze', e.message);
    }

    return result;
}

// ============= VERIFICHE EXTRACTION =============

function extractVerificheFromDashboard(dashboardData) {
    const verifiche = [];
    const VERIFICA_REGEX = /verific|interrogazion|prova\s+(scritta|orale)|compito\s+in\s+classe|test\b|esame/i;
    const SCRITTA_REGEX = /scritta|scritto|compito\s+in\s+classe|test\b/i;
    const ORALE_REGEX = /oral[ei]|interrogazion/i;

    try {
        const datiList = dashboardData?.data?.dati || dashboardData?.dati || [];

        for (const blocco of datiList) {
            const datGiorno = blocco.datGiorno || '';

            // 1. Scan promemoria + bacheca + attività for verifiche
            const promemoriaItems = [
                ...(blocco.promemoria || []), 
                ...(blocco.bacheca || []),
                ...(blocco.bachecaAlunno || []),
                ...(blocco.msg || []),
                ...(blocco.attivitaPianificate || []),
                ...(blocco.prenotazioni || []),
                ...(blocco.prenotazioniAlunni || []),
                ...(blocco.attivita || []),
                ...(blocco.schede || [])
            ];
            for (const p of promemoriaItems) {
                const testo = p.desDescrizione || p.desAnnotazioni || p.testo || p.desMessaggio || p.desOggetto || p.titolo || p.desAttivita || '';
                if (VERIFICA_REGEX.test(testo)) {
                    const materia = p.desMateria || p.materia || p.desMateriaCdl || '';
                    const dataVerifica = parseDateFromText(testo) || p.datGiorno || datGiorno;
                    let tipo = 'unknown';
                    if (SCRITTA_REGEX.test(testo)) tipo = 'scritta';
                    else if (ORALE_REGEX.test(testo)) tipo = 'orale';

                    verifiche.push({
                        id: generateStableId(`ver-${materia}-${dataVerifica}-${testo.substring(0, 30)}`),
                        materia,
                        data: dataVerifica,
                        tipo,
                        text: testo,
                        source: 'promemoria'
                    });
                }
            }

            // 2. Scan registro compiti for verifiche keywords
            const registro = blocco.registro || [];
            for (const element of registro) {
                const materia = element.materia || '';
                for (const compito of (element.compiti || [])) {
                    const testo = compito.desCompito || compito.compito || '';
                    if (VERIFICA_REGEX.test(testo)) {
                        const dataVerifica = parseDateFromText(testo) || compito.dataConsegna || compito.datConsegna || datGiorno;
                        let tipo = 'unknown';
                        if (SCRITTA_REGEX.test(testo)) tipo = 'scritta';
                        else if (ORALE_REGEX.test(testo)) tipo = 'orale';

                        verifiche.push({
                            id: generateStableId(`ver-${materia}-${dataVerifica}-${testo.substring(0, 30)}`),
                            materia,
                            data: dataVerifica,
                            tipo,
                            text: testo,
                            source: 'compito'
                        });
                    }
                }
            }
        }

        // Deduplicate by id
        const seen = new Set();
        const unique = verifiche.filter(v => {
            if (seen.has(v.id)) return false;
            seen.add(v.id);
            return true;
        });

        debugLog(`✅ Verifiche extracted: ${unique.length} trovate`);
        return unique;

    } catch (e) {
        debugLog('⚠️ Errore estrazione verifiche', e.message);
    }

    return verifiche;
}

// ============= IDENTITY RESOLUTION =============

async function enrichProfiles(school, accessToken, profiles) {
    const supabase = getSupabase();
    const results = [];

    for (const [index, p] of profiles.entries()) {
        const authToken = p.token;
        const uname = (p.username || '').trim().toLowerCase();
        const pid = generatePid(school, uname, index);

        let name = (p.name || '').trim().toUpperCase();
        let cls = normalizeClass(p.class) || '';
        let track = p.specialization || null;

        if (supabase && (!isValidName(name, p.username) || !CLASS_REGEX.test(cls))) {
            try {
                const { data: cached } = await supabase.from('profiles').select('name, class, specialization').eq('id', pid).maybeSingle();
                if (cached) {
                    if (!isValidName(name, p.username) && isValidName(cached.name, p.username)) name = cached.name;
                    if (!CLASS_REGEX.test(cls) && CLASS_REGEX.test(cached.class)) cls = cached.class;
                    if (!track && cached.specialization) track = cached.specialization;
                }
            } catch (e) { debugLog(`P${index}: Cache check failed`, e.message); }
        }

        const hasCompleteClassAndTrack = cls && CLASS_REGEX.test(cls) && (/\([A-Z]{2,3}\)/.test(cls) || track);
        if (isValidName(name, p.username) && hasCompleteClassAndTrack) {
            results.push({ ...p, name, class: cls, specialization: track });
            continue;
        }

        if (!authToken) {
            results.push({ ...p, name: name || `STUDENTE ${index + 1}`, class: cls || 'N/D', specialization: track });
            continue;
        }

        const hdrs = createHeaders(school, accessToken, authToken, p.idSoggetto);

        try {
            const r9 = await axios.get(ENDPOINT + 'profilo', { headers: hdrs, timeout: 6000 });
            const d9 = safeData(r9.data);

            if (!isValidName(name, p.username)) {
                const al = d9.alunno || d9;
                const extractedName = al.nominativo || (al.nome && al.cognome ? `${al.cognome} ${al.nome}` : null);
                if (extractedName && isValidName(extractedName, p.username)) name = extractedName.trim().toUpperCase();
            }

            const scheda = d9.scheda || {};
            const classeObj = scheda.classe || {};
            const al = d9.alunno || d9;

            const candClass = classeObj.desDenominazione || scheda.annoCorso || al.desClasse || al.classe || d9.desClasse || d9.classe || cls || '';
            const candSez = classeObj.desSezione || classeObj.sezione || scheda.sezione || al.desSezione || al.sezione || d9.desSezione || '';
            const candCorso = classeObj.corso?.descrizione || classeObj.desCorso || scheda.desCorso || scheda.corso?.descrizione || scheda.corso || scheda.desIndirizzo || al.desCorso || al.corso || d9.desCorso || '';

            const details = parseClassDetails(candClass, { section: candSez, course: candCorso });
            if (details?.formatted) {
                cls = details.formatted;
                if (details.track) track = details.track;
            } else if (!cls || cls === 'N/D') {
                cls = normalizeClass(candClass, { section: candSez, course: candCorso }) || 'N/D';
            }
        } catch (e) {
            debugLog(`P${index}: Profilo Error`, e.message);
        }

        results.push({
            ...p,
            name: name || (isValidName(p.name, p.username) ? p.name : `STUDENTE ${index + 1}`),
            class: cls || (CLASS_REGEX.test(p.class) ? p.class : 'N/D'),
            specialization: track
        });
    }

    return results;
}

async function resolveIdentityForProfile(school, username, password, accessToken, authToken, currentName, currentClass, subjectId = null) {
    let name = (currentName || '').trim().toUpperCase();
    let cls = normalizeClass(currentClass) || '';
    let track = null;

    if (!isValidName(name, username)) name = null;
    const initialDetails = parseClassDetails(cls);
    if (initialDetails?.track) track = initialDetails.track;

    const hasCompleteClassAndTrack = cls && CLASS_REGEX.test(cls) && /\([A-Z]{2,3}\)/.test(cls);
    if (isValidName(name, username) && hasCompleteClassAndTrack) {
        return { name, cls, track: initialDetails?.track || null, trackName: initialDetails?.trackName || null };
    }

    const hdrs = createHeaders(school, accessToken, authToken, subjectId);

    try {
        const r9 = await axios.get(ENDPOINT + 'profilo', { headers: hdrs, timeout: 6000 });
        const d9 = safeData(r9.data);

        if (!name) {
            const al = d9.alunno || d9;
            const extractedName = al.nominativo || (al.nome && al.cognome ? `${al.cognome} ${al.nome}` : null);
            if (extractedName && isValidName(extractedName, username)) name = extractedName.trim().toUpperCase();
        }

        const scheda = d9.scheda || {};
        const classeObj = scheda.classe || {};
        const al = d9.alunno || d9;

        const candClass = classeObj.desDenominazione || scheda.annoCorso || al.desClasse || al.classe || d9.desClasse || d9.classe || cls || '';
        const candSez = classeObj.desSezione || classeObj.sezione || scheda.sezione || al.desSezione || al.sezione || d9.desSezione || '';
        const candCorso = classeObj.corso?.descrizione || classeObj.desCorso || scheda.desCorso || scheda.corso?.descrizione || scheda.corso || scheda.desIndirizzo || al.desCorso || al.corso || d9.desCorso || '';

        const details = parseClassDetails(candClass, { section: candSez, course: candCorso });
        if (details?.formatted) {
            cls = details.formatted;
            track = details.track;
        } else if (!cls || cls === 'N/D') {
            cls = normalizeClass(candClass, { section: candSez, course: candCorso }) || 'N/D';
        }

        const finalDetails = parseClassDetails(cls);
        if (isValidName(name, username) && cls && CLASS_REGEX.test(cls)) {
            return {
                name,
                cls,
                track: finalDetails?.track || track || null,
                trackName: finalDetails?.trackName || null
            };
        }
    } catch (e) {
        debugLog('⚠️ Fail Profilo', e.message);
    }

    if (cls) cls = normalizeClass(cls) || cls;
    const finalDetails = parseClassDetails(cls);
    return {
        name: name || null,
        cls: cls || null,
        track: finalDetails?.track || track || null,
        trackName: finalDetails?.trackName || null
    };
}

// ============= WEB UI FALLBACK =============

function _extractClassFromHtml($) {
    let rawClass = '';
    let rawSezione = '';
    let rawCorso = '';

    // 1. Known IDs and attributes
    for (const sel of ['#_idJsp56', '[id*="classe"]', '[id*="Classe"]', '[class*="classe"]', '[name*="classe"]']) {
        const val = $(sel).val ? $(sel).val() : '';
        const txt = $(sel).text ? $(sel).text().trim() : '';
        const t = (val || txt).trim();
        if (t && !rawClass) rawClass = t;
    }

    for (const sel of ['[id*="sezione"]', '[id*="Sezione"]', '[class*="sezione"]', '[name*="sezione"]']) {
        const val = $(sel).val ? $(sel).val() : '';
        const txt = $(sel).text ? $(sel).text().trim() : '';
        const t = (val || txt).trim();
        if (t && !rawSezione) rawSezione = t;
    }

    for (const sel of ['[id*="corso"]', '[id*="Corso"]', '[id*="indirizzo"]', '[class*="indirizzo"]', '[name*="corso"]']) {
        const val = $(sel).val ? $(sel).val() : '';
        const txt = $(sel).text ? $(sel).text().trim() : '';
        const t = (val || txt).trim();
        if (t && !rawCorso) rawCorso = t;
    }

    // 2. Scan table rows, divs, and paragraphs for Italian school labels
    $('tr, div, p, li').each((_, elem) => {
        const fullText = $(elem).text().replace(/\s+/g, ' ').trim();
        if (!fullText) return;

        const classMatch = fullText.match(/\b(?:Classe|Anno\s*(?:di\s*corso)?)\s*[:\-]?\s*([1-5][\^°]?\s*[A-Z]{0,3})\b/i);
        if (classMatch && !rawClass) rawClass = classMatch[1];

        const sezMatch = fullText.match(/\b(?:Sez(?:ione)?)\s*[:\-]?\s*([A-Z]{1,2})\b/i);
        if (sezMatch && !rawSezione) rawSezione = sezMatch[1];

        const corsoMatch = fullText.match(/\b(?:Corso(?:\s*di\s*studio)?|Indirizzo)\s*[:\-]?\s*([^\n\r<;]{3,60})/i);
        if (corsoMatch && !rawCorso) rawCorso = corsoMatch[1];
    });

    // 3. Scan body text for track if not found
    const bodyText = $('body').text().replace(/\s+/g, ' ');
    if (!rawCorso) {
        const detected = detectTrack(bodyText);
        if (detected) rawCorso = detected.name;
    }

    const details = parseClassDetails(rawClass, { section: rawSezione, course: rawCorso });
    if (details?.formatted) {
        return { cls: details.formatted, track: details.track };
    }

    const bodyDetails = parseClassDetails(bodyText, { course: rawCorso });
    if (bodyDetails?.formatted) {
        return { cls: bodyDetails.formatted, track: bodyDetails.track };
    }

    const fallbackNorm = normalizeClass(rawClass, { section: rawSezione, course: rawCorso });
    return { cls: fallbackNorm || null, track: null };
}

async function resolveIdentityFromWebUI(jar) {
    try {
        if (!jar) return { name: null, cls: null, track: null };
        const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 15000 }));
        const res = await client.get('https://www.portaleargo.it/argoweb/famiglia/index.jsf', {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' }
        });
        const $ = cheerio.load(res.data);

        let name = null;
        for (const id of ['#_idJsp44', '#nominativo', '[id*="nominativo"]', '[class*="nominativo"]']) {
            const raw = $(id).text().trim();
            if (_isValidIdentity(raw)) {
                name = _cleanIdentity(raw.replace(/^(Alunno|Studente|Nominativo)\s*[:\-]?\s*/i, ''));
                break;
            }
        }

        const { cls, track } = _extractClassFromHtml($);

        return { name, cls: cls || 'N/D', track: track || null };
    } catch (e) {
        debugLog('⚠️ resolveIdentityFromWebUI error', e.message);
        return { name: null, cls: null, track: null };
    }
}

async function resolveClassFromAnagraficaWeb(jar) {
    try {
        if (!jar) return { name: null, cls: null, track: null };
        const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 15000 }));

        const candidates = [
            'https://www.portaleargo.it/argoweb/famiglia/datiAnagrafici.jsf',
            'https://www.portaleargo.it/argoweb/famiglia/schedaAnagraficaAlunno.jsf'
        ];

        let res = null;
        for (const url of candidates) {
            try {
                const tmp = await client.get(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' } });
                if (tmp.data && (tmp.data.includes('alunno') || tmp.data.includes('nominativo') || tmp.data.includes('classe'))) {
                    res = tmp;
                    break;
                }
            } catch (e) { continue; }
        }
        if (!res) return { name: null, cls: null, track: null };

        const $ = cheerio.load(res.data);

        let name = null;
        for (const sel of ['#_idJsp44', '#nominativo', '[id*="nominativoAlunno"]', '[class*="nominativo"]']) {
            const raw = $(sel).text().trim();
            if (_isValidIdentity(raw)) {
                name = _cleanIdentity(raw.replace(/^(Alunno|Nominativo)\s*[:\-]?\s*/i, ''));
                break;
            }
        }

        const { cls, track } = _extractClassFromHtml($);

        return { name: name || null, cls: cls || null, track: track || null };
    } catch (e) {
        debugLog('⚠️ resolveClassFromAnagraficaWeb error', e.message);
        return { name: null, cls: null, track: null };
    }
}

/**
 * Extracts class and track details from student dashboard data (homework, lessons, activities, grades)
 * as a robust fallback if profile endpoints or web pages omit section or course info.
 */
function extractClassFromDashboard(dashboardData) {
    if (!dashboardData || typeof dashboardData !== 'object') return null;

    const pools = [
        dashboardData.compiti,
        dashboardData.attivita?.svolte,
        dashboardData.attivita?.pianificate,
        dashboardData.argomenti,
        dashboardData.votiGiornalieri,
        dashboardData.votiScrutinio,
        dashboardData.registro
    ];

    for (const pool of pools) {
        if (!Array.isArray(pool)) continue;
        for (const item of pool) {
            if (!item || typeof item !== 'object') continue;
            const cand = item.desClasse || item.classe || item.codiceClasse || item.desSezione || '';
            const candCorso = item.desCorso || item.corso || '';
            if (cand) {
                const details = parseClassDetails(cand, { course: candCorso });
                if (details?.formatted && CLASS_REGEX.test(details.formatted)) {
                    return details;
                }
            }
        }
    }
    return null;
}

module.exports = {
    AdvancedArgo,
    getDashboard,
    extractGradesFromDashboard,
    extractHomeworkFromDashboard,
    extractPromemoriaFromDashboard,
    extractClassActivitiesFromDashboard,
    extractAssenzeFromDashboard,
    extractVerificheFromDashboard,
    enrichProfiles,
    resolveIdentityForProfile,
    resolveIdentityFromWebUI,
    resolveClassFromAnagraficaWeb,
    extractClassFromDashboard
};
