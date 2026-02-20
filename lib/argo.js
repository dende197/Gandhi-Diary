const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const crypto = require('crypto');
const cheerio = require('cheerio');
const {
    debugLog, isValidName, normalizeClass, safeData,
    buildName, createHeaders, USER_AGENT, ENDPOINT,
    generateStableId, generatePid, CLASS_REGEX
} = require('./helpers');
const { getSupabase } = require('./supabase');

const CHALLENGE_URL = 'https://auth.portaleargo.it/oauth2/auth';
const LOGIN_URL = 'https://www.portaleargo.it/auth/sso/login';
const TOKEN_URL = 'https://auth.portaleargo.it/oauth2/token';
const REDIRECT_URI = 'it.argosoft.didup.famiglia.new://login-callback';
const CLIENT_ID = '72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c';

// ============= PKCE HELPERS =============

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
            let loopCount = 0;
            while (loopCount < 10) {
                if (location.includes('code=')) {
                    const codeMatch = location.match(/code=([0-9a-zA-Z-_.]+)/);
                    if (codeMatch) { code = codeMatch[1]; break; }
                }
                const reqRedirect = await client.get(location, { maxRedirects: 0, validateStatus: () => true });
                location = reqRedirect.headers['location'];
                if (!location) break;
                loopCount++;
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

                let rawName = '';
                if (alunno.desNominativo) rawName = alunno.desNominativo;
                else if (alunno.nominativo) rawName = alunno.nominativo;
                else if (alunno.desNome && alunno.desCognome) rawName = `${alunno.desCognome} ${alunno.desNome}`;
                else if (alunno.nome && alunno.cognome) rawName = `${alunno.cognome} ${alunno.nome}`;
                rawName = rawName.trim().toUpperCase();

                let rawClass = alunno.desClasse || alunno.classe || alunno.codiceClasse ||
                    sog.desClasse || sog.classe || '';
                rawClass = rawClass.trim().toUpperCase();

                const subjectId = sog.idSoggetto || sog.prgSoggetto || sog.prgAlunno ||
                    sog.idAlunno || sog.pk || sog.id ||
                    alunno.pk || alunno.prgAlunno || alunno.idAlunno || alunno.id || null;

                return {
                    index: idx,
                    name: rawName,
                    class: normalizeClass(rawClass) || rawClass || 'N/D',
                    school: (sog.codMin || sog.codiceScuola || school || '').trim().toUpperCase(),
                    username: (sog.username || username || '').trim().toLowerCase(),
                    token: sog.token || '',
                    idSoggetto: subjectId,
                    raw: sog
                };
            });

            return { access_token: accessToken, profiles, jar };

        } catch (e) {
            debugLog('❌ Errore Raw Login', e.message);
            throw e;
        }
    }
}

// ============= DASHBOARD =============

