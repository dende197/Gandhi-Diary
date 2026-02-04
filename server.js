require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cheerio = require('cheerio');

// ============= SETUP APP =============
const app = express();
app.use(express.json({ limit: '50mb' }));

// Root Route for checking status
app.get('/', (req, res) => {
    res.json({
        status: "online",
        message: "G-Connect Backend is running",
        debugMode: DEBUG_MODE,
        timestamp: new Date().toISOString()
    });
});

// ============= CORS (CORRETTO) =============
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "";
const _allowed = ALLOWED_ORIGINS
    .split(",")
    .map(o => o.trim())
    .filter(o => o.length > 0);

app.use(cors({
    origin: function (origin, callback) {
        const allowed = _allowed.length > 0 ? _allowed : ["https://dende197.github.io"];
        if (!origin || allowed.includes(origin) || allowed.includes("*")) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

// ============= DEBUG MODE (CORRETTO - Era un bug!) =============
// ❌ PYTHON: DEBUG_MODE = ... or True  (SEMPRE TRUE!)
// ✅ NODE.JS:
const DEBUG_MODE = (process.env.DEBUG_MODE || "false").toLowerCase() === "true";

// ============= SUPABASE CLIENT =============
let supabase = null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("\n" + "=".repeat(70));
console.log("🔍 DEBUG: Verifica Supabase Configuration");

if (supabaseUrl) {
    console.log(`✅ SUPABASE_URL: ${supabaseUrl}`);
} else {
    console.log("❌ SUPABASE_URL: NOT SET");
}

if (supabaseKey) {
    console.log(`✅ SUPABASE_SERVICE_ROLE_KEY presente (${supabaseKey.length} caratteri)`);
    try {
        const parts = supabaseKey.split('.');
        if (parts.length >= 2) {
            let payloadB64 = parts[1];
            while (payloadB64.length % 4 !== 0) payloadB64 += '=';
            const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
            const role = payload.role;
            console.log(`   Ruolo decodificato dal JWT: ${role}`);
            if (role === 'service_role') {
                console.log("   ✅✅✅ PERFETTO! Stai usando la chiave SERVICE_ROLE");
            } else {
                console.log(`   ❌❌❌ ERRORE! Ruolo: ${role} (non service_role)`);
            }
        }
    } catch (e) {
        console.log(`   ⚠️ Impossibile decodificare JWT: ${e.message}`);
    }

    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log("✅ Supabase client inizializzato");
    } catch (e) {
        console.log(`❌ Errore inizializzazione Supabase: ${e.message}`);
    }
} else {
    console.log("❌ SUPABASE_SERVICE_ROLE_KEY: NOT SET");
}
console.log("=".repeat(70) + "\n");

// ============= CONSTANTS =============
const CHALLENGE_URL = "https://auth.portaleargo.it/oauth2/auth";
const LOGIN_URL = "https://www.portaleargo.it/auth/sso/login";
const TOKEN_URL = "https://auth.portaleargo.it/oauth2/token";
const REDIRECT_URI = "it.argosoft.didup.famiglia.new://login-callback";
const CLIENT_ID = "72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c";
const ENDPOINT = "https://www.portaleargo.it/appfamiglia/api/rest/";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36";

const SENSITIVE_KEYS = new Set(["x-auth-token", "Authorization", "authToken", "access_token", "token", "password"]);
const CLASS_REGEX = /^[1-5][A-Z]{1,2}$/;
const SUBJECT_TOKENS = new Set([
    "ITALIANO", "INGLESE", "STORIA", "GEOGRAFIA", "FILOSOFIA", "MATEMATICA", "SCIENZE", "BIOLOGIA",
    "FISICA", "ARTE", "DISEGNO", "RELIGIONE", "RELIGIOSA", "EDUCAZIONE", "MUSICA", "TECNOLOGIE",
    "TECNOLOGIA", "INFORMATICA", "CHIMICA", "LATINO", "GRECO", "FRANCESE", "SPAGNOLO", "TEDESCO",
    "TRIENNIO", "BIENNIO", "PRIMO", "SECONDO", "TERZO", "QUARTO", "QUINTO",
    "QUADRIMESTRE", "TRIMESTRE", "PENTAMESTRE", "SCRUTINIO", "SCRUTINI", "PERIODO",
    "SCIENZE NATURALI", "SCIENZE UMANE", "STORIA E GEOGRAFIA",
    "DISEGNO E STORIA DELL'ARTE", "EDUCAZIONE FISICA", "EDUCAZIONE CIVICA",
    "VALUTAZIONE", "VALUTAZIONI", "ASSENZE", "ASSENZA", "VOTI", "VOTO"
]);

// Helper per generare ID deterministici basati sul contenuto
function generateStableId(baseString) {
    return crypto.createHash('md5').update(baseString).digest('hex').substring(0, 12);
}

function safeData(obj) {
    if (!obj) return obj;
    try {
        if (Array.isArray(obj)) return obj.map(v => redact(v));
        if (typeof obj === 'object') {
            const newObj = {};
            for (const [k, v] of Object.entries(obj)) {
                newObj[k] = SENSITIVE_KEYS.has(k) ? "<redacted>" : redact(v);
            }
            return newObj;
        }
    } catch (e) { }
    return obj;
}

// ============= HELPERS =============

function redact(obj) {
    if (!obj) return obj;
    try {
        if (Array.isArray(obj)) return obj.map(v => redact(v));
        if (typeof obj === 'object') {
            const newObj = {};
            for (const [k, v] of Object.entries(obj)) {
                newObj[k] = SENSITIVE_KEYS.has(k) ? "<redacted>" : redact(v);
            }
            return newObj;
        }
    } catch (e) { }
    return obj;
}

function debugLog(message, data = null) {
    if (DEBUG_MODE) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔍 ${message}`);
        if (data !== null) {
            const safe = redact(data);
            try {
                const str = JSON.stringify(safe, null, 2);
                console.log(str.substring(0, 2000));
            } catch (e) {
                console.log(String(safe).substring(0, 2000));
            }
        }
        console.log(`${'='.repeat(60)}\n`);
    }
}

// ============= PKCE HELPERS =============

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('hex');
}

function generateCodeChallenge(verifier) {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

// ============= ARGO ADVANCED CLASS (TRADOTTO) =============

class AdvancedArgo {
    static async rawLogin(school, username, password) {
        try {
            const jar = new CookieJar();
            const client = wrapper(axios.create({
                jar: jar,
                withCredentials: true,
                timeout: 30000  // ← AGGIUNTO: timeout (Python non ha limite!)
            }));

            const CODE_VERIFIER = generateCodeVerifier();
            const CODE_CHALLENGE = generateCodeChallenge(CODE_VERIFIER);
            const STATE = generateState();

            // 1. GET Challenge
            const challengeParams = new URLSearchParams({
                redirect_uri: REDIRECT_URI,
                client_id: CLIENT_ID,
                response_type: "code",
                prompt: "login",
                state: STATE,
                scope: "openid offline profile user.roles argo",
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: "S256"
            });

            debugLog("PKCE: Richiesta Challenge...");
            const reqChallenge = await client.get(`${CHALLENGE_URL}?${challengeParams.toString()}`);

            // Estrai login_challenge dall'URL
            // Estrai login_challenge dall'URL o dall'HTML
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

            if (!loginChallenge) {
                throw new Error("Login challenge non trovata (URL/HTML)");
            }

            // 2. POST Login
            const loginBody = new URLSearchParams();
            loginBody.append("challenge", loginChallenge);
            loginBody.append("client_id", CLIENT_ID);
            loginBody.append("prefill", "true");
            loginBody.append("famiglia_customer_code", school);
            loginBody.append("username", username);
            loginBody.append("password", password);
            loginBody.append("login", "true");

            debugLog("PKCE: Login POST...");
            const reqLogin = await client.post(LOGIN_URL, loginBody, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 0,
                validateStatus: () => true  // Accetta tutte le status
            });

            let location = reqLogin.headers['location'];
            if (!location && reqLogin.data) {
                try {
                    const $ = cheerio.load(reqLogin.data);
                    // Prova link diretto con code=
                    location = $('a[href*="code="]').attr('href') || null;
                    // Prova meta refresh: content="0;url=..."
                    if (!location) {
                        const meta = $('meta[http-equiv="refresh"]').attr('content') || '';
                        const m = meta.match(/url=(.+)$/i);
                        if (m) location = m[1];
                    }
                } catch (_) { }
            }
            if (!location) {
                throw new Error("Credenziali errate o scuola non valida (No Location header)");
            }

            // 3. Follow redirects until code
            let code = null;
            let loopCount = 0;

            while (loopCount < 10) {
                if (location.includes("code=")) {
                    const codeMatch = location.match(/code=([0-9a-zA-Z-_.]+)/);
                    if (codeMatch) {
                        code = codeMatch[1];
                        break;
                    }
                }

                const reqRedirect = await client.get(location, {
                    maxRedirects: 0,
                    validateStatus: () => true
                });

                location = reqRedirect.headers['location'];
                if (!location) break;
                loopCount++;
            }

            if (!code) throw new Error("Auth code non trovato dopo i redirect");

            // 4. Exchange code for token
            const tokenBody = new URLSearchParams();
            tokenBody.append("code", code);
            tokenBody.append("grant_type", "authorization_code");
            tokenBody.append("redirect_uri", REDIRECT_URI);
            tokenBody.append("code_verifier", CODE_VERIFIER);
            tokenBody.append("client_id", CLIENT_ID);

            debugLog("PKCE: Token exchange...");
            const tokenRes = await client.post(TOKEN_URL, tokenBody);
            const accessToken = tokenRes.data.access_token;

            if (!accessToken) throw new Error("No access_token in response");

            // 5. Login to Argo API to get profiles
            const argoLoginHeaders = {
                "User-Agent": USER_AGENT,
                "Content-Type": "application/json",
                "Authorization": "Bearer " + accessToken,
                "Accept": "application/json"
            };

            const payload = {
                clientID: crypto.randomBytes(32).toString('hex'),
                "lista-x-auth-token": [],
                "x-auth-token-corrente": null,
                "lista-opzioni-notifiche": {}
            };

            debugLog("PKCE: Argo API /login call...");
            const argoResp = await axios.post(ENDPOINT + "login", payload, {
                headers: argoLoginHeaders,
                timeout: 30000
            });

            const soggetti = argoResp.data.data || [];

            debugLog("🔍 SOGGETTI RICEVUTI", {
                count: soggetti.length,
                keys: soggetti[0] ? Object.keys(soggetti[0]) : []
            });

            // Log completo - mostra TUTTE le chiavi a tutti i livelli
            if (soggetti[0]) {
                const s = soggetti[0];
                debugLog("📋 CHIAVI PRIMO LIVELLO SOGGETTO", Object.keys(s));

                // Log dell'oggetto alunno se esiste
                if (s.alunno) {
                    debugLog("👤 ALUNNO OBJECT TROVATO", {
                        keys: Object.keys(s.alunno),
                        pk: s.alunno.pk,
                        prgAlunno: s.alunno.prgAlunno,
                        desNome: s.alunno.desNome,
                        desCognome: s.alunno.desCognome,
                        desNominativo: s.alunno.desNominativo,
                        desClasse: s.alunno.desClasse,
                        classe: s.alunno.classe
                    });
                } else {
                    debugLog("⚠️ NESSUN OGGETTO 'alunno' TROVATO nel soggetto");
                }

                // Mostra il token (troncato per sicurezza)
                if (s.token) {
                    debugLog("🎫 TOKEN presente", s.token.substring(0, 30) + "...");
                }

                // Mostra tutti i campi che potrebbero contenere ID
                debugLog("🔢 POSSIBILI CAMPI ID", {
                    idSoggetto: s.idSoggetto,
                    prgSoggetto: s.prgSoggetto,
                    prgAlunno: s.prgAlunno,
                    idAlunno: s.idAlunno,
                    pk: s.pk,
                    id: s.id,
                    codMin: s.codMin,
                    "alunno.pk": s.alunno?.pk,
                    "alunno.prgAlunno": s.alunno?.prgAlunno
                });
            }

            const profiles = soggetti.map((sog, idx) => {
                // Cerca i dati dello studente in più posizioni
                const alunno = sog.alunno || sog;

                // Nome: cerca in alunno o direttamente in sog
                let rawName = '';
                if (alunno.desNominativo) rawName = alunno.desNominativo;
                else if (alunno.nominativo) rawName = alunno.nominativo;
                else if (alunno.desNome && alunno.desCognome) rawName = `${alunno.desCognome} ${alunno.desNome}`;
                else if (alunno.nome && alunno.cognome) rawName = `${alunno.cognome} ${alunno.nome}`;
                rawName = rawName.trim().toUpperCase();

                // Classe: cerca in alunno o direttamente in sog
                let rawClass = alunno.desClasse || alunno.classe || alunno.codiceClasse ||
                    sog.desClasse || sog.classe || '';
                rawClass = rawClass.trim().toUpperCase();

                // ID: cerca in vari campi possibili, incluso nested alunno
                const subjectId = sog.idSoggetto || sog.prgSoggetto || sog.prgAlunno ||
                    sog.idAlunno || sog.pk || sog.id ||
                    alunno.pk || alunno.prgAlunno || alunno.idAlunno || alunno.id ||
                    null;

                debugLog(`📌 Profilo ${idx} estratto`, {
                    name: rawName || "(vuoto)",
                    class: rawClass || "(vuoto)",
                    subjectId: subjectId,
                    tokenPresent: !!sog.token
                });

                return {
                    index: idx,
                    name: rawName,
                    class: normalizeClass(rawClass) || rawClass || "N/D",
                    school: (sog.codMin || sog.codiceScuola || school || '').trim().toUpperCase(),
                    username: (sog.username || username || '').trim().toLowerCase(),
                    token: sog.token || '',
                    idSoggetto: subjectId,
                    raw: sog
                };
            });

            return { access_token: accessToken, profiles, jar };

        } catch (e) {
            debugLog("❌ Errore Raw Login", e.message);
            throw e;
        }
    }
}

// ============= IDENTITY HELPERS =============

function buildName(obj = {}) {
    const full = obj.desNominativo || obj.nominativo;
    if (full) return String(full).trim().toUpperCase();
    const n = obj.desNome || obj.nome || '';
    const c = obj.desCognome || obj.cognome || '';
    const combo = `${String(c).trim()} ${String(n).trim()}`.trim();
    return combo ? combo.toUpperCase() : null;
}

function normalizeClass(raw, strict = false) {
    if (!raw) return null;
    let txt = String(raw).toUpperCase().replace(/\s+/g, ' ').trim();

    // Filtro "False Positives" comuni (parole italiane che iniziano con lettere di sezione)
    // Esempio: "4 ORE" non deve diventare "4O"
    const blackList = /\b(ORE|ANNI|ANNO|OGGETTI|OTTOBRE|ORA|ORDINE|OFFERTA|OPZIONE|ORARIO|OVVERO|OGNI|OLTRE)\b/i;
    if (blackList.test(txt)) return null;

    // 1) Match esplicito: "3A", "3^A", "3° A", "3AB", "3 A" con word boundaries
    // Supporto sezioni multiple (es. SU, SA, DSU) -> ora restituisce tutto (3SU -> 3SU)
    let m = txt.match(/\b([1-5])[\^°]?\s*([A-Z]{1,3})\b/);
    if (m) {
        return m[1] + m[2];
    }

    // Se siamo in strict mode (scansione globale testo), accettiamo solo match sicuri sopra
    if (strict) return null;

    // 2) Numero+lettera ovunque (es. "Classe 2 B" -> "2B")
    m = txt.match(/([1-5])\s*([A-Z]{1,3})/);
    if (m) return m[1] + m[2];

    // 3) Prima cifra 1-5 + prima lettera (Ultima spiaggia per campi singoli)
    const digit = (txt.match(/[1-5]/) || [])[0];
    const letter = (txt.match(/[A-Z]/) || [])[0];
    if (digit && letter) return digit + letter;

    return null;
}


/**
 * Valida che una stringa sia un nome reale (Cognome Nome) e non un placeholder o un username.
 */
function isValidName(name, username = "") {
    if (!name || typeof name !== 'string') return false;
    const t = name.trim().toUpperCase();
    if (t.length < 3) return false;

    // Scarta se è uguale all'username (fallback pigro di Argo)
    if (username && t === username.toUpperCase()) return false;

    // Scarta boilerplate PWA/UI/Argo placeholders
    if (/PASSWORD|RECUPERA|CAMBIA|LOGOUT|ESC|ACCEDI|REGISTRA|MENU|CERCA/i.test(t)) return false;
    if (/^NOMINATIVO$|^ALUNNO$|^STUDENTE$|^UTENTE$|^SCONOSCIUTO$/i.test(t)) return false;
    if (t.startsWith('STUDENTE ') || t.startsWith('UTENTE ')) return false;

    // Deve avere almeno 2 parole (Cognome Nome)
    const parts = t.split(/\s+/).filter(p => p.length >= 2);
    if (parts.length < 2) return false;

    return true;
}


function safeData(obj) {
    if (!obj) return {};
    if (obj.data) return obj.data;
    if (obj.scheda) return obj.scheda;
    return obj;
}

// ============= PROFILE ENRICHMENT (ULTRA-ROBUST DEEP SCAN) =============

async function enrichProfiles(school, accessToken, profiles) {
    const baseApp = "https://www.portaleargo.it/appfamiglia/api/rest/";
    const results = [];

    debugLog(`🕵️ AVVIO ENRICHMENT SU ${profiles.length} PROFILI...`);

    for (const [index, p] of profiles.entries()) {
        const authToken = p.token;
        const uname = (p.username || '').trim().toLowerCase();
        const pid = `${school}:${uname}:${index}`;

        let name = (p.name || '').trim().toUpperCase();
        let cls = normalizeClass(p.class) || '';

        // 0) CONTROLLO CACHE SUPABASE (EFFICIENZA MASSIMA)
        if (supabase && (!isValidName(name, p.username) || !CLASS_REGEX.test(cls))) {
            try {
                const { data: cached } = await supabase.from("profiles").select("name, class").eq("id", pid).maybeSingle();
                if (cached) {
                    if (!isValidName(name, p.username) && isValidName(cached.name, p.username)) name = cached.name;
                    if (!CLASS_REGEX.test(cls) && CLASS_REGEX.test(cached.class)) cls = cached.class;
                    debugLog(`P${index}: Dati recuperati da CACHE Supabase`, { name, cls });
                }
            } catch (e) {
                debugLog(`P${index}: Cache check failed`, e.message);
            }
        }

        // Se abbiamo già tutto, saltiamo la riricerca
        if (isValidName(name, p.username) && cls && CLASS_REGEX.test(cls)) {
            results.push({ ...p, name, class: cls });
            continue;
        }

        if (!authToken) {
            results.push({ ...p, name: name || `STUDENTE ${index + 1}`, class: cls || "N/D" });
            continue;
        }

        const headers = createHeaders(school, accessToken, authToken, p.idSoggetto);

        // =================================================================
        // STRATEGIA 1: /profilo (ENDPOINT 9 - VELOCE E ROBUSTO)
        // =================================================================
        try {
            debugLog(`P${index}: Tentativo /profilo (Endpoint 9)...`);
            const r9 = await axios.get(baseApp + "profilo", { headers, timeout: 6000 });
            const d9 = safeData(r9.data);

            if (!isValidName(name, p.username)) {
                const al = d9.alunno || d9;
                let extractedName = al.nominativo || (al.nome && al.cognome ? `${al.cognome} ${al.nome}` : null);
                if (extractedName && isValidName(extractedName, p.username)) {
                    name = extractedName.trim().toUpperCase();
                }
            }

            if (!CLASS_REGEX.test(cls)) {
                const scheda = d9.scheda || {};
                const classeObj = scheda.classe || {};
                let extractedCls = "";

                if (classeObj.desDenominazione && classeObj.desSezione) {
                    extractedCls = `${classeObj.desDenominazione}${classeObj.desSezione}`.trim().toUpperCase();
                    // Specializzazione
                    let courseDesc = (classeObj.corso?.descrizione || classeObj.corso || classeObj.desCorso || scheda.desCorso || "").toUpperCase();
                    let abbr = "";
                    if (courseDesc.includes("SCIENZE APPLICATE")) abbr = "(SA)";
                    else if (courseDesc.includes("SCIENZE UMANE")) abbr = "(SU)";
                    else if (courseDesc.includes("CLASSICO")) abbr = "(LC)";
                    else if (courseDesc.includes("SCIENTIFICO")) abbr = "(LS)";
                    else if (courseDesc.includes("LINGUISTICO")) abbr = "(LL)";
                    if (abbr) extractedCls += " " + abbr;
                } else if (d9.desClasse || d9.classe) {
                    extractedCls = normalizeClass(d9.desClasse || d9.classe);
                }
                if (extractedCls) cls = extractedCls;
            }
        } catch (e) {
            debugLog(`P${index}: Profilo Error`, e.message);
        }

        // Fallback Finale
        results.push({
            ...p,
            name: name || (isValidName(p.name, p.username) ? p.name : `STUDENTE ${index + 1}`),
            class: cls || (CLASS_REGEX.test(p.class) ? p.class : "N/D")
        });
    }

    return results;
}

// ============= DATA EXTRACTION (MULTI-STRATEGY) =============

function extractStudentFromScheda(schedaResp) {
    const roots = [
        schedaResp.data || {},
        (schedaResp.data || {}).scheda || {},
        schedaResp
    ];

    let name = null, cls = null;

    for (const root of roots) {
        if (!root) continue;

        const al = root.alunno || root;
        const full = al.desNominativo || al.nominativo || '';
        const n = al.desNome || al.nome || '';
        const c = al.desCognome || al.cognome || '';

        if (!name) {
            if (full) name = String(full).trim().toUpperCase();
            else if (n || c) name = `${String(c).trim()} ${String(n).trim()}`.trim().toUpperCase();
        }

        if (!cls) {
            const tempCls = al.desClasse || al.classe || root.desDenominazione || '';
            const norm = normalizeClass(tempCls);
            if (norm) cls = norm;
        }

        if (name && cls) break;
    }

    return { name, cls };
}

function extractStudentFromDashboard(dashboardData) {
    let name = null, cls = null;

    try {
        const dataObj = dashboardData.data || dashboardData;
        const dati = dataObj.dati || [];

        if (dataObj.intestazione) {
            if (dataObj.intestazione.alunno) name = dataObj.intestazione.alunno.trim().toUpperCase();
            if (dataObj.intestazione.classe) cls = dataObj.intestazione.classe.trim().toUpperCase();
        }

        if ((!name || !cls) && dati.length > 0) {
            const primoBlocco = dati[0];
            if (primoBlocco.desAlunno) name = primoBlocco.desAlunno;
            if (primoBlocco.desClasse) cls = primoBlocco.desClasse;
        }

    } catch (e) {
        debugLog("⚠️ Errore estrazione identity da Dashboard", e.message);
    }

    return { name, cls };
}

// Funzioni rimosse: getScheda, getCurriculum, getAnagrafe, getAlunno
// Sostituite dalla strategia /profilo più performante
// Curriculum (classe corrente) con fallback famiglia
async function getCurriculum(headers) {
    try {
        const res = await axios.post(ENDPOINT + "curriculum", {}, { headers, timeout: 15000 });
        return res.data;
    } catch (_) {
        return {};
    }
}

async function getDashboard(headers) {
    try {
        const startDate = "2024-09-01 00:00:00";
        const DASHBOARD_OPTIONS = {
            votiGiornalieri: true,
            votiScrutinio: true,
            compiti: true,
            argomenti: true,
            promemoria: true,
            bacheca: true,
            noteDisciplinari: true,
            assenze: true,
            votiPeriodici: true
        };

        const payload = {
            dataultimoaggiornamento: startDate,
            opzioni: JSON.stringify(DASHBOARD_OPTIONS)
        };

        const res = await axios.post(ENDPOINT + "dashboard/dashboard", payload, {
            headers,
            timeout: 25000
        });

        return res.data;
    } catch (e) {
        debugLog("⚠️ Errore Dashboard", e.message);
        return {};
    }
}

function extractClassFromCurriculum(currData) {
    try {
        const d = safeData(currData);
        const list = Array.isArray(d) ? d : (d.dati || []);
        const current = list[0] || {};
        const name = buildName(current);
        const rawCls = current.desClasse || current.classe || current.classeCorrente || current.desDenominazione;
        const cls = normalizeClass(rawCls);
        return { name, cls };
    } catch (e) {
        debugLog("⚠️ Errore estrazione classe da Curriculum", e.message);
        return { name: null, cls: null };
    }
}


function createHeaders(school, accessToken, authToken, subjectId = null) {
    const headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + accessToken,
        "Accept": "application/json",
        "x-cod-min": school,
        "x-auth-token": authToken,
        "User-Agent": USER_AGENT,
        // Migliora compatibilità con API/JSF
        "Accept-Language": "it-IT,it;q=0.9",
        "X-Requested-With": "XMLHttpRequest"
    };
    // Header soggetto (richiesto da molte API Argo)
    if (subjectId) {
        headers["x-id-soggetto"] = String(subjectId);
        headers["x-prg-soggetto"] = String(subjectId);
        debugLog("🔑 Headers con Subject ID", {
            school: headers["x-cod-min"],
            "x-id-soggetto": headers["x-id-soggetto"],
            "x-prg-soggetto": headers["x-prg-soggetto"],
            authToken: headers["x-auth-token"] ? "***REDACTED***" : null,
            accessToken: headers["Authorization"] ? "***REDACTED***" : null
        });
    }
    return headers;
}

// ============= IDENTITY RESOLUTION (MULTI-STRATEGY) =============

async function resolveIdentityForProfile(school, username, password, accessToken, authToken, currentName, currentClass, subjectId = null) {
    let name = (currentName || '').trim().toUpperCase();
    let cls = normalizeClass(currentClass) || '';

    // Se il nome attuale non è valido (es. placeholder o username), lo azzeriamo per forzare la riricerca
    if (!isValidName(name, username)) {
        name = null;
    }

    // FAST EXIT: Solo se il nome è VALIDO e la classe è completa
    if (isValidName(name, username) && cls && CLASS_REGEX.test(cls)) {
        return { name, cls };
    }

    const headers = createHeaders(school, accessToken, authToken, subjectId);
    const baseApp = "https://www.portaleargo.it/appfamiglia/api/rest/";

    // =================================================================
    // STRATEGIA 1: /profilo (MOLTO ROBUSTO - UNICA FUNZIONANTE IN MOLTE SCUOLE)
    // =================================================================
    try {
        debugLog("🕵️ Identity: Tentativo prioritario (Profilo - endpoint 9)...");
        const r9 = await axios.get(baseApp + "profilo", { headers, timeout: 6000 });
        const d9 = safeData(r9.data);

        if (!name) {
            const al = d9.alunno || d9;
            let extractedName = al.nominativo || (al.nome && al.cognome ? `${al.cognome} ${al.nome}` : null);
            if (extractedName && isValidName(extractedName, username)) {
                name = extractedName.trim().toUpperCase();
            }
        }

        if (!cls || !CLASS_REGEX.test(cls)) {
            const scheda = d9.scheda || {};
            const classeObj = scheda.classe || {};
            let extractedCls = "";

            if (classeObj.desDenominazione && classeObj.desSezione) {
                extractedCls = `${classeObj.desDenominazione}${classeObj.desSezione}`.trim().toUpperCase();
                // Arricchimento specializzazione (SA, LL, etc)
                let courseDesc = (classeObj.corso?.descrizione || classeObj.corso || classeObj.desCorso || scheda.desCorso || "").toUpperCase();
                let abbr = "";
                if (courseDesc.includes("SCIENZE APPLICATE")) abbr = "(SA)";
                else if (courseDesc.includes("SCIENZE UMANE")) abbr = "(SU)";
                else if (courseDesc.includes("CLASSICO")) abbr = "(LC)";
                else if (courseDesc.includes("SCIENTIFICO")) abbr = "(LS)";
                else if (courseDesc.includes("LINGUISTICO")) abbr = "(LL)";
                else if (courseDesc.includes("ARTISTICO")) abbr = "(LA)";
                else if (courseDesc.includes("ECONOMICO")) abbr = "(LES)";
                else if (courseDesc.includes("INFORMATICA")) abbr = "(INF)";
                if (abbr) extractedCls += " " + abbr;
            } else if (d9.desClasse || d9.classe) {
                extractedCls = normalizeClass(d9.desClasse || d9.classe);
            }

            if (extractedCls) cls = extractedCls;
        }

        if (isValidName(name, username) && cls && CLASS_REGEX.test(cls)) {
            debugLog("✅ Identity risolta con PROFILO");
            return { name, cls };
        }
    } catch (e) {
        debugLog("⚠️ Fail Profilo", e.message);
    }

    // =================================================================
    // STRATEGIA 2: /dashboard (Fallback veloce se Profilo fallisce)
    // =================================================================
    if (!isValidName(name, username) || !cls || !CLASS_REGEX.test(cls)) {
        try {
            debugLog("🕵️ Identity: Tentativo 2 (Dashboard)...");
            const dashboard = await getDashboard(headers);
            const extracted = extractStudentFromDashboard(dashboard);

            if (!name && extracted.name && isValidName(extracted.name, username)) name = extracted.name;
            if ((!cls || !CLASS_REGEX.test(cls)) && extracted.cls) cls = normalizeClass(extracted.cls) || cls;

            if (isValidName(name, username) && cls && CLASS_REGEX.test(cls)) {
                debugLog("✅ Identity risolta con DASHBOARD");
                return { name, cls };
            }
        } catch (e) {
            debugLog("⚠️ Fail Dashboard", e.message);
        }
    }

    // Le altre strategie (Curriculum, Scheda, Anagrafe, Alunno) sono state rimosse 
    // perché causano rallentamenti (404) e sono meno affidabili di /profilo.

    // Pulizia finale
    if (cls) cls = normalizeClass(cls) || cls;

    debugLog("🏁 Identity finale", { name, cls });
    return { name: name || null, cls: cls || null };
}



async function resolveClassFromAnagraficaWeb(jar) {
    try {
        if (!jar) return { name: null, cls: null };
        const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 15000 }));

        // 1. Session Warming: Passa dalla home per stabilizzare i cookie JSF
        const homeUrls = [
            'https://www.portaleargo.it/argoweb/famiglia/index.jsf',
            'https://www.portaleargo.it/argoweb/famiglia/common/avvisoScuola.jsf'
        ];
        for (const url of homeUrls) {
            await client.get(url, { headers: { 'User-Agent': USER_AGENT } }).catch(() => { });
        }

        // 2. Pagina Target: Analisi multi-pagina per Dati Anagrafici
        const candidates = [
            'https://www.portaleargo.it/argoweb/famiglia/anagrafica-alunno.jsf',
            'https://www.portaleargo.it/argoweb/famiglia/datiAnagrafici.jsf',
            'https://www.portaleargo.it/argoweb/famiglia/dati_anagrafici.jsf',
            'https://www.portaleargo.it/argoweb/famiglia/schedaAnagraficaAlunno.jsf'
        ];

        let res = null;
        for (const url of candidates) {
            try {
                const urlHit = url.split('/').pop();
                debugLog(`🌐 Identity (GOD MODE): Tentativo ${urlHit}...`);
                const tempRes = await client.get(url, {
                    headers: {
                        'User-Agent': USER_AGENT,
                        'Accept': 'text/html',
                        'Accept-Language': 'it-IT,it;q=0.9',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                // Semplice controllo se la pagina sembra contenere dati reali
                if (tempRes.data && (tempRes.data.includes('alunno') || tempRes.data.includes('nominativo'))) {
                    res = tempRes;
                    break;
                }
            } catch (e) { continue; }
        }

        if (!res) return { name: null, cls: null };

        const $ = cheerio.load(res.data);
        let name = null, cls = null;

        // Helper: Validazione stringa nome
        const isValidName = (s) => {
            if (!s) return false;
            const t = s.toUpperCase();
            if (t.length < 3) return false;
            // Scarta boilerplate PWA/UI
            if (/PASSWORD|RECUPERA|CAMBIA|LOGOUT|ESC|ACCEDI|REGISTRA|MENU|CERCA/i.test(t)) return false;
            // Scarta label stesse
            if (/^NOMINATIVO$|^ALUNNO$|^STUDENTE$/i.test(t)) return false;
            return true;
        };

        const cleanAndCaps = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();

        // --- RICERCA NOME ---
        // A) ID Prioritari
        const idPriorities = ['#_idJsp44', '#nominativo', '#alunnoName', '[id*="nominativoAlunno"]'];
        for (const selector of idPriorities) {
            const raw = $(selector).text().trim() || $(selector).val();
            if (isValidName(raw)) {
                name = cleanAndCaps(raw.replace(/^(Alunno|Studente|Nominativo)\s*:\s*/i, ''));
                break;
            }
        }

        // B) Keyword Scanning (Cerca label e vedi valore adiacente)
        if (!name) {
            $('td, span, div, label, b, th').each((_, el) => {
                if (name) return; // break
                const txt = $(el).text().trim();
                if (/^(Nominativo|Alunno|Studente)\s*:/i.test(txt)) {
                    // Cerca nel testo stesso dopo i due punti
                    const afterColon = txt.split(':')[1];
                    if (isValidName(afterColon)) {
                        name = cleanAndCaps(afterColon);
                    }
                    // Altrimenti guarda il prossimo elemento
                    const nextVal = $(el).next().text().trim() || $(el).parent().next().text().trim();
                    if (!name && isValidName(nextVal)) {
                        name = cleanAndCaps(nextVal);
                    }
                }
            });
        }

        // C) Form Analysis (Nome/Cognome separati)
        if (!name) {
            let extractedNome = null, extractedCognome = null;
            $('label, td').each((_, el) => {
                const txt = $(el).text().trim();
                const val = $(el).nextAll('td, span, input').first().text().trim() || $(el).nextAll('input').first().val();
                if (/^Nome$/i.test(txt)) extractedNome = val;
                if (/^Cognome$/i.test(txt)) extractedCognome = val;
            });
            if (extractedNome || extractedCognome) {
                const combined = `${extractedCognome || ''} ${extractedNome || ''}`.trim();
                if (isValidName(combined)) name = cleanAndCaps(combined);
            }
        }

        // --- RICERCA CLASSE ---
        // A) ID Prioritari
        const clsIds = ['#_idJsp56', '[id*="classe"]', '[id*="sezione"]'];
        for (const selector of clsIds) {
            const raw = $(selector).text().trim() || $(selector).val();
            const norm = normalizeClass(raw);
            if (norm) { cls = norm; break; }
        }

        // B) Keyword Scanning
        if (!cls) {
            $('td, span, div, label, b').each((_, el) => {
                if (cls) return;
                const txt = $(el).text().trim();
                if (/^Classe$|^Sezione$/i.test(txt)) {
                    const val = $(el).next().text().trim() || $(el).next('input').val() || $(el).parent().next().text().trim();
                    const norm = normalizeClass(val);
                    if (norm) cls = norm;
                }
                // Check for "Classe: 3A" in the same text
                const match = txt.match(/(?:Classe|Sezione)\s*:\s*([1-5]\s*[A-Z]{1,2})/i);
                if (match) cls = normalizeClass(match[1]);
            });
        }

        // C) Global Text Search (Ultima Spiggia)
        if (!cls) {
            const bodyText = $('body').text().replace(/\s+/g, ' ');
            // Cerchiamo pattern specifici in blocchi di testo
            const patterns = [
                /(?:Classe|Sezione|Frequentante la)\s*:\s*([1-5][\^°]?\s*[A-Z]{1,2})/i,
                /(?:Classe|Sezione|Frequentante la)\s+([1-5][\^°]?\s*[A-Z]{1,2})/i,
                /\b([1-5])[\^°]?\s*([A-Z])\b/
            ];
            for (const p of patterns) {
                const m = bodyText.match(p);
                if (m) {
                    const found = normalizeClass(m[1] + (m[2] ? m[2] : ''));
                    if (found) { cls = found; break; }
                }
            }
        }

        if (DEBUG_MODE) debugLog(`✅ GOD MODE Results`, { name, cls });
        return { name: name || null, cls: cls || null };

    } catch (e) {
        debugLog("⚠️ resolveClassFromAnagraficaWeb GOD MODE error", e.message);
        return { name: null, cls: null };
    }
}

async function resolveIdentityFromWebUI(jar) {
    try {
        if (!jar) return { name: null, cls: null };

        const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 15000 }));
        const url = 'https://www.portaleargo.it/argoweb/famiglia/index.jsf';

        debugLog("🌐 Identity: Fallback ULTIMA SPIAGGIA (HTML Scraping)...");
        const res = await client.get(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' }
        });

        const $ = cheerio.load(res.data);

        // Helper: Validazione stringa nome (Anti-UI)
        const isValidName = (s) => {
            if (!s) return false;
            const t = s.toUpperCase();
            return t.length >= 3 && !/PASSWORD|RECUPERA|CAMBIA|LOGOUT|ESC|ACCEDI|REGISTRA|MENU|CERCA/i.test(t);
        };

        const cleanAndCaps = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();

        // Nome principale
        let name = null;
        const nameIds = ['#_idJsp44', '#nominativo', '[id*="nominativo"]'];
        for (const id of nameIds) {
            const raw = $(id).text().trim();
            if (isValidName(raw)) {
                name = cleanAndCaps(raw.replace(/^(Alunno|Studente|Nominativo)\s*:\s*/i, ''));
                break;
            }
        }

        if (!name) {
            const t = $('span:contains("Alunno:")').next().text().trim() ||
                $('td:contains("Alunno:")').next().text().trim() ||
                $('span:contains("Nominativo")').text();
            if (isValidName(t)) {
                name = cleanAndCaps(t.replace(/^(Alunno|Studente|Nominativo)\s*:\s*/i, ''));
            }
        }

        // Classe
        let cls = null;
        const clsIds = ['#_idJsp56', '[id*="classe"]', '[id*="sezione"]'];
        for (const id of clsIds) {
            const raw = $(id).text().trim();
            const norm = normalizeClass(raw);
            if (norm) { cls = norm; break; }
        }

        if (!cls) {
            const bodyText = $('body').text().replace(/\s+/g, ' ');
            const patterns = [
                /(?:Classe|Sezione)\s*:\s*([1-5][\^°]?\s*[A-Z]{1,2})/i,
                /\b([1-5])[\^°]?\s*([A-Z])\b/
            ];
            for (const p of patterns) {
                const m = bodyText.match(p);
                if (m) {
                    const found = normalizeClass(m[1] + (m[2] ? m[2] : ''));
                    if (found) { cls = found; break; }
                }
            }
        }

        if (name) debugLog(`✅ Identity risolta da WEB UI: ${name} (${cls})`);
        return { name, cls: cls || "N/D" };
    } catch (e) {
        debugLog("⚠️ resolveIdentityFromWebUI error", e.message);
        return { name: null, cls: null };
    }
}

// ============= GRADE EXTRACTION (3 STRATEGIE) =============

async function extractGradesMultiStrategy(headers) {
    let grades = [];

    // Strategia 1: Dashboard
    try {
        const dashboardData = await getDashboard(headers);
        let datiList = dashboardData?.data?.dati || dashboardData?.dati || [];

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

                        // ID Stabile basato su materia + valore + data
                        const stableId = generateStableId(`${materia}-${valore}-${data}`);

                        grades.push({
                            materia,
                            valore,
                            data,
                            tipo,
                            subject: materia,
                            value: valore,
                            date: data,
                            id: stableId
                        });
                    }
                }
            }
        }
        if (grades.length > 0) return grades;
    } catch (e) {
        debugLog("⚠️ Grade Strategia 1 fallita", e.message);
    }

    // Strategia 2: API Diretta
    try {
        const endpoints = ["votiGiornalieri", "voti"];
        const baseUrl = ENDPOINT.replace('/appfamiglia', '/famiglia');

        for (const ep of endpoints) {
            try {
                const res = await axios.get(baseUrl + ep, { headers, timeout: 10000 });

                if (res.status === 200 && Array.isArray(res.data)) {
                    for (const v of res.data) {
                        const materia = v.desMateria || 'N/D';
                        const valore = v.codVoto || '';
                        const data = v.datGiorno || '';

                        // ID Stabile
                        const stableId = generateStableId(`${materia}-${valore}-${data}`);

                        grades.push({
                            materia,
                            valore,
                            data,
                            subject: materia,
                            value: valore,
                            date: data,
                            id: stableId
                        });
                    }
                    if (grades.length > 0) {
                        debugLog("✅ Grade Strategia 2 succeeded");
                        return grades;
                    }
                }
            } catch (err) {
                continue;
            }
        }
    } catch (e) {
        debugLog("⚠️ Grade Strategia 2 fallita", e.message);
    }

    debugLog("⚠️ Nessun voto trovato");
    return grades;
}

// ============= HOMEWORK EXTRACTION =============

async function extractHomeworkSafe(headers) {
    const tasksData = [];

    try {
        const dashboardData = await getDashboard(headers);
        const rawHomework = {};

        const dati = dashboardData?.data?.dati || dashboardData?.dati || [];

        for (const blocco of dati) {
            const registro = blocco.registro || [];

            for (const element of registro) {
                const compiti = element.compiti || [];
                const materia = element.materia || 'Generico';

                for (const compito of compiti) {
                    const dataConsegna = compito.dataConsegna;
                    if (!dataConsegna) continue;

                    if (!rawHomework[dataConsegna]) {
                        rawHomework[dataConsegna] = { compiti: [], materie: [] };
                    }

                    const testo = compito.desCompito || compito.compito || "";
                    if (testo) {
                        rawHomework[dataConsegna].compiti.push(testo);
                        rawHomework[dataConsegna].materie.push(materia);
                    }
                }
            }
        }

        for (const [dateStr, details] of Object.entries(rawHomework)) {
            const compitiList = details.compiti;
            const materieList = details.materie;

            compitiList.forEach((desc, i) => {
                const mat = materieList[i] || "Generico";
                // ID Stabile basato su testo + materia + data
                const stableId = generateStableId(`${desc}-${mat}-${dateStr}`);

                tasksData.push({
                    id: stableId,
                    text: desc,
                    subject: mat,
                    due_date: dateStr,
                    datCompito: dateStr,
                    materia: mat,
                    done: false
                });
            });
        }

    } catch (e) {
        debugLog("⚠️ Errore compiti", e.message);
    }

    return tasksData;
}

// ============= PROMEMORIA EXTRACTION =============

async function extractPromemoria(headers) {
    const promemoria = [];

    try {
        const dashboardData = await getDashboard(headers);
        let datiList = dashboardData?.data?.dati || dashboardData?.dati || [];

        for (const blocco of datiList) {
            const items = [...(blocco.bachecaAlunno || []), ...(blocco.promemoria || [])];

            for (const i of items) {
                const titolo = i.desOggetto || i.titolo || 'Avviso';
                const testo = i.desMessaggio || i.testo || i.desAnnotazioni || '';
                const autore = i.desMittente || 'Scuola';
                const data = i.datGiorno || i.data || '';

                // ID Stabile
                const stableId = generateStableId(`${titolo}-${testo}-${data}`);

                promemoria.push({
                    titolo,
                    testo,
                    autore,
                    data,
                    url: i.urlAllegato || '',
                    oggetto: titolo,
                    date: data,
                    id: stableId
                });
            }
        }

    } catch (e) {
        debugLog("⚠️ Errore promemoria", e.message);
    }

    return promemoria;
}

// ============= FILE PERSISTENCE =============

const POSTS_FILE = path.join(__dirname, 'posts.json');
const MARKET_FILE = path.join(__dirname, 'market.json');
const POLLS_FILE = path.join(__dirname, 'polls.json');

function loadJsonFile(filepath, defaultVal = []) {
    try {
        if (fs.existsSync(filepath)) {
            return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        }
    } catch (e) {
        console.error(`Error loading ${filepath}:`, e);
    }
    return defaultVal;
}

function saveJsonFile(filepath, data) {
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`Error saving ${filepath}:`, e);
    }
}

// ============= ROUTES =============

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: "ok", debug: DEBUG_MODE });
});

// Avatar Upload (Supabase)
app.post('/api/upload', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase non configurato" });

    try {
        const { image: base64Image, userId = uuidv4() } = req.body;

        if (!base64Image || !base64Image.startsWith('data:image/')) {
            return res.status(400).json({ success: false, error: "Formato immagine non valido" });
        }

        const matches = base64Image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (!matches) throw new Error("Invalid base64");

        const ext = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `${userId.replace(/:/g, '_')}_${Date.now()}.${ext}`;

        const { data, error } = await supabase.storage.from('avatars').upload(filename, buffer, {
            contentType: `image/${ext}`,
            upsert: true
        });

        if (error) throw error;

        const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filename);

        debugLog(`✅ Avatar uploaded: ${filename}`, { url: publicData.publicUrl });
        res.status(200).json({ success: true, url: publicData.publicUrl });

    } catch (e) {
        debugLog("❌ Avatar upload failed", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Update Profile
app.put('/api/profile', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase non configurato" });

    try {
        const { userId, name, class: className, avatar, specialization } = req.body;
        if (!userId) return res.status(400).json({ success: false, error: "userId mancante" });

        const profileData = {
            id: userId,
            last_active: new Date().toISOString()
        };

        if (name) profileData.name = name;
        if (className) profileData.class = className;
        if (specialization) profileData.specialization = specialization;
        if (avatar) {
            if (!avatar.startsWith('http')) {
                return res.status(400).json({ success: false, error: "Avatar deve essere URL" });
            }
            profileData.avatar = avatar;
        }

        const { error } = await supabase.from("profiles").upsert(profileData, { onConflict: "id" });
        if (error) throw error;

        debugLog(`✅ Profile updated: ${userId}`);
        res.status(200).json({ success: true });

    } catch (e) {
        debugLog("❌ Profile update failed", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get Profile
app.get('/api/profile/:user_id', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase non configurato" });

    try {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", req.params.user_id);

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ success: false, error: "Profilo non trovato" });
        }

        debugLog(`✅ Profile retrieved: ${req.params.user_id}`);
        res.status(200).json({ success: true, data: data[0] });

    } catch (e) {
        debugLog("❌ Profile retrieval failed", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Posts CRUD
app.get('/api/posts', async (req, res) => {
    if (supabase) {
        try {
            const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100);
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Posts GET error", e.message);
        }
    }
    res.json({ success: true, data: loadJsonFile(POSTS_FILE) });
});

app.post('/api/posts', async (req, res) => {
    const body = req.body || {};
    if (!body.text) return res.status(400).json({ success: false, error: "Missing text" });

    if (supabase) {
        try {
            const payload = {
                author_id: body.authorId || body.author_id,
                author_name: body.author || body.author_name,
                class: body.class,
                text: body.text,
                image: body.image,
                anon: !!body.anon
            };
            await supabase.from("posts").insert(payload);
            const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100);
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Posts POST error", e.message);
        }
    }

    const newPost = { ...body, id: Date.now() };
    const posts = loadJsonFile(POSTS_FILE);
    posts.unshift(newPost);
    saveJsonFile(POSTS_FILE, posts.slice(0, 100));
    res.json({ success: true, data: posts });
});
app.post('/api/posts/:id/like', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!supabase) return res.status(500).json({ success: false });

    try {
        const { data: post } = await supabase.from("posts").select("likes").eq("id", id).single();
        if (!post) return res.status(404).json({ success: false });

        let likes = post.likes || [];
        if (likes.includes(userId)) {
            likes = likes.filter(uid => uid !== userId);
        } else {
            likes.push(userId);
        }

        await supabase.from("posts").update({ likes }).eq("id", id);
        res.json({ success: true, likes });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/posts/:id/comment', async (req, res) => {
    const { id } = req.params;
    const { author, text } = req.body;
    if (!supabase) return res.status(500).json({ success: false });

    try {
        const { data: post } = await supabase.from("posts").select("comments").eq("id", id).single();
        if (!post) return res.status(404).json({ success: false });

        const comments = post.comments || [];
        comments.push({ author, text, created_at: new Date().toISOString() });

        await supabase.from("posts").update({ comments }).eq("id", id);
        res.json({ success: true, comments });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Market CRUD

// Market CRUD
app.get('/api/market', async (req, res) => {
    if (supabase) {
        try {
            const { data } = await supabase.from("market_items").select("*").order("created_at", { ascending: false }).limit(200);
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Market GET error", e.message);
        }
    }
    res.json({ success: true, data: loadJsonFile(MARKET_FILE) });
});

app.post('/api/market', async (req, res) => {
    const body = req.body || {};
    if (!body.title || !body.price) return res.status(400).json({ success: false, error: "Missing title/price" });

    const images = Array.isArray(body.images) ? body.images : (body.image ? [body.image] : []);
    const description = body.description || "";

    if (supabase) {
        try {
            const payload = {
                seller_id: body.sellerId || body.seller_id,
                seller_name: body.seller || body.seller_name,
                title: body.title,
                price: body.price,
                description,
                images,
                status: body.status || 'available'
            };
            await supabase.from("market_items").insert(payload);
            const { data } = await supabase.from("market_items").select("*").order("created_at", { ascending: false }).limit(200);
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Market POST error", e.message);
        }
    }

    const newItem = { ...body, id: Date.now(), description, images, status: body.status || 'available' };
    const items = loadJsonFile(MARKET_FILE);
    items.unshift(newItem);
    saveJsonFile(MARKET_FILE, items);
    res.json({ success: true, data: items });
});

app.post('/api/market/orders', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase not configured" });

    try {
        const { itemId, sellerId, buyerId, type, offerPrice, threadId } = req.body;
        if (!itemId || !sellerId || !buyerId || !type) {
            return res.status(400).json({ success: false, error: "Missing fields" });
        }

        const status = type === 'purchase' ? 'completed' : 'pending';
        const payload = {
            item_id: String(itemId),
            seller_id: sellerId,
            buyer_id: buyerId,
            type,
            status,
            offer_price: offerPrice || null,
            agreed_price: type === 'purchase' ? offerPrice || null : null,
            thread_id: threadId || null
        };

        const { data, error } = await supabase.from('market_orders').insert(payload).select().single();
        if (error) throw error;

        if (type === 'purchase') {
            await supabase.from('market_items').update({ status: 'sold' }).eq('id', itemId);
        }

        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/market/orders/:id', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase not configured" });
    try {
        const { data, error } = await supabase.from('market_orders').select('*').eq('id', req.params.id).single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/market/orders/:id/decision', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase not configured" });

    try {
        const { decision } = req.body; // 'accepted' | 'rejected'
        if (!['accepted', 'rejected'].includes(decision)) {
            return res.status(400).json({ success: false, error: "Invalid decision" });
        }

        const { data, error } = await supabase
            .from('market_orders')
            .update({ status: decision, updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        if (decision === 'accepted') {
            await supabase.from('market_items').update({ status: 'reserved' }).eq('id', data.item_id);
        }
        if (decision === 'rejected') {
            await supabase.from('market_items').update({ status: 'available' }).eq('id', data.item_id);
        }

        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Polls CRUD
app.get('/api/polls', async (req, res) => {
    if (supabase) {
        try {
            const { data } = await supabase.from("polls").select("*").order("created_at", { ascending: false });
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Polls GET error", e.message);
        }
    }
    res.json({ success: true, data: loadJsonFile(POLLS_FILE) });
});

app.post('/api/polls', async (req, res) => {
    const body = req.body || {};
    const { question, choices, authorId, author, expiresAt } = body;

    if (!question || !choices) {
        return res.status(400).json({ success: false, error: "Missing question or choices" });
    }

    const newPoll = {
        id: uuidv4(),
        question,
        choices: choices.map(c => ({ id: c.id || uuidv4(), text: c.text, votes: 0 })),
        voters: {},
        author: authorId || author,
        created_at: new Date().toISOString(),
        expires_at: expiresAt
    };

    if (supabase) {
        try {
            await supabase.from("polls").insert(newPoll);
            const { data } = await supabase.from("polls").select("*").order("created_at", { ascending: false }).limit(10);
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Polls POST error", e.message);
        }
    }

    const polls = loadJsonFile(POLLS_FILE);
    polls.unshift(newPoll);
    saveJsonFile(POLLS_FILE, polls);
    res.json({ success: true, data: polls });
});

app.post('/api/polls/:poll_id/vote', async (req, res) => {
    const pollId = req.params.poll_id;
    const body = req.body || {};
    const voter = body.voterId || body.authorId || body.userId || body.voter;
    const choiceId = body.choiceId;

    if (!voter || !choiceId) {
        return res.status(400).json({ success: false, error: "Missing voterId or choiceId" });
    }

    if (supabase) {
        try {
            const { data } = await supabase.from("polls").select("*").eq("id", pollId).limit(1);

            if (!data || data.length === 0) {
                return res.status(404).json({ success: false, error: "Poll not found" });
            }

            const poll = data[0];
            const voters = poll.voters || {};
            const prevChoice = voters[voter];

            if (prevChoice === choiceId) {
                return res.json({ success: true, data: poll });
            }

            const choices = poll.choices || [];

            choices.forEach(ch => {
                if (ch.id === choiceId) ch.votes = (ch.votes || 0) + 1;
                if (prevChoice && ch.id === prevChoice) ch.votes = Math.max(0, (ch.votes || 0) - 1);
            });

            voters[voter] = choiceId;

            await supabase.from("polls").update({ choices, voters }).eq("id", pollId);

            const updated = await supabase.from("polls").select("*").eq("id", pollId).limit(1);
            return res.json({ success: true, data: updated.data[0] });

        } catch (e) {
            debugLog("⚠️ Poll vote error", e.message);
        }
    }

    const polls = loadJsonFile(POLLS_FILE);
    const poll = polls.find(p => p.id === pollId);

    if (!poll) {
        return res.status(404).json({ success: false, error: "Poll not found" });
    }

    const voters = poll.voters || {};
    const prevChoice = voters[voter];

    if (prevChoice === choiceId) {
        return res.json({ success: true, data: poll });
    }

    poll.choices.forEach(ch => {
        if (ch.id === choiceId) ch.votes = (ch.votes || 0) + 1;
        if (prevChoice && ch.id === prevChoice) ch.votes = Math.max(0, (ch.votes || 0) - 1);
    });

    voters[voter] = choiceId;
    poll.voters = voters;

    saveJsonFile(POLLS_FILE, polls);
    res.json({ success: true, data: poll });
});

// Chat Messages
// ==============================================================================
// 💬 G-CONNECT v7.0 RELATIONAL CHAT API (Expert Architecture)
// ==============================================================================

// 1. Create or Get Conversation (Private)
app.post('/api/conversations', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase missing" });
    const { participants } = req.body; // Array of userIDs, e.g. ["school:user:me", "school:user:him"]

    if (!participants || participants.length < 2) {
        return res.status(400).json({ success: false, error: "Minimum 2 participants required" });
    }

    try {
        // A. Check if a private conversation already exists between these exact users
        // Strategy: Find common conversation_id where both users are participants
        const userA = participants[0];
        const userB = participants[1];

        // Advanced SQL-like query via Supabase is complex, so we do a smart lookup
        // Get all convos for User A
        const { data: convosA, error: errA } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userA);

        if (errA) throw errA;

        let existingConvoId = null;

        // Check if User B is in any of these convos
        if (convosA && convosA.length > 0) {
            const ids = convosA.map(c => c.conversation_id);
            const { data: match, error: errMatch } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', userB)
                .in('conversation_id', ids)
                .limit(1);

            if (match && match.length > 0) {
                existingConvoId = match[0].conversation_id;
            }
        }

        if (existingConvoId) {
            console.log("✅ Conversation already exists:", existingConvoId);
            return res.json({ success: true, conversationId: existingConvoId, isNew: false });
        }

        // B. Create new Conversation
        const { data: stringConvo, error: createErr } = await supabase
            .from('conversations')
            .insert({ type: 'private', last_message_at: new Date() })
            .select()
            .single();

        if (createErr) throw createErr;
        const newConvoId = stringConvo.id;

        // C. Add Participants
        const participantsData = participants.map(uid => ({
            conversation_id: newConvoId,
            user_id: uid,
            joined_at: new Date()
        }));

        const { error: partErr } = await supabase
            .from('conversation_participants')
            .insert(participantsData);

        if (partErr) throw partErr;

        console.log("🆕 API: Created new conversation:", newConvoId);
        res.json({ success: true, conversationId: newConvoId, isNew: true });

    } catch (e) {
        console.error("❌ Create conversation error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2. Get Messages for Conversation
app.get('/api/conversations/:id/messages', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false });
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. Send Message (v7.0)
app.post('/api/messages', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase missing" });
    const { conversationId, senderId, text, type, meta } = req.body;

    try {
        // Insert message
        const { data: msg, error: msgErr } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender_id: senderId,
                content: text || '',
                type: type || 'text',
                meta: meta || {},
                created_at: new Date()
            })
            .select()
            .single();

        if (msgErr) throw msgErr;



        // Update conversation 'last_message_at' for sorting
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date() })
            .eq('id', conversationId);

        res.json({ success: true, data: msg });

    } catch (e) {
        console.error("❌ Send message error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 4. List User Conversations (Inbox)
app.get('/api/conversations/user/:userId', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false });
    const { userId } = req.params;

    try {
        // Get all items in conversation_participants for this user
        const { data: myConvos, error: err1 } = await supabase
            .from('conversation_participants')
            .select('conversation_id, last_read_at')
            .eq('user_id', userId);

        if (err1) throw err1;
        if (!myConvos || myConvos.length === 0) return res.json({ success: true, data: [] });

        const convoIds = myConvos.map(c => c.conversation_id);

        // Fetch conversation details + last message (via client-side logic optimization or join)
        // Since Supabase join syntax is tricky in raw client, we do:
        // Get conversations details
        const { data: conversations, error: err2 } = await supabase
            .from('conversations')
            .select('*')
            .in('id', convoIds)
            .order('last_message_at', { ascending: false });

        if (err2) throw err2;

        // Populate "Other Participant" for UI
        // For each convo, fetch the OTHER participant
        const enriched = await Promise.all(conversations.map(async (c) => {
            const { data: parts } = await supabase
                .from('conversation_participants')
                .select('user_id')
                .eq('conversation_id', c.id)
                .neq('user_id', userId) // Get the other guy
                .limit(1);

            const otherId = parts && parts.length > 0 ? parts[0].user_id : 'Unknown';

            // 🆕 EXPERT FIX: Fetch profile name/avatar from DB to avoid "UTENTE" issues
            let otherName = 'Utente';
            let otherAvatar = null;
            if (otherId !== 'Unknown') {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('name, avatar')
                    .eq('id', otherId)
                    .maybeSingle();
                if (profile) {
                    otherName = profile.name || otherName;
                    otherAvatar = profile.avatar;
                }
            }

            // Fetch last message content
            const { data: lastMsg } = await supabase
                .from('messages')
                .select('content, created_at, sender_id')
                .eq('conversation_id', c.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            return {
                id: c.id,
                otherId: otherId,
                otherName: otherName,   // 🆕 Enriched from DB
                otherAvatar: otherAvatar, // 🆕 Enriched from DB
                lastMessage: lastMsg?.content || 'Inizia a chattare',
                lastAt: lastMsg?.created_at || c.created_at,
                senderId: lastMsg?.sender_id
            };
        }));

        res.json({ success: true, data: enriched });
    } catch (e) {
        console.error("❌ List conversations error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Legacy Chat Endpoints (Deprecated but kept for safety if needed)
app.get('/api/messages/thread/:thread_id', async (req, res) => {

    try {
        const msg = req.body;
        // Map fields from both potential frontend versions (threadId vs thread_id)
        const payload = {
            thread_id: msg.thread_id || msg.threadId,
            sender_id: msg.sender_id || msg.senderId,
            sender_name: msg.sender_name || msg.senderName,
            receiver_id: msg.receiver_id || msg.receiverId,
            receiver_name: msg.receiver_name || msg.receiverName,
            text: msg.text,
            type: msg.type || 'text',
            meta: msg.meta || {}
        };

        const { data: insertedData, error: insertError } = await supabase
            .from("chat_messages")
            .insert(payload)
            .select()
            .single();

        if (insertError) throw insertError;

        // For v2.7.0 compatibility, we return the inserted message, 
        // and optionally the whole thread if requested or as fallback
        const { data: allMessages, error: fetchError } = await supabase.from("chat_messages")
            .select("*")
            .eq("thread_id", payload.thread_id)
            .order("created_at", { ascending: true })
            .limit(500);

        if (fetchError) throw fetchError;

        res.json({ success: true, data: allMessages || [], inserted: insertedData });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============= USER DIRECTORY ROUTES =============

app.get('/api/users', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase not configured" });

    try {
        const { data, error } = await supabase
            .from('users_directory')
            .select('*')
            .order('last_seen', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/users/register', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase not configured" });

    try {
        const { id, name, class: userClass, status, avatar } = req.body;
        if (!id || !name) return res.status(400).json({ success: false, error: "Missing id/name" });

        const { data, error } = await supabase
            .from('users_directory')
            .upsert({
                id,
                name,
                class: userClass,
                status: status || 'online',
                avatar: avatar || null,
                last_seen: new Date().toISOString()
            }, { onConflict: 'id' });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============= PLANNER ROUTES =============

app.get('/api/planner/:user_id', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase not configured" });

    try {
        const userId = decodeURIComponent(req.params.user_id);
        debugLog(`📅 GET Planner Request for user: ${userId}`);

        const { data, error } = await supabase.from("planners")
            .select("*")
            .eq("user_id", userId)
            .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
            debugLog(`📅 Planner not found for user: ${userId}. Returning empty.`);
            return res.status(200).json({
                success: true,
                data: {
                    user_id: userId,
                    planned_tasks: {},
                    stress_levels: {},
                    planned_details: {},
                    updated_at: null
                }
            });
        }

        debugLog(`✅ Planner loaded for ${userId}:`, {
            plannedDays: Object.keys(data[0].planned_tasks || {}).length,
            stressLevels: Object.keys(data[0].stress_levels || {}).length,
            updatedAt: data[0].updated_at
        });

        res.json({ success: true, data: data[0] });
    } catch (e) {
        debugLog(`❌ GET Planner Error: ${e.message}`);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Supabase REST helpers for fallback
function sbHeaders() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }
    return {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json"
    };
}
function sbTableUrl(table) {
    return `${process.env.SUPABASE_URL}/rest/v1/${table}`;
}

app.put('/api/planner/:user_id', async (req, res) => {
    const userId = decodeURIComponent(req.params.user_id);
    const body = req.body || {};

    debugLog(`📅 PUT Planner Request for user: ${userId}`, {
        plannedTasksKeys: Object.keys(body.plannedTasks || body.planned_tasks || {}).length,
        stressLevelsKeys: Object.keys(body.stressLevels || body.stress_levels || {}).length,
        plannedDetailsKeys: Object.keys(body.plannedDetails || body.planned_details || {}).length
    });

    const payload = {
        user_id: userId,
        planned_tasks: body.plannedTasks || body.planned_tasks || {},
        stress_levels: body.stressLevels || body.stress_levels || {},
        planned_details: body.plannedDetails || body.planned_details || {},
        updated_at: new Date().toISOString()
    };

    // Prima prova supabase-js
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('planners')
                .upsert(payload, { onConflict: 'user_id' })
                .select()
                .single();

            if (!error && data) {
                debugLog(`✅ Planner saved successfully for ${userId}`);
                return res.json({
                    success: true,
                    data: {
                        userId: data.user_id,
                        plannedTasks: data.planned_tasks,
                        stressLevels: data.stress_levels,
                        plannedDetails: data.planned_details,
                        updatedAt: data.updated_at
                    }
                });
            }
            debugLog("⚠️ planner upsert supabase-js error", error?.message);
        } catch (e) {
            debugLog("⚠️ planner upsert supabase-js exception", e.message);
        }
    }

    // Fallback REST (come Python)
    try {
        const url = `${sbTableUrl('planners')}?on_conflict=user_id`;
        const headers = sbHeaders();
        headers.Prefer = "resolution=merge-duplicates,return=representation";

        const r = await axios.post(url, payload, { headers, timeout: 15000 });
        const rows = Array.isArray(r.data) ? r.data : [r.data];
        const row = rows[0] || payload;

        return res.json({
            success: true,
            data: {
                userId: row.user_id,
                plannedTasks: row.planned_tasks,
                stressLevels: row.stress_levels,
                plannedDetails: row.planned_details,
                updatedAt: row.updated_at
            }
        });
    } catch (e) {
        debugLog("planner upsert REST error", e.response?.data || e.message);
        return res.status(e.response?.status || 500).json({ success: false, error: e.response?.data || e.message });
    }
});

// ============= AUTH ENDPOINTS =============

// ============= DEBUG ENDPOINT (per visualizzare dati raw del profilo) =============

app.post('/api/debug/profile-raw', async (req, res) => {
    if (!DEBUG_MODE) {
        return res.status(403).json({
            success: false,
            error: "Debug endpoint disponibile solo con DEBUG_MODE=true"
        });
    }

    const { schoolCode, username, password, profileIndex } = req.body;
    const school = (schoolCode || '').trim().toUpperCase();
    const user = (username || '').trim().toLowerCase();
    const idx = parseInt(profileIndex) || 0;

    if (!school || !user || !password) {
        return res.status(400).json({ success: false, error: "Parametri mancanti" });
    }

    try {
        const loginRes = await AdvancedArgo.rawLogin(school, user, password);
        const profiles = loginRes.profiles || [];

        if (profiles.length === 0) {
            return res.status(404).json({ success: false, error: "Nessun profilo trovato" });
        }

        const targetIdx = (idx < 0 || idx >= profiles.length) ? 0 : idx;
        const profile = profiles[targetIdx];

        // Estrai tutti i dati raw interessanti
        const rawData = profile.raw || {};
        const scheda = rawData.scheda || {};
        const classeObj = scheda.classe || {};

        res.json({
            success: true,
            profileIndex: targetIdx,
            totalProfiles: profiles.length,
            profile: {
                name: profile.name,
                class: profile.class,
                school: profile.school,
                idSoggetto: profile.idSoggetto
            },
            rawData: {
                // Dati classe
                classe: {
                    desDenominazione: classeObj.desDenominazione,
                    desSezione: classeObj.desSezione,
                    desCorso: classeObj.desCorso,
                    corso: classeObj.corso, // Questo potrebbe essere l'oggetto con "descrizione"
                    fullClasseObject: classeObj // Tutti i campi
                },
                // Altri dati scheda
                scheda: scheda,
                // Tutto il raw per debug completo
                fullRaw: rawData
            }
        });

    } catch (e) {
        res.status(500).json({
            success: false,
            error: e.message,
            stack: e.stack
        });
    }
});

app.post('/api/resolve-profile', async (req, res) => {
    const { schoolCode, username, password, profileIndex } = req.body;
    const school = (schoolCode || '').trim().toUpperCase();
    const user = (username || '').trim().toLowerCase();
    const idx = parseInt(profileIndex) || 0;

    if (!school || !user || !password) {
        return res.status(400).json({ success: false, error: "Parametri mancanti" });
    }

    try {
        const loginRes = await AdvancedArgo.rawLogin(school, user, password);
        const profiles = loginRes.profiles || [];

        if (profiles.length === 0) {
            return res.status(404).json({ success: false, error: "Nessun profilo" });
        }

        const targetIdx = (idx < 0 || idx >= profiles.length) ? 0 : idx;
        const target = profiles[targetIdx];

        const { name, cls } = await resolveIdentityForProfile(
            school, user, password,
            loginRes.access_token, target.token,
            target.name, target.class,
            target.idSoggetto
        );

        const finalClass = normalizeClass(cls);
        res.json({
            success: true,
            name: name || `STUDENTE ${targetIdx + 1}`,
            class: finalClass || "N/D"
        });

    } catch (e) {
        debugLog("⚠️ resolve_profile error", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Login Endpoint
app.post('/login', async (req, res) => {
    const body = req.body;
    const school = (body.schoolCode || body.school || '').trim().toUpperCase();
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password;
    const selectedProfileIndex = (body.selectedProfileIndex !== undefined) ? body.selectedProfileIndex :
        (body.profileIndex !== undefined ? body.profileIndex : null);

    if (!school || !username || !password) {
        return res.status(400).json({ success: false, error: "Dati mancanti" });
    }

    try {
        debugLog("LOGIN REQUEST", { school, username, idx: selectedProfileIndex });

        // 1. Raw Login (Ottiene i token)
        const loginRes = await AdvancedArgo.rawLogin(school, username, password);
        const accessToken = loginRes.access_token;
        let profiles = loginRes.profiles || [];

        // 2. Arricchimento Profili (Recupero nomi reali se mancanti)
        profiles = await enrichProfiles(school, accessToken, profiles);

        // 3. Verifica Multi-Profilo
        // Se ci sono più profili e l'utente non ne ha scelto uno, restituiamo la lista
        if (profiles.length > 1 && selectedProfileIndex === null) {
            debugLog("⚠️ Rilevati profili multipli, richiesta selezione al frontend.");
            return res.status(200).json({
                success: true,
                status: "MULTIPLE_PROFILES",
                profiles: profiles.map(p => ({
                    index: p.index,
                    name: p.name,
                    class: p.class,
                    school: school
                }))
            });
        }

        // 4. Selezione Profilo Target
        let targetIndex = 0;
        if (selectedProfileIndex !== null) {
            targetIndex = parseInt(selectedProfileIndex);
        }
        if (targetIndex < 0 || targetIndex >= profiles.length) targetIndex = 0;

        const targetProfile = profiles[targetIndex];
        const authToken = targetProfile.token;

        if (!accessToken || !authToken) {
            throw new Error("Impossibile recuperare i token di sessione");
        }

        // 5. Identità autoritativa
        let studentName = targetProfile.name;
        let studentClass = targetProfile.class; // ✅ FIX: Mantieni l'originale con abbreviazione
        const jar = loginRes.jar;

        // Fallback HTML se i metodi JSON non hanno risolto il nome reale
        if ((!studentName || studentName.startsWith('STUDENTE')) || studentClass === "N/D") {
            const webId = await resolveIdentityFromWebUI(jar);
            if (webId.name) studentName = webId.name;
            if (webId.cls && webId.cls !== "N/D") studentClass = normalizeClass(webId.cls) || studentClass;

            // Se ancora non valida, prova direttamente "Dati Anagrafici"
            if (!normalizeClass(studentClass) || (!studentName || studentName.startsWith('STUDENTE'))) {
                const webAna = await resolveClassFromAnagraficaWeb(jar);
                if (webAna.cls) studentClass = normalizeClass(webAna.cls) || studentClass;
                // Usa il nome reale se ancora placeholder
                if (webAna.name && (!studentName || studentName.startsWith('STUDENTE'))) {
                    studentName = webAna.name;
                }
            }
        }

        // 4. Dati Scolastici (Parallelo)
        const headers = createHeaders(school, accessToken, authToken, targetProfile?.idSoggetto);
        const [gradesData, tasksData, announcementsData] = await Promise.all([
            extractGradesMultiStrategy(headers),
            extractHomeworkSafe(headers),
            extractPromemoria(headers)
        ]);

        const pid = `${school}:${username}:${targetIndex}`;
        let storedSpecialization = null;

        if (supabase) {
            // 5. Supabase Sync & Retrieval (Fix Persistence)

            try {
                const normalizedClass = normalizeClass(studentClass);

                // A) Fetch existing data first to get stored preferences
                const { data: existingProfile } = await supabase
                    .from("profiles")
                    .select("specialization")
                    .eq("id", pid)
                    .single();

                if (existingProfile && existingProfile.specialization) {
                    storedSpecialization = existingProfile.specialization;
                }

                // B) Upsert identity (Argo is truth for Name/Class) but keep Specialization
                // Upserting only provided fields should preserve others if not null, 
                // but explicit merge is safer for logic flow
                await supabase.from("profiles").upsert({
                    id: pid,
                    name: studentName,
                    class: normalizedClass || studentClass || "N/D",
                    last_active: new Date().toISOString()
                }, { onConflict: "id" });

                debugLog("👤 Profile synced", { id: pid, spec: storedSpecialization });
            } catch (e) {
                debugLog("⚠️ Supabase sync error", e.message);
            }
        }

        // 6. Response
        const resp = {
            success: true,
            session: {
                schoolCode: school,
                authToken: authToken,
                accessToken: accessToken,
                userName: username,
                profileIndex: targetIndex
            },
            student: {
                id: pid, // 🔥 FIX: Authoritative ID for frontend
                name: studentName,
                class: studentClass || "N/D",
                school: school,
                specialization: storedSpecialization
            },
            tasks: tasksData,
            voti: gradesData,
            promemoria: announcementsData
        };

        if (targetProfile) {
            resp.selectedProfile = {
                index: targetIndex,
                name: studentName,
                class: studentClass,
                school: targetProfile.school || school,
                idSoggetto: targetProfile.idSoggetto
            };
        }

        if (profiles.length > 1) {
            resp.profiles = profiles.map(p => ({
                index: p.index,
                name: p.name,
                class: p.class,
                school: p.school || school
            }));
        }

        debugLog("📊 LOGIN SUCCESS", {
            student: studentName,
            class: studentClass,
            profiles: profiles.length
        });

        res.status(200).json(resp);

    } catch (e) {
        console.error("LOGIN FAILURE", e);
        res.status(401).json({
            success: false,
            error: e.message,
            traceback: DEBUG_MODE ? e.stack : null
        });
    }
});

// Test Profile Structure
app.post('/test/profile-structure', async (req, res) => {
    const { schoolCode, username, password } = req.body;

    if (!schoolCode || !username || !password) {
        return res.status(400).json({ error: "Missing credentials" });
    }

    const result = { profiles: [], errors: [], success: false };

    try {
        const loginRes = await AdvancedArgo.rawLogin(schoolCode, username, password);
        let profiles = loginRes.profiles || [];

        // Arricchimento test
        profiles = await enrichProfiles(schoolCode, loginRes.access_token, profiles);

        result.profiles = profiles.map(p => ({
            index: p.index,
            token_start: p.token ? p.token.substring(0, 8) + "..." : "NONE",
            name: p.name,
            class: p.class,
            raw_data_keys: Object.keys(p.raw || {})
        }));

        result.success = true;
        res.json(result);

    } catch (e) {
        result.errors.push({ error: e.message, traceback: e.stack });
        res.status(500).json(result);
    }
});

// Sync Endpoint
app.options('/sync', cors());  // ← PREFLIGHT per CORS

app.post('/sync', async (req, res) => {
    const body = req.body;
    const school = (body.schoolCode || '').trim().toUpperCase();
    const storedUser = body.storedUser;
    const storedPass = body.storedPass;
    let profileIndex = parseInt(body.profileIndex) || 0;

    try {
        debugLog("SYNC REQUEST", { school, profileIndex });

        if (!school || !storedUser || !storedPass) {
            return res.status(401).json({ success: false, error: "Credenziali mancanti" });
        }

        // Decode Base64
        const user = decodeURIComponent(Buffer.from(storedUser, 'base64').toString('utf-8')).trim().toLowerCase();
        const pwd = decodeURIComponent(Buffer.from(storedPass, 'base64').toString('utf-8'));

        let accessToken = null;
        let authToken = null;
        let profiles = [];

        try {
            const loginRes = await AdvancedArgo.rawLogin(school, user, pwd);
            accessToken = loginRes.access_token;
            profiles = loginRes.profiles || [];

            if (profiles.length > 0) {
                if (profileIndex < 0 || profileIndex >= profiles.length) profileIndex = 0;
                authToken = profiles[profileIndex].token;
            }
        } catch (e) {
            debugLog("⚠️ Sync Login Fail", e.message);
            throw e;
        }

        const headers = createHeaders(school, accessToken, authToken, profiles[profileIndex]?.idSoggetto);

        // Fetch in parallelo
        const [grades, tasks, promemoria] = await Promise.all([
            extractGradesMultiStrategy(headers),
            extractHomeworkSafe(headers),
            extractPromemoria(headers)
        ]);

        if (supabase) {
            try {
                let sName = null, sClass = null;

                if (profiles.length > 0) {
                    const t = profiles[profileIndex];
                    const resIdent = await resolveIdentityForProfile(
                        school, user, pwd,
                        accessToken, authToken,
                        t.name, t.class,
                        t.idSoggetto
                    );
                    sName = resIdent.name;
                    sClass = normalizeClass(resIdent.cls) || resIdent.cls;
                }

                const pid = `${school}:${user}:${profileIndex}`;
                const payload = { id: pid, last_active: new Date().toISOString() };

                if (sName) payload.name = sName;
                const sClassNorm = normalizeClass(sClass);
                if (sClassNorm) payload.class = sClassNorm;

                await supabase.from("profiles").upsert(payload, { onConflict: "id" });
                debugLog("👤 Sync profile upsert", payload);

            } catch (e) {
                debugLog("⚠️ Sync Supabase error", e.message);
            }
        }

        // ✅ FIX: Carica planner dal database con maybeSingle
        let plannerData = null;
        if (supabase) {
            try {
                const pid = `${school}:${user}:${profileIndex}`;
                debugLog("📅 Sync: Caricamento planner per", pid);

                const { data: plannerResult, error: plannerError } = await supabase
                    .from('planners')
                    .select('*')
                    .eq('user_id', pid)
                    .maybeSingle();

                if (plannerError) {
                    debugLog("⚠️ Planner query error", plannerError.message);
                } else if (plannerResult) {
                    plannerData = {
                        plannedTasks: plannerResult.planned_tasks || {},
                        stressLevels: plannerResult.stress_levels || {},
                        updatedAt: plannerResult.updated_at
                    };
                    debugLog("✅ Planner caricato in sync", {
                        plannedDays: Object.keys(plannerData.plannedTasks).length,
                        updatedAt: plannerData.updatedAt
                    });
                } else {
                    debugLog("ℹ️ Nessun planner esistente per questo utente");
                }
            } catch (e) {
                debugLog("⚠️ Planner sync exception", e.message);
            }
        }

        res.json({
            success: true,
            tasks,
            voti: grades,
            promemoria, // ✅ FIX: Usa la variabile corretta
            new_tokens: { authToken, accessToken },
            planner: plannerData
        });

    } catch (e) {
        debugLog("❌ SYNC FAILED", e.message);
        res.status(401).json({ success: false, error: e.message });
    }
});



// ============= ERROR HANDLER =============
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ success: false, error: "Internal Server Error" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server Node.js avviato su porta ${PORT}`);
    console.log(`Debug Mode: ${DEBUG_MODE}`);
    console.log(`Supabase: ${supabase ? '✅ Configurato' : '❌ Non disponibile'}`);
});
