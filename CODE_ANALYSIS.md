# Analisi del Codice — G-Connect Backend

> **Autore analisi:** GitHub Copilot (Ingegnere Senior)
> **Data:** Marzo 2026
> **Scope:** Tutti i file sorgente del repository (`lib/`, `api/`, `api_internal/`, file di configurazione)

---

## Indice

1. [Codice Duplicato (DRY Violations)](#1-codice-duplicato-dry-violations)
2. [Debug e Log in Produzione](#2-debug-e-log-in-produzione)
3. [Problemi di Sicurezza](#3-problemi-di-sicurezza)
4. [Variabili e Configurazioni Inutilizzate o Obsolete](#4-variabili-e-configurazioni-inutilizzate-o-obsolete)
5. [Dati Hardcoded Specifici per Scuola/Classe](#5-dati-hardcoded-specifici-per-scuolaclasse)
6. [Inefficienze Architetturali e di Design](#6-inefficienze-architetturali-e-di-design)
7. [Qualità e Coerenza del Codice](#7-qualità-e-coerenza-del-codice)
8. [Riepilogo Priorità](#8-riepilogo-priorità)

---

## 1. Codice Duplicato (DRY Violations)

### 1.1 — `getSupabase()` definita 3 volte

| File | Righe |
|---|---|
| `lib/supabase.js` | 1–20 (versione canonica) |
| `api/google.js` | 21–29 (copia privata) |
| `api/cron-sync.js` | 15–23 (copia privata) |

**Problema:** Le due copie private in `api/google.js` e `api/cron-sync.js` presentano differenze critiche rispetto alla versione centralizzata:

```js
// api/google.js e api/cron-sync.js (SBAGLIATO)
const url = process.env.SUPABASE_URL || 'https://mlcutgkfunbpmrnbeznd.supabase.co'; // URL hardcoded!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
         || process.env.SUPABASE_SERVICE_KEY        // fallback aggiuntivi non presenti altrove
         || process.env.SUPABASE_ANON_KEY;

// lib/supabase.js (CORRETTO)
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.warn('⚠️ Supabase env vars missing'); return null; }
```

Conseguenze: URL del progetto hardcoded nel sorgente; comportamento divergente in caso di env vars mancanti; tre punti di manutenzione invece di uno.

**Fix:** Entrambi i file devono importare `getSupabase` da `lib/supabase.js` e rimuovere le definizioni locali.

---

### 1.2 — `parseJsonb()` definita in 2 posti separati

| File | Righe | Tipo |
|---|---|---|
| `api_internal/planner/[user_id].js` | 21–27 | funzione top-level |
| `api_internal/sync.js` | 110–116 | funzione inline (dentro try/catch) |

**Problema:** Logica identica duplicata. Se cambia la gestione di errore o il tipo restituito, va aggiornata in due posti.

**Fix:** Spostare `parseJsonb` in `lib/helpers.js` ed esportarla. Entrambi i file la importano.

---

### 1.3 — Funzioni wrapper "backward-compat" mai usate esternamente

In `lib/argo.js` esistono tre funzioni che sono semplici deleghe a funzioni più recenti:

```js
// lib/argo.js righe 261-263, 363-365, 737-739
// Kept for backward compat
async function extractGradesMultiStrategy(headers) {
    return extractGradesFromDashboard(await getDashboard(headers));
}

async function extractHomeworkSafe(headers) {
    return extractHomeworkFromDashboard(await getDashboard(headers));
}

async function extractPromemoria(headers) {
    return extractPromemoriaFromDashboard(await getDashboard(headers));
}
```

Una ricerca nel repository conferma che **nessun file esterno a `argo.js` le importa o le usa**. Sono esportate (`module.exports`) senza necessità.

**Fix:** Eliminare le tre funzioni e rimuoverle dall'oggetto `module.exports`.

---

### 1.4 — Helper `_isValid` e `clean` duplicati in `lib/argo.js`

```js
// resolveIdentityFromWebUI — righe 870–875
const _isValid = (s) => { ... };
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();

// resolveClassFromAnagraficaWeb — righe 919–920
const _isValid = (s) => s && s.length >= 3 && !/PASSWORD|RECUPERA|LOGOUT|ACCEDI/i.test(s);
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();
```

Le implementazioni sono quasi identiche ma le regex di `_isValid` differiscono leggermente. Questo introduce un rischio di comportamento inconsistente e rende difficile il test unitario.

**Fix:** Estrarre `_isValid` e `clean` come funzioni private nel modulo `lib/argo.js` (o riutilizzare `isValidName` già presente in `helpers.js`).

---

### 1.5 — `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` re-dichiarati dentro una funzione

In `api/google.js`:

```js
// Riga 32–33 — scope modulo
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Riga 42–43 — dentro getOAuth2Client() — SHADOWING!
function getOAuth2Client() {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    // ...
}
```

La `const` interna nasconde (shadow) quella esterna. I log di debug alle righe 46–49 usano le variabili interne. Le costanti modulo alle righe 32–33 sono di fatto inutilizzate.

**Fix:** Rimuovere le ridichiarazioni interne a `getOAuth2Client()` e usare le costanti di modulo.

---

### 1.6 — Logica di name-building duplicata in `lib/argo.js`

In `lib/helpers.js` esiste già `buildName(obj)` che gestisce la costruzione del nome da vari campi dell'oggetto (righe 80–87). Tuttavia, in `lib/argo.js` righe 156–161, la stessa logica è re-implementata inline:

```js
// lib/argo.js righe 156–161 (DUPLICATO)
let rawName = '';
if (alunno.desNominativo) rawName = alunno.desNominativo;
else if (alunno.nominativo) rawName = alunno.nominativo;
else if (alunno.desNome && alunno.desCognome) rawName = `${alunno.desCognome} ${alunno.desNome}`;
else if (alunno.nome && alunno.cognome) rawName = `${alunno.cognome} ${alunno.nome}`;
rawName = rawName.trim().toUpperCase();
```

**Fix:** Sostituire questo blocco con una chiamata a `buildName(alunno)`.

---

## 2. Debug e Log in Produzione

### 2.1 — `console.log` di debug permanente in `api/google.js`

```js
// api/google.js righe 45–49 — chiamato ad OGNI richiesta OAuth
function getOAuth2Client() {
    // ...
    console.log('=== OAuth Debug ===');
    console.log('CLIENT_ID:', GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.slice(0, 30) + '...' : 'MANCANTE');
    console.log('CLIENT_SECRET ends with:', GOOGLE_CLIENT_SECRET ? '...' + GOOGLE_CLIENT_SECRET.slice(-4) : 'MANCANTE');
    console.log('REDIRECT_URI:', REDIRECT_URI);
    console.log('==================');
    // ...
}
```

**Problema:** Questi log stampano porzioni di credenziali sensibili (`CLIENT_ID`, `CLIENT_SECRET`) nella console di produzione ad ogni chiamata OAuth. Vanno rimossi immediatamente in un ambiente di produzione.

**Fix:** Rimuovere i 4 `console.log`. Se servono in sviluppo, condizionarli a `DEBUG_MODE` (già disponibile in `helpers.js`).

---

### 2.2 — Dati `_debug` inclusi nella risposta di produzione

In `lib/argo.js`, la funzione `extractAssenzeFromDashboard` restituisce un campo `_debug` popolato con dati interni:

```js
// lib/argo.js righe 406–407, 446–455, 514–516, 568
const result = {
    // ...campi normali...
    _debug: {}         // ← viene sempre incluso nella risposta
};
result._debug.bloccoKeys = sampleKeys;          // chiavi interne del dashboard
result._debug[`key_${k}`] = ...;               // dati raw campionati
result._debug.rawNotaSample = n;               // primo oggetto nota raw
result._debug.dayModifiers = Object.fromEntries(dayModifiers);  // mappa interna
```

Questi dati vengono poi trasferiti via rete al client e letti in `ui.js`:

```js
// ui.js
if (state.assenzeData?._debug) {
    console.log('[Debug] Dashboard blocco keys:', ...);
    // ...
}
```

**Problema:** Il campo `_debug` espone la struttura interna del dato Argo, aumenta inutilmente il payload di rete, e può rivelare informazioni utili ad attaccanti.

**Fix:** Condizionare la popolazione di `_debug` al `DEBUG_MODE`, oppure rimuovere il campo da `result` prima del return e usare invece `debugLog()` già disponibile. In `ui.js`, eliminare di conseguenza il blocco di lettura del `_debug`.

---

## 3. Problemi di Sicurezza

### 3.1 — ~~Protezione CRON_SECRET disabilitata (commentata)~~ ✅ RISOLTO

La protezione `CRON_SECRET` è ora attiva. Il handler verifica il secret tramite confronto timing-safe (`crypto.timingSafeEqual`) e fallisce subito con HTTP 401 se il secret non corrisponde, o con HTTP 500 se `CRON_SECRET` non è configurato:

```js
// api/cron-sync.js
if (!CRON_SECRET) {
    return res.status(500).json({ success: false, error: 'CRON_SECRET non configurato' });
}
const authHeader = req.headers.authorization || '';
const bearerToken = authHeader.startsWith(BEARER_PREFIX) ? authHeader.slice(BEARER_PREFIX.length).trim() : '';
const cronSecret = bearerToken || req.headers['x-vercel-cron-secret'] || req.query.secret;
if (!secureEquals(cronSecret, CRON_SECRET)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
}
```

**Configurazione richiesta:** Impostare `CRON_SECRET` sia su Vercel (Environment Variables) che come GitHub Actions Secret (`secrets.CRON_SECRET`). I valori devono essere identici.

---

### 3.2 — URL di Supabase hardcoded nel sorgente

```js
// api/google.js riga 23 e api/cron-sync.js riga 17
const url = process.env.SUPABASE_URL || 'https://mlcutgkfunbpmrnbeznd.supabase.co';
```

**Problema:** L'URL del progetto Supabase (`mlcutgkfunbpmrnbeznd.supabase.co`) è hardcoded nel sorgente. Se il progetto Supabase venisse migrato o se il repository fosse reso pubblico, questo dato sarebbe esposto. Inoltre, il fallback silenzioso a questa URL hardcoded può mascherare configurazioni errate.

**Fix:** Eliminare il fallback hardcoded. L'URL deve venire **esclusivamente** da `process.env.SUPABASE_URL`. Vedere punto 1.1.

---

### 3.3 — Credenziali Argo in chiaro nel database

In `api/google.js` righe 67–70 e `api/cron-sync.js`, le credenziali Argo (password inclusa) vengono salvate in chiaro nella tabella `google_tokens`:

```js
upsertData.argo_password = argoCreds.password; // password Argo in chiaro nel DB
```

**Problema:** Se il database Supabase fosse compromesso, le password Argo di tutti gli utenti sarebbero esposte. Questo schema si scontra con le best practice di sicurezza (OWASP A02).

**Fix:** Cifrare le credenziali Argo prima di salvarle, ad esempio con `crypto.createCipheriv` usando una chiave gestita via env var, oppure rivedere il design ed eliminare la necessità di salvare la password.

---

## 4. Variabili e Configurazioni Inutilizzate o Obsolete

### 4.1 — ~~`.env.example` contiene variabili mai lette dal codice~~ ✅ RISOLTO

Il file `.env.example` è stato aggiornato. Le voci obsolete (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID`, `ARGO_SCHOOL_CODE`, `ARGO_USERNAME`, `ARGO_PASSWORD`) sono state rimosse. Il file contiene ora le sole variabili effettivamente usate dal codice: `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CRON_SECRET`, `ARGO_ENCRYPTION_KEY`, `CLASS_SCHEDULE`.

---

### 4.2 — ~~Variabile `cronSecret` in `api/cron-sync.js` dichiarata ma mai usata~~ ✅ RISOLTO

La variabile `cronSecret` è ora usata attivamente nella validazione del secret (vedere punto 3.1 — risolto). Il blocco di autenticazione è stato decommentato e usa `secureEquals(cronSecret, CRON_SECRET)` per il confronto timing-safe.

---

### 4.3 — Funzioni backward-compat esportate ma non importate da nessun file

Come descritto in punto 1.3:
- `extractGradesMultiStrategy`
- `extractHomeworkSafe`
- `extractPromemoria`

Questi nomi appaiono **solo in `lib/argo.js`**: definiti ed esportati, ma mai importati in nessun altro file del repository.

---

## 5. Dati Hardcoded Specifici per Scuola/Classe

### 5.1 — Orario scolastico hardcoded in `lib/googleCalendar.js`

```js
// lib/googleCalendar.js righe 79–116
const ORARIO_SCOLASTICO = {
    "lunedi": [
        { "materia": "SCIENZE",   "inizio": "08:00", "fine": "09:00" },
        { "materia": "INGLESE",   "inizio": "09:00", "fine": "10:00" },
        // ...
    ],
    // ... tutti i giorni della settimana per una specifica classe
};
```

**Problema:** `lib/googleCalendar.js` è un modulo di utilità generico, ma contiene l'orario scolastico di **una specifica classe** hardcoded nel sorgente. Se la classe cambia, l'anno scolastico cambia, o si vuole supportare più classi, il file va modificato manualmente. Questo rende il codice non riutilizzabile.

**Fix:**
1. Rimuovere `ORARIO_SCOLASTICO` da `googleCalendar.js`.
2. Spostarlo in un file di configurazione separato (es. `config/orario.json`) o renderlo parametro della funzione `syncTasksToCalendar`.
3. Oppure, se il progetto supporterà più utenti di classi diverse, salvare l'orario nel database per-utente.

---

### 5.2 — Date assemblee hardcoded in `lib/argo.js`

```js
// lib/argo.js righe 531–532
const assemblyDates = [
    '2026-02-07', '2026-01-16', '2025-12-15',
    '2025-11-11', '2025-10-25', '2025-09-30'
];
```

**Problema:** Date di assemblee di istituto specifiche per l'anno scolastico 2025/26, hardcoded nel codice sorgente. Ogni anno vanno aggiornate manualmente e il dato è solo valido per **una scuola specifica**.

**Fix:** Spostare in un file di configurazione annuale (`config/school-calendar.json`) oppure eliminare del tutto il meccanismo se le assemblee vengono già gestite tramite note nel registro.

---

### 5.3 — URL scraping circolari hardcoded

```js
// api_internal/circolari/index.js riga 41
const SCHOOL_URL = 'https://www.liceogandhi.edu.it/categoria/storico-circolari/';
```

**Problema:** URL hardcoded di una scuola specifica. Se il sito della scuola cambia URL o struttura HTML, il codice si rompe senza warning. Impossibile riutilizzare il modulo per altre scuole.

**Fix:** Spostare l'URL in `process.env.SCHOOL_CIRCOLARI_URL` con il valore di default come fallback. Aggiungere la variabile a `.env.example`.

---

## 6. Inefficienze Architetturali e di Design

### 6.1 — `lib/sintesiCache.js`: doppia lettura da disco per ogni operazione

```js
// lib/sintesiCache.js righe 30–34
function getSintesiFromCache(id) {
    if (!id) return null;
    const cache = loadSintesiCache();   // ← lettura disco
    return cache[id] || null;
}

// righe 36–41
function setSintesiInCache(id, sintesi) {
    if (!id || !sintesi) return;
    const cache = loadSintesiCache();   // ← lettura disco
    cache[id] = sintesi;
    saveSintesiCache(cache);            // ← scrittura disco
}
```

**Problema:** Ogni chiamata a `getSintesiFromCache` e `setSintesiInCache` legge l'intero file JSON dal disco. Se in una singola invocazione serverless vengono richieste più sintesi, ogni richiesta fa una lettura separata. `setSintesiInCache` fa addirittura leggi+scrittura per ogni aggiornamento.

**Fix:** Introdurre una variabile di modulo `_cache = null` come in-memory layer. Caricare il file solo alla prima chiamata e mantenere la cache in memoria per la durata dell'invocazione:

```js
let _cache = null;

function getCache() {
    if (_cache) return _cache;
    _cache = loadSintesiCache();
    return _cache;
}

function getSintesiFromCache(id) {
    if (!id) return null;
    return getCache()[id] || null;
}

function setSintesiInCache(id, sintesi) {
    if (!id || !sintesi) return;
    const cache = getCache();
    cache[id] = sintesi;
    saveSintesiCache(cache);
}
```

---

### 6.2 — Fallback REST axios nel planner handler (codice morto/di bassa qualità)

```js
// api_internal/planner/[user_id].js righe 136–163
// Fallback REST
try {
    const url = `${sbTableUrl('planners')}?on_conflict=user_id`;
    const headers = sbHeaders();
    headers.Prefer = 'resolution=merge-duplicates,return=representation';
    const r = await axios.post(url, payload, { headers, timeout: 15000 });
    // ...
}
```

**Problema:** Il fallback bypassa il client Supabase ufficiale e ricostruisce manualmente le chiamate HTTP REST con headers specifici di Supabase. Questo è un antipattern: il client SDK gestisce già i retry e gli errori. Il fallback viene raggiunto solo se `getSupabase()` restituisce `null` **o** se l'upsert SDK fallisce — ma in quel secondo caso anche il fallback fallirebbe. Inoltre richiede le helper functions `sbHeaders()` e `sbTableUrl()` presenti solo in questo file.

**Fix:** Rimuovere tutto il blocco "Fallback REST" (righe 136–163) e le funzioni `sbHeaders()`/`sbTableUrl()`. Gestire il failure case restituendo un errore HTTP 503 con messaggio chiaro.

---

### 6.3 — `require()` dentro il corpo di funzioni in `lib/argo.js`

```js
// lib/argo.js riga 863 (dentro resolveIdentityFromWebUI)
const { wrapper: wrap } = require('axios-cookiejar-support');

// lib/argo.js riga 901 (dentro resolveClassFromAnagraficaWeb)
const { wrapper: wrap } = require('axios-cookiejar-support');
```

**Problema:** Chiamare `require()` dentro il corpo di una funzione è un antipattern. Node.js memorizza i moduli in cache quindi non c'è overhead di caricamento, ma:
- La dipendenza è nascosta (non visibile all'inizio del file insieme alle altre)
- Rende il codice meno leggibile e meno testabile
- È una violazione delle convenzioni standard di Node.js

Nota: il modulo `axios-cookiejar-support` è già importato all'inizio del file alla riga 2 (`const { wrapper } = require('axios-cookiejar-support')`). Quindi i `require` interni sono completamente inutili.

**Fix:** Rimuovere i due `require` interni e usare direttamente `wrapper` già importato a riga 2.

---

### 6.4 — Routing URL fragile nei gateway API

```js
// api/auth.js righe 2–5
const action = req.query.action || req.url.split('?')[0].replace('/api/', '');
if (action === 'sync') return require('../api_internal/sync')(req, res);
if (action === 'resolve-profile') return require('../api_internal/resolve-profile')(req, res);
return require('../api_internal/login')(req, res);

// api/resources.js righe 3–12
const url = req.url.split('?')[0];
if (url.includes('/planner')) {
    return require('../api_internal/planner/[user_id]')(req, res);
}
if (url.includes('/profile')) {
    return require('../api_internal/profile/[user_id]')(req, res);
}
```

**Problema:** Il parsing manuale di `req.url` per il routing è fragile e mancante di test. `url.includes('/planner')` matcherebbe anche `/planner-extra` o qualsiasi path contenente la stringa. In Vercel, il query param `action` è preferibile perché già estratto automaticamente.

**Fix:** Usare `req.query.action` in modo consistente e verificare sempre il valore esatto (`=== 'planner'`). In alternativa, usare direttamente le route Vercel in `vercel.json` con parametri espliciti.

---

### 6.5 — Funzione `getOAuth2Client` duplicata con firme diverse

| File | Firma | Nota |
|---|---|---|
| `api/google.js` riga 41 | `function getOAuth2Client()` | Crea client senza credenziali |
| `api/cron-sync.js` riga 30 | `function getOAuth2Client(tokenRow)` | Crea client con credenziali |

Le due funzioni hanno lo stesso nome ma firme diverse e comportamenti diversi. In `api/google.js`, il client viene poi configurato separatamente in `getAuthenticatedClient()`. Se i due file venissero uniti o condivisi, questo causerebbe confusione.

**Fix:** Rinominare la funzione in `api/cron-sync.js` in `buildAuthenticatedOAuth2Client(tokenRow)` per chiarire la differenza semantica.

---

## 7. Qualità e Coerenza del Codice

### 7.1 — Nomi di campo inconsistenti nelle risposte API

Le risposte delle API `login` e `sync` mescolano italiano e inglese nei nomi dei campi:

```js
// api_internal/login.js e api_internal/sync.js
res.json({
    success: true,
    tasks: tasksData,         // inglese
    voti: gradesData,         // italiano
    promemoria: announcementsData,  // italiano
    assenzeData,              // italiano + "Data" in inglese!
    verifiche: verificheData  // italiano
});
```

`assenzeData` è il campo più problematico perché il nome stesso mescola le due lingue. Il frontend `ui.js` utilizza direttamente questi nomi, quindi un refactoring richiede attenzione, ma andrebbero almeno uniformati.

---

### 7.2 — `api_internal/profile/[user_id].js`: `.select('*')` senza `.single()`

```js
// api_internal/profile/[user_id].js riga 14
const { data, error } = await supabase.from('profiles').select('*').eq('id', user_id);
if (!data || data.length === 0) return res.status(404).json(...);
res.status(200).json({ success: true, data: data[0] });  // ← accesso manuale a [0]
```

Tutti gli altri endpoint che cercano un singolo record usano `.single()` (es. `api_internal/login.js` riga 98, `api_internal/sync.js` riga 76). Questo è un caso isolato non coerente con il resto.

**Fix:**
```js
const { data, error } = await supabase.from('profiles').select('*').eq('id', user_id).single();
if (error?.code === 'PGRST116') return res.status(404).json(...); // row not found
```

---

### 7.3 — `lib/argo.js`: variabili con nome generico in `extractAssenzeFromDashboard`

Nella funzione `extractAssenzeFromDashboard` vengono usate costanti senza commento chiaro:

```js
const ORE_PER_GIORNO = 5;         // ore/giorno standard
const ORA_INIZIO_SCUOLA = 8;      // 8:00
const ORA_FINE_SCUOLA = 13;       // 13:00
```

Queste sono corrette e ben commentate. Tuttavia, sono locali alla funzione (`const` nel body della funzione). Poiché sono configurazione scolastica, andrebbero estratte come costanti di modulo (in cima al file o in un config) per renderle più visibili e modificabili.

---

### 7.4 — `api_internal/login.js` riga 143: controllo `targetProfile` ridondante

```js
// api_internal/login.js riga 143
if (targetProfile) {    // ← sempre true: se fosse null avremmo già fallito a riga 50
    resp.selectedProfile = { ... };
}
```

`targetProfile` viene assegnato a riga 50 (`const targetProfile = profiles[targetIndex]`) e se fosse `undefined` il codice sarebbe già fallito alla riga 53 (`if (!accessToken || !authToken) throw new Error(...)`). Il controllo `if (targetProfile)` a riga 143 è quindi sempre `true`.

**Fix:** Rimuovere la condizione e aggiungere sempre il campo `selectedProfile`.

---

### 7.5 — `lib/argo.js`: costruzione ridondante del `loopCount` nel redirect loop

```js
// lib/argo.js righe 107–117
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
```

Il loop segue i redirect manualmente. Una refactoring con `for` sarebbe più idiomatica:

```js
for (let i = 0; i < 10 && location; i++) {
    const match = location.match(/code=([0-9a-zA-Z-_.]+)/);
    if (match) { code = match[1]; break; }
    const r = await client.get(location, { maxRedirects: 0, validateStatus: () => true });
    location = r.headers['location'];
}
```

---

### 7.6 — `lib/googleCalendar.js`: `EDUCAZIONE FISICA` e `SCIENZE MOTORIE` mappati entrambi al colore `'10'` (FISICA)

```js
const SUBJECT_COLORS = {
    // ...
    'FISICA': '10',
    'EDUCAZIONE FISICA': '10',
    'SCIENZE MOTORIE': '10',
    // ...
};
```

Fisica (la materia) e Educazione Fisica/Scienze Motorie sono discipline diverse ma condividono lo stesso colore. In Google Calendar, il colore ID `10` è "Basilico" (verde scuro). Questo non è un bug critico ma può causare confusione visiva.

---

### 7.7 — `api/google.js` riga 170: decodifica base64 non standard

```js
const decoded = JSON.parse(decodeURIComponent(escape(Buffer.from(stateParam, 'base64').toString('binary'))));
```

L'uso di `escape()` è deprecato in JavaScript moderno. La decodifica corretta di base64 UTF-8 è:

```js
const decoded = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'));
```

---

## 8. Riepilogo Priorità

| # | Problema | File | Priorità | Categoria |
|---|---|---|---|---|
| 3.1 | CRON_SECRET check disabilitato | `api/cron-sync.js` | 🔴 CRITICA | Sicurezza |
| 2.1 | `console.log` credenziali OAuth | `api/google.js` | 🔴 CRITICA | Sicurezza/Debug |
| 3.2 | URL Supabase hardcoded | `api/google.js`, `api/cron-sync.js` | 🔴 ALTA | Sicurezza |
| 3.3 | Password Argo in chiaro nel DB | `api/google.js` | 🔴 ALTA | Sicurezza |
| 1.1 | `getSupabase()` triplicata | `api/google.js`, `api/cron-sync.js` | 🟠 ALTA | DRY |
| 4.1 | Variabili env obsolete in `.env.example` | `.env.example` | 🟠 ALTA | Config |
| 1.3 | Funzioni wrapper esportate mai usate | `lib/argo.js` | 🟡 MEDIA | DRY |
| 1.4 | Helper `_isValid`/`clean` duplicati | `lib/argo.js` | 🟡 MEDIA | DRY |
| 1.2 | `parseJsonb()` duplicata | `api_internal/planner/`, `api_internal/sync.js` | 🟡 MEDIA | DRY |
| 1.5 | `GOOGLE_CLIENT_ID` re-dichiarata | `api/google.js` | 🟡 MEDIA | Qualità |
| 2.2 | `_debug` in payload di produzione | `lib/argo.js`, `ui.js` | 🟡 MEDIA | Debug |
| 6.1 | Cache sintesi: doppia lettura disco | `lib/sintesiCache.js` | 🟡 MEDIA | Performance |
| 6.2 | Fallback REST axios nel planner | `api_internal/planner/[user_id].js` | 🟡 MEDIA | Architettura |
| 6.3 | `require()` dentro funzioni | `lib/argo.js` | 🟡 MEDIA | Qualità |
| 5.1 | Orario scolastico hardcoded | `lib/googleCalendar.js` | 🟡 MEDIA | Hardcoded |
| 5.2 | Date assemblee hardcoded | `lib/argo.js` | 🟡 MEDIA | Hardcoded |
| 5.3 | URL circolari hardcoded | `api_internal/circolari/index.js` | 🟡 MEDIA | Hardcoded |
| 6.5 | `getOAuth2Client` con nomi ambigui | `api/google.js`, `api/cron-sync.js` | 🟢 BASSA | Qualità |
| 7.1 | Nomi campi risposta IT/EN misti | `api_internal/login.js`, `sync.js` | 🟢 BASSA | Qualità |
| 7.2 | `.select('*')` senza `.single()` | `api_internal/profile/[user_id].js` | 🟢 BASSA | Qualità |
| 7.4 | Check `if (targetProfile)` ridondante | `api_internal/login.js` | 🟢 BASSA | Qualità |
| 6.4 | Routing URL fragile | `api/auth.js`, `api/resources.js` | 🟢 BASSA | Architettura |
| 7.7 | `escape()` deprecato | `api/google.js` | 🟢 BASSA | Qualità |
| 1.6 | Name-building duplicato | `lib/argo.js` | 🟢 BASSA | DRY |
| 7.5 | Loop redirect con `while` + counter | `lib/argo.js` | 🟢 BASSA | Leggibilità |

---

*Report generato analizzando ogni file sorgente: `lib/argo.js`, `lib/helpers.js`, `lib/supabase.js`, `lib/groq.js`, `lib/googleCalendar.js`, `lib/sintesiCache.js`, `api/auth.js`, `api/ai.js`, `api/main.js`, `api/google.js`, `api/circolari.js`, `api/cron-sync.js`, `api/resources.js`, `api/manual-verifiche/[user_id].js`, `api_internal/login.js`, `api_internal/sync.js`, `api_internal/ai/chat.js`, `api_internal/circolari/index.js`, `api_internal/circolari/sintesi.js`, `api_internal/planner/[user_id].js`, `api_internal/profile/index.js`, `api_internal/profile/[user_id].js`, `api_internal/resolve-profile.js`, `api_internal/debug/profile-raw.js`, `api_internal/health.js`, `api_internal/ping.js`, `vercel.json`, `.env.example`.*