async function getDashboard(headers) {
    try {
        const startDate = '2024-09-01 00:00:00';
        const DASHBOARD_OPTIONS = {
            votiGiornalieri: true, votiScrutinio: true, compiti: true,
            argomenti: true, promemoria: true, bacheca: true,
            noteDisciplinari: true, assenze: true, votiPeriodici: true
        };
        const payload = {
            dataultimoaggiornamento: startDate,
            opzioni: JSON.stringify(DASHBOARD_OPTIONS)
        };
        const res = await axios.post(ENDPOINT + 'dashboard/dashboard', payload, { headers, timeout: 25000 });
        return res.data;
    } catch (e) {
        debugLog('⚠️ Errore Dashboard', e.message);
        return {};
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

// Kept for backward compat (single-call scenarios)
async function extractGradesMultiStrategy(headers) {
    return extractGradesFromDashboard(await getDashboard(headers));
}

// ============= HOMEWORK EXTRACTION =============

function extractHomeworkFromDashboard(dashboardData) {
    const tasksData = [];
    try {
        const rawHomework = {};
        const dati = dashboardData?.data?.dati || dashboardData?.dati || [];
        for (const blocco of dati) {
            const registro = blocco.registro || [];
            const datGiorno = blocco.datGiorno;
            for (const element of registro) {
                const compiti = element.compiti || [];
                const materia = element.materia || 'Generico';
                for (const compito of compiti) {
                    const dataConsegna = compito.dataConsegna || compito.datConsegna || datGiorno;
                    if (!dataConsegna) continue;
                    if (!rawHomework[dataConsegna]) rawHomework[dataConsegna] = { compiti: [], materie: [] };
                    const testo = compito.desCompito || compito.compito || '';
                    if (testo) {
                        rawHomework[dataConsegna].compiti.push(testo);
                        rawHomework[dataConsegna].materie.push(materia);
                    }
                }
            }
        }
        for (const [dateStr, details] of Object.entries(rawHomework)) {
            details.compiti.forEach((desc, i) => {
                const mat = details.materie[i] || 'Generico';
                const stableId = generateStableId(`${desc}-${mat}-${dateStr}`);
                tasksData.push({ id: stableId, text: desc, subject: mat, due_date: dateStr, datCompito: dateStr, materia: mat, done: false });
            });
        }
    } catch (e) {
        debugLog('⚠️ Errore compiti', e.message);
    }
    return tasksData;
}

async function extractHomeworkSafe(headers) {
    return extractHomeworkFromDashboard(await getDashboard(headers));
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

async function extractPromemoria(headers) {
    return extractPromemoriaFromDashboard(await getDashboard(headers));
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

        if (supabase && (!isValidName(name, p.username) || !CLASS_REGEX.test(cls))) {
            try {
                const { data: cached } = await supabase.from('profiles').select('name, class').eq('id', pid).maybeSingle();
                if (cached) {
                    if (!isValidName(name, p.username) && isValidName(cached.name, p.username)) name = cached.name;
                    if (!CLASS_REGEX.test(cls) && CLASS_REGEX.test(cached.class)) cls = cached.class;
                }
            } catch (e) { debugLog(`P${index}: Cache check failed`, e.message); }
        }

        if (isValidName(name, p.username) && cls && CLASS_REGEX.test(cls)) {
            results.push({ ...p, name, class: cls });
            continue;
        }

        if (!authToken) {
            results.push({ ...p, name: name || `STUDENTE ${index + 1}`, class: cls || 'N/D' });
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

            if (!CLASS_REGEX.test(cls)) {
                const scheda = d9.scheda || {};
                const classeObj = scheda.classe || {};
                let extractedCls = '';
                if (classeObj.desDenominazione && classeObj.desSezione) {
                    extractedCls = `${classeObj.desDenominazione}${classeObj.desSezione}`.trim().toUpperCase();
                    const courseDesc = (classeObj.corso?.descrizione || classeObj.desCorso || scheda.desCorso || '').toUpperCase();
                    if (courseDesc.includes('SCIENZE APPLICATE')) extractedCls += ' (SA)';
                    else if (courseDesc.includes('SCIENZE UMANE')) extractedCls += ' (SU)';
                    else if (courseDesc.includes('CLASSICO')) extractedCls += ' (LC)';
                    else if (courseDesc.includes('SCIENTIFICO')) extractedCls += ' (LS)';
                    else if (courseDesc.includes('LINGUISTICO')) extractedCls += ' (LL)';
                } else if (d9.desClasse || d9.classe) {
                    extractedCls = normalizeClass(d9.desClasse || d9.classe);
                }
                if (extractedCls) cls = extractedCls;
            }
        } catch (e) {
            debugLog(`P${index}: Profilo Error`, e.message);
        }

        results.push({
            ...p,
            name: name || (isValidName(p.name, p.username) ? p.name : `STUDENTE ${index + 1}`),
            class: cls || (CLASS_REGEX.test(p.class) ? p.class : 'N/D')
        });
    }

    return results;
}

async function resolveIdentityForProfile(school, username, password, accessToken, authToken, currentName, currentClass, subjectId = null) {
    let name = (currentName || '').trim().toUpperCase();
    let cls = normalizeClass(currentClass) || '';

    if (!isValidName(name, username)) name = null;
    if (isValidName(name, username) && cls && CLASS_REGEX.test(cls)) return { name, cls };

    const hdrs = createHeaders(school, accessToken, authToken, subjectId);

    try {
        const r9 = await axios.get(ENDPOINT + 'profilo', { headers: hdrs, timeout: 6000 });
        const d9 = safeData(r9.data);

        if (!name) {
            const al = d9.alunno || d9;
            const extractedName = al.nominativo || (al.nome && al.cognome ? `${al.cognome} ${al.nome}` : null);
            if (extractedName && isValidName(extractedName, username)) name = extractedName.trim().toUpperCase();
        }

        if (!cls || !CLASS_REGEX.test(cls)) {
            const scheda = d9.scheda || {};
            const classeObj = scheda.classe || {};
            let extractedCls = '';
            if (classeObj.desDenominazione && classeObj.desSezione) {
                extractedCls = `${classeObj.desDenominazione}${classeObj.desSezione}`.trim().toUpperCase();
            } else if (d9.desClasse || d9.classe) {
                extractedCls = normalizeClass(d9.desClasse || d9.classe);
            }
            if (extractedCls) cls = extractedCls;
        }

        if (isValidName(name, username) && cls && CLASS_REGEX.test(cls)) return { name, cls };
    } catch (e) {
        debugLog('⚠️ Fail Profilo', e.message);
    }

    if (cls) cls = normalizeClass(cls) || cls;
    return { name: name || null, cls: cls || null };
}

// ============= WEB UI FALLBACK (per scuole che non espongono /profilo) =============

async function resolveIdentityFromWebUI(jar) {
    try {
        if (!jar) return { name: null, cls: null };
        const { wrapper: wrap } = require('axios-cookiejar-support');
        const client = wrap(axios.create({ jar, withCredentials: true, timeout: 15000 }));
        const url = 'https://www.portaleargo.it/argoweb/famiglia/index.jsf';
        const res = await client.get(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' } });
        const $ = cheerio.load(res.data);

        const _isValid = (s) => {
            if (!s) return false;
            const t = s.toUpperCase();
            return t.length >= 3 && !/PASSWORD|RECUPERA|CAMBIA|LOGOUT|ESC|ACCEDI|REGISTRA|MENU|CERCA/i.test(t);
        };
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();

        let name = null;
        for (const id of ['#_idJsp44', '#nominativo', '[id*="nominativo"]']) {
            const raw = $(id).text().trim();
            if (_isValid(raw)) { name = clean(raw.replace(/^(Alunno|Studente|Nominativo)\s*:\s*/i, '')); break; }
        }

        let cls = null;
        for (const id of ['#_idJsp56', '[id*="classe"]', '[id*="sezione"]']) {
            const raw = $(id).text().trim();
            const norm = normalizeClass(raw);
            if (norm) { cls = norm; break; }
        }

        return { name, cls: cls || 'N/D' };
    } catch (e) {
        debugLog('⚠️ resolveIdentityFromWebUI error', e.message);
        return { name: null, cls: null };
    }
}

async function resolveClassFromAnagraficaWeb(jar) {
    try {
        if (!jar) return { name: null, cls: null };
        const { wrapper: wrap } = require('axios-cookiejar-support');
        const client = wrap(axios.create({ jar, withCredentials: true, timeout: 15000 }));

        const candidates = [
            'https://www.portaleargo.it/argoweb/famiglia/anagrafica-alunno.jsf',
            'https://www.portaleargo.it/argoweb/famiglia/datiAnagrafici.jsf',
            'https://www.portaleargo.it/argoweb/famiglia/schedaAnagraficaAlunno.jsf'
        ];

        let res = null;
        for (const url of candidates) {
            try {
                const tmp = await client.get(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' } });
                if (tmp.data && (tmp.data.includes('alunno') || tmp.data.includes('nominativo'))) { res = tmp; break; }
            } catch (e) { continue; }
        }
        if (!res) return { name: null, cls: null };

        const $ = cheerio.load(res.data);
        const _isValid = (s) => s && s.length >= 3 && !/PASSWORD|RECUPERA|LOGOUT|ACCEDI/i.test(s);
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();

        let name = null;
        for (const sel of ['#_idJsp44', '#nominativo', '[id*="nominativoAlunno"]']) {
            const raw = $(sel).text().trim();
            if (_isValid(raw)) { name = clean(raw.replace(/^(Alunno|Nominativo)\s*:\s*/i, '')); break; }
        }

        let cls = null;
        for (const sel of ['#_idJsp56', '[id*="classe"]', '[id*="sezione"]']) {
            const raw = $(sel).text().trim();
            const norm = normalizeClass(raw);
            if (norm) { cls = norm; break; }
        }

        return { name: name || null, cls: cls || null };
    } catch (e) {
        debugLog('⚠️ resolveClassFromAnagraficaWeb error', e.message);
        return { name: null, cls: null };
    }
}

module.exports = {
    AdvancedArgo,
    getDashboard,
    extractGradesFromDashboard,
    extractHomeworkFromDashboard,
    extractPromemoriaFromDashboard,
    extractGradesMultiStrategy,
    extractHomeworkSafe,
    extractPromemoria,
    enrichProfiles,
    resolveIdentityForProfile,
    resolveIdentityFromWebUI,
    resolveClassFromAnagraficaWeb
};
