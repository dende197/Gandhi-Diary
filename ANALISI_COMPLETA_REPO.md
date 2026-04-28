# ANALISI TECNICA COMPLETA — G-Connect Backend

> **Repository:** `dende197/g-connect-backend`  
> **Versione app:** 3.1.5 (frontend) / 2.0.0 (package.json)  
> **Data analisi:** 28 marzo 2026  
> **Analista:** GitHub Copilot (modalità read-only)  
> **Lingua:** Italiano tecnico

---

## Indice

1. [Panoramica e architettura](#1-panoramica-e-architettura)
2. [Struttura file e cartelle](#2-struttura-file-e-cartelle)
3. [Analisi a livello di funzione](#3-analisi-a-livello-di-funzione)
4. [Gestione dei dati](#4-gestione-dei-dati)
5. [Superficie API](#5-superficie-api)
6. [Analisi della sicurezza](#6-analisi-della-sicurezza)
7. [Punti deboli e debito tecnico](#7-punti-deboli-e-debito-tecnico)
8. [Raccomandazioni](#8-raccomandazioni)

---

## 1. Panoramica e architettura

### 1.1 Descrizione generale

**G-Connect** (anche denominata *G-Diary* nella UI) è una **Progressive Web App (PWA)** destinata agli studenti del Liceo Gandhi. L'applicazione si integra con il registro elettronico **Argo DidUP** tramite un backend serverless su Vercel, e offre le seguenti funzionalità:

- Login sicuro al portale Argo con flusso OAuth2 + PKCE
- Visualizzazione di voti, compiti, promemoria, assenze e verifiche
- Planner personale con sincronizzazione cross-device via Supabase
- Sincronizzazione automatica dei compiti su Google Calendar (OAuth2 per-user)
- AI Assistant (chat e sintesi circolari) tramite Groq SDK
- Lettura e sintesi delle circolari scolastiche per scraping HTML/PDF

### 1.2 Stack tecnologico

| Livello | Tecnologia |
|---|---|
| Frontend | Vanilla JS, HTML5, CSS3 (no framework JS) |
| Backend | Node.js 20.x su Vercel Serverless Functions |
| Database | Supabase (PostgreSQL) |
| AI | Groq SDK (`openai/gpt-oss-120b`) |
| Autenticazione terze parti | Google OAuth2 (googleapis v171) |
| HTTP client | Axios + axios-cookiejar-support |
| Parsing HTML | Cheerio |
| Parsing PDF | pdf-parse |
| Animazioni | GSAP 3 (Premium Suite via CDN) |
| Deploy | Vercel (con `vercel.json` v2) |

### 1.3 Architettura di deployment

```
                          ┌─────────────────────────────────┐
   Browser PWA            │         Vercel Serverless         │
  (index.html +           │                                   │
   ui.js +                │  /api/auth     → api_internal/login
   style.css)  ──HTTPS──► │  /api/auth     → api_internal/sync
                          │  /api/ai       → api_internal/ai/chat
                          │  /api/circolari → api_internal/circolari/*
                          │  /api/google   → (OAuth2 / Calendar sync)
                          │  /api/planner/:id → api_internal/planner/[user_id]
                          │  /api/profile/:id → api_internal/profile/[user_id]
                          │  /api/cron-sync   → (Vercel Cron, 2x/giorno)
                          └───────┬────────────────┬─────────┘
                                  │                │
                        ┌─────────▼──────┐  ┌──────▼──────────┐
                        │    Supabase    │  │   Argo DidUP API │
                        │ (PostgreSQL)   │  │ portaleargo.it   │
                        └────────────────┘  └─────────────────┘
                                                     │
                                        ┌────────────▼────────┐
                                        │   Google Calendar    │
                                        │       API v3         │
                                        └─────────────────────┘
```

### 1.4 Flusso principale dell'applicazione

1. L'utente apre la PWA nel browser.
2. Il frontend (`index.html`) carica lo stato salvato in `localStorage`.
3. Se non autenticato, viene mostrata la schermata di login Argo.
4. Il login invia credenziali al backend (`/login`) che esegue il flusso OAuth2 PKCE con `portaleargo.it`.
5. Il backend restituisce token, dati studente, voti, compiti, assenze, verifiche.
6. Il frontend salva i dati in `localStorage` e li visualizza nella UI.
7. Sincronizzazioni successive (`/sync`) aggiornano i dati usando credenziali salvate (base64) in localStorage.

---

## 2. Struttura file e cartelle

```
g-connect-backend/
├── .env                          ⚠️ CREDENZIALI REALI COMMITTATE (vedi §6.1)
├── .env.example                  Template variabili d'ambiente
├── .gitignore                    Esclude .env, node_modules, .DS_Store, ecc.
├── .DS_Store                     ⚠️ File macOS metadati committato (rumore)
├── README.md                     Documentazione base deploy
├── vercel.json                   Configurazione Vercel: cron, rewrites, CORS headers
├── package.json                  Dipendenze Node.js (no test scripts)
├── package-lock.json             Lock file npm
│
├── index.html                    Entry-point PWA: HTML skeleton + bootstrap JS
├── ui.js                         ~4170 righe: logica UI, rendering, chiamate API
├── style.css                     ~3630 righe: tema glassmorphism / iOS
├── animations.css                ~142 righe: animazioni CSS aggiuntive
├── fluidity-engine-v3.js         ~280 righe: effetti particelle/sfondo animato
│
├── api/                          Handler di routing Vercel (gateway layer)
│   ├── auth.js                   Smista a login / sync / resolve-profile
│   ├── ai.js                     Smista a api_internal/ai/chat
│   ├── circolari.js              Smista a circolari/index o circolari/sintesi
│   ├── cron-sync.js              Sync universale schedulato (Vercel Cron)
│   ├── google.js                 OAuth2 Google Calendar + sync per-user
│   ├── main.js                   Smista a health / ping / debug
│   ├── resources.js              Gateway per planner/:id e profile/:id
│   └── manual-verifiche/
│       └── [user_id].js          CRUD verifiche manuali per utente
│
├── api_internal/                 Logica di business (non esposta direttamente)
│   ├── health.js                 Health-check: status + debug flag + timestamp
│   ├── ping.js                   Ping basilare: { pong: true, ts: Date.now() }
│   ├── login.js                  Autenticazione Argo + prima raccolta dati
│   ├── sync.js                   Ri-login Argo + refresh dati + planner Supabase
│   ├── resolve-profile.js        Risoluzione identità studente (nome/classe)
│   ├── ai/
│   │   └── chat.js               Proxy AI: forward messaggi a Groq
│   ├── circolari/
│   │   ├── index.js              Web-scraping circolari da liceogandhi.edu.it
│   │   └── sintesi.js            Sintesi AI di circolari (HTML/PDF → Groq)
│   ├── debug/
│   │   └── profile-raw.js        Dump dati grezzi Argo (solo con DEBUG_MODE=true)
│   ├── planner/
│   │   └── [user_id].js          CRUD planner (GET/PUT) su Supabase
│   └── profile/
│       ├── index.js              Aggiornamento profilo (PUT)
│       └── [user_id].js          Lettura profilo (GET)
│
├── lib/                          Librerie condivise
│   ├── argo.js                   Client Argo (~958 righe): login, dashboard, estrazione dati
│   ├── helpers.js                Utility: CORS, logging, hashing, identità, headers
│   ├── supabase.js               Factory singleton client Supabase
│   ├── groq.js                   Factory singleton client Groq
│   ├── googleCalendar.js         Engine sync Argo → Google Calendar
│   └── sintesiCache.js           Cache sintesi AI su /tmp (serverless)
│
└── node_modules/                 ⚠️ Committato (vedi §7.4) — oltre 400 MB
```

---

## 3. Analisi a livello di funzione

### 3.1 `lib/argo.js` — Client Argo DidUP (~958 righe)

Questo è il file più complesso dell'intero backend. Gestisce tutte le interazioni con il portale `portaleargo.it`.

#### `AdvancedArgo.rawLogin(school, username, password)`
- **Tipo:** metodo statico asincrono
- **Scopo:** Esegue il flusso completo di autenticazione OAuth2 con PKCE verso `auth.portaleargo.it`
- **Flusso:**
  1. Genera `CODE_VERIFIER` (32 byte random), `CODE_CHALLENGE` (SHA-256 base64url), `STATE` (16 byte random)
  2. GET su `CHALLENGE_URL` per ottenere `login_challenge`; se non in URL, fa scraping HTML con Cheerio
  3. POST su `LOGIN_URL` con credenziali + challenge; segue i redirect (max 10) per estrarre `code`
  4. POST su `TOKEN_URL` per scambiare `code` → `access_token` (PKCE `code_verifier` incluso)
  5. POST su `ENDPOINT/login` di Argo REST con `access_token` per ottenere lista profili + `x-auth-token`
  6. Restituisce `{ access_token, profiles[], jar }` (jar = cookie session)
- **Gestione errori:** HTTP 403 → errore con status 403; altri → rilanciati al chiamante

#### `getDashboard(headers)`
- **Scopo:** POST su `ENDPOINT/dashboard/dashboard` — recupera tutto: voti, compiti, promemoria, assenze, appello, note, bacheca (180 giorni di storico)
- **Return:** Oggetto grezzo Argo con campo `data.dati[]`

#### `extractGradesFromDashboard(dashboardData)`
- **Scopo:** Estrae voti da `votiGiornalieri`, `votiPeriodici`, `votiScrutinio` nei blocchi dati
- **Output:** Array `[{ materia, valore, data, tipo, id }]` con ID stabile MD5

#### `extractHomeworkFromDashboard(dashboardData)`
- **Scopo:** Estrae compiti da `registro[].compiti[]`, annotazioni con data esplicita, promemoria con data, argomenti con keyword compito/verifica
- **Output:** Array `[{ id, text, materia, due_date, done }]`
- **Nota:** Deduplicazione per chiave `(materia, testo, data)` prima dell'inserimento

#### `extractPromemoriaFromDashboard(dashboardData)`
- **Scopo:** Estrae avvisi da `bachecaAlunno` e `promemoria`
- **Output:** Array `[{ titolo, testo, autore, data, url, id }]`

#### `extractAssenzeFromDashboard(dashboardData)` *(funzione più complessa, ~200 righe)*
- **Scopo:** Estrae e classifica assenze, ritardi, uscite, note disciplinari
- **Algoritmo in 3 passi:**
  1. **Pass 1:** Raccoglie tutti gli eventi da `assenze / eventiClasse / appello / registroAssenze` e li classifica: ritardo (`RITARD|INGRESSO`), uscita (`USCIT|ANTICIPAT`), assenza (resto)
  2. **Pass 2:** Costruisce modificatori giornalieri da note testuali (es. "esce alle 10:00", "assemblea d'istituto") + date hardcoded assemblee
  3. **Pass 3:** Calcola ore effettive per ogni assenza/ritardo/uscita tenendo conto del modificatore
- **Costanti hardcoded:** orario scolastico 08:00–13:00, 5 ore/giorno; date assemblee specifiche (`2026-02-07`, ecc.)

#### `extractVerificheFromDashboard(dashboardData)`
- **Scopo:** Cerca verifiche nei promemoria, argomenti e compiti usando regex
- **Regex principali:** `/verific|interrogazion|prova\s+(scritta|orale)|compito\s+in\s+classe|test\b|esame/i`
- **Output:** Array deduplicato per ID stabile

#### `enrichProfiles(school, accessToken, profiles)`
- **Scopo:** Arricchisce i profili con nome e classe; prima controlla la cache Supabase, poi chiama `ENDPOINT/profilo`
- **Fallback hierarchy:** token login → cache Supabase → API profilo Argo

#### `resolveIdentityForProfile(school, username, password, accessToken, authToken, currentName, currentClass, subjectId)`
- **Scopo:** Risolve nome e classe di un profilo tramite API `ENDPOINT/profilo`
- **Return:** `{ name, cls }`

#### `resolveIdentityFromWebUI(jar)` e `resolveClassFromAnagraficaWeb(jar)`
- **Scopo:** Fallback per scuole con API limitate: fa scraping HTML del portale familiare Argo cercando selettori CSS noti (`#_idJsp44`, `#nominativo`, `[id*="classe"]`)
- **URL tentati:** `argoweb/famiglia/index.jsf`, `datiAnagrafici.jsf`, `schedaAnagraficaAlunno.jsf`

---

### 3.2 `lib/helpers.js` — Utility condivise

#### `setCorsHeaders(res)` / `handleCors(req, res)`
- Imposta header CORS con `Access-Control-Allow-Origin: *`
- Gestisce preflight OPTIONS restituendo 204

#### `debugLog(message, data)`
- Log solo se `DEBUG_MODE=true`; chiama `redact()` per oscurare chiavi sensibili

#### `redact(obj)`
- Oscura ricorsivamente nei log i valori di chiavi sensibili: `x-auth-token`, `Authorization`, `authToken`, `access_token`, `token`, `password`

#### `generateStableId(baseString)`
- Hash MD5 (12 caratteri) usato come ID stabile per voti, promemoria, verifiche, ecc.

#### `generatePid(school, user, index)`
- Genera l'ID profilo deterministico: `p:<SCHOOL>:<username>:<index>` in lowercase
- Esempio: `p:mrgbgs:mario.rossi:0`

#### `buildName(obj)`
- Normalizza il nome studente da vari campi Argo (`desNominativo`, `nominativo`, `desNome`+`desCognome`)

#### `normalizeClass(raw, strict)`
- Normalizza la stringa classe in formato `<numero><sezione>` (es. `4D`)
- Usa blacklist di parole (`ORE`, `ANNI`, `OTTOBRE`, ecc.) e regex multipli
- Supporto formato con gradi/apostrofi: `4^A`, `4°B`

#### `isValidName(name, username)`
- Valida un nome studente (min 3 char, almeno 2 parole, non uguale all'username, non parole UI-like)

#### `createHeaders(school, accessToken, authToken, subjectId)`
- Costruisce gli header HTTP per le API Argo REST (Bearer + x-auth-token + x-cod-min)

---

### 3.3 `lib/googleCalendar.js` — Engine sync Google Calendar

#### `syncTasksToCalendar(tasks, calendarId, auth)`
- **Scopo:** Sincronizza array di compiti su Google Calendar tramite OAuth2 client
- **Algoritmo:**
  1. Filtra compiti con data futura (rispetto all'oggi in timezone `Europe/Rome`)
  2. Carica tutti gli eventi futuri del calendario in una sola chiamata (max 2000)
  3. Costruisce due Set per deduplicazione: `argoId` (hash base64) e `titolo+data` (normalizzato)
  4. Per ogni compito nuovo, cerca lo slot orario corrispondente in `ORARIO_SCOLASTICO`
  5. Inserisce evento con `colorId` per materia, `extendedProperties.private.argoId` e `source=g-connect-sync`
- **⚠️ Nota critica:** `ORARIO_SCOLASTICO` è hardcoded per la classe **4D** dello sviluppatore

#### `getColorForSubject(materia)`
- Mappa materia → `colorId` Google Calendar (es. `MATEMATICA → '11'`, `ITALIANO → '9'`)

#### `generateArgoId(materia, data, descrizione, slotInizio)`
- Genera ID univoco per deduplicazione: `base64(materia-data-slot-desc[:60])` (50 char)

#### `normalizeTitle(title)`
- Normalizza titolo per confronto: lowercase, rimozione punteggiatura, normalizzazione unicode (NFD)

---

### 3.4 `lib/sintesiCache.js` — Cache sintesi AI

- **Persistenza:** File JSON su `/tmp/cache_sintesi.json` (effimero su serverless, condiviso tra invocazioni "warm")
- Funzioni: `getSintesiFromCache(id)`, `setSintesiInCache(id, sintesi)`
- **Limite:** In un ambiente serverless, la cache si azzera al cold start

---

### 3.5 `api_internal/login.js` — Handler login

1. Riceve `schoolCode`, `username`, `password`, `selectedProfileIndex` via POST body
2. Chiama `AdvancedArgo.rawLogin()` → ottiene `access_token` e lista profili
3. Chiama `enrichProfiles()` per arricchire nome/classe
4. Se ci sono più profili e nessun indice scelto → risponde `status: MULTIPLE_PROFILES`
5. Con un solo profilo (o indice scelto):
   - Tenta 3 livelli di risoluzione identità (API → Web UI → Anagrafica)
   - Chiama `getDashboard()` e tutte le funzioni di estrazione
   - Sincronizza/crea il profilo su Supabase (`upsert` su `profiles`)
   - Restituisce sessione + dati studente + tasks + voti + promemoria + assenze + verifiche

---

### 3.6 `api_internal/sync.js` — Handler sync

- Riceve `schoolCode`, `storedUser` (base64), `storedPass` (base64), `profileIndex`
- **Decodifica:** `Buffer.from(storedUser, 'base64').toString('utf-8')` + `decodeURIComponent`
- Esegue di nuovo `rawLogin()` con le credenziali decodificate
- Aggiorna il profilo su Supabase
- Recupera il planner e le `manual_verifiche` da Supabase
- Risponde con tutti i dati aggiornati + nuovi token

---

### 3.7 `api/google.js` — Google Calendar OAuth2 Handler

Gestisce 6 azioni distinte via `?action=`:

| Azione | Metodo | Scopo |
|---|---|---|
| `auth-url` | GET | Genera URL consenso Google OAuth2 (scope Calendar) |
| `callback` | GET | Riceve `code` e `state`, scambia per tokens, salva in Supabase |
| `status` | GET | Verifica se l'utente ha Google collegato |
| `sync` | POST | Sincronizza compiti Argo → Google Calendar dell'utente |
| `save-argo` | POST | Salva credenziali Argo in Supabase (`google_tokens`) |
| `disconnect` | GET/POST | Revoca token Google e cancella da Supabase |

**Token storage:** tabella Supabase `google_tokens` con campi `user_id`, `access_token`, `refresh_token`, `expiry_date`, `calendar_id`, `argo_school_code`, `argo_username`, `argo_password`

---

### 3.8 `api/cron-sync.js` — Sync universale schedulato

- **Trigger:** Vercel Cron 2x/giorno (13:00 e 23:00 UTC da `vercel.json`)
- **Algoritmo:**
  1. Legge tutti gli utenti dalla tabella `google_tokens` che hanno credenziali Argo
  2. Per ogni utente: login Argo → fetch dashboard → estrazione compiti → sync su Google Calendar
  3. Gestisce auto-refresh del token Google (evento `tokens` di OAuth2Client)
- **⚠️ La protezione cron è commentata** (vedi §6.5)

---

### 3.9 `api_internal/ai/chat.js` — Proxy AI

- Riceve array `messages` in formato Google Gemini o OpenAI
- Normalizza i ruoli (`model` → `assistant`)
- Invia a Groq con modello `openai/gpt-oss-120b`, temperatura 0.7, max 2048 token
- Risponde in formato Google Gemini (`candidates[0].content.parts[0].text`)

---

### 3.10 `api_internal/circolari/index.js` — Scraping circolari

- **Fonte:** `https://www.liceogandhi.edu.it/categoria/storico-circolari/`
- **Scraping:** Cheerio su `.card-wrapper`, estrae titolo, link, data, numero circolare
- **Cache:** `/tmp/circolari_cache.json` con TTL di 1 ora
- **Limite:** Restituisce max 15 circolari più recenti

---

### 3.11 `api_internal/circolari/sintesi.js` — Sintesi AI circolari

1. Riceve `link` e `id` via POST
2. Verifica cache `/tmp`
3. Se il link non è `.pdf`, fa scraping HTML cercando `#attachmentsList a[href*=".pdf"]`
4. Scarica e parsa il PDF con `pdf-parse`
5. Invia i primi 7000 caratteri di testo a Groq (modello `openai/gpt-oss-120b`)
6. Prompt hardcoded: "Sei un assistente per studenti del Liceo Gandhi..."
7. Retry automatico fino a 2 volte su 429/500/503
8. Salva in cache

---

### 3.12 `api_internal/planner/[user_id].js` — CRUD Planner

- **GET:** Legge il planner da Supabase (`planners`); restituisce struttura vuota se non esiste
- **PUT:** Upsert del planner; i `stressVents` sono embeddati in `stress_levels.__vents`
- **Doppio meccanismo:** Prima tenta Supabase SDK, poi fallback REST diretto con headers `apikey` + `Authorization`
- **Campi:** `planned_tasks`, `stress_levels`, `planned_details`, `tasks`, `prep_levels`

---

### 3.13 `api_internal/profile/[user_id].js` e `index.js`

- `[user_id].js` (GET): Legge profilo da Supabase per `user_id`
- `index.js` (PUT): Aggiorna profilo; valida che `avatar` sia URL

---

### 3.14 `api/manual-verifiche/[user_id].js` — CRUD Verifiche manuali

- **GET:** Lista verifiche per `user_id` ordinate per data
- **POST:** Crea nuova verifica (`subject`, `date`, `type`, `args`)
- **PUT:** Aggiorna verifica (controlla che `user_id` corrisponda — security check)
- **DELETE:** Elimina verifica (controlla che `user_id` corrisponda — security check)

---

### 3.15 `ui.js` — Frontend (~4170 righe)

File monolitico Vanilla JS che gestisce tutta la UI come Single Page Application (SPA).

#### Funzioni principali

| Funzione | Scopo |
|---|---|
| `renderLogin()` | Form login Argo con campi scuola, username, password |
| `renderHome()` | Dashboard principale: media, streak, voti recenti, compiti domani, verifiche |
| `renderPlanner()` | Vista planner con calendario personalizzato e agenda settimanale |
| `renderGradesView()` | Vista voti con grafici per materia (canvas) e medias |
| `renderAIAssistantView()` | Chat AI con storico messaggi |
| `renderProfile()` | Profilo studente, media gauge animata, impostazioni Google Calendar |
| `renderCircolariView()` | Lista circolari con sintesi AI espandibile |
| `renderVerifiche()` | Lista verifiche imminenti (Argo + manuali) |
| `mostraAssenzeModal()` | Modal con conteggio assenze/ritardi/uscite e ore |
| `mostraVerificheModal()` | Modal dettaglio verifiche per periodo |
| `renderWeeklyAgenda()` | Agenda settimanale compiti/verifiche con filtro |
| `performSync()` | Chiama `/sync`, aggiorna `state`, salva in localStorage |
| `sendAIChat()` | Invia messaggio a `/api/ai/chat` |
| `requestCircularSynthesis()` | Richiede sintesi circolare a `/api/circolari/sintesi` |
| `connectGoogle()` | Redirect a `/api/google?action=auth-url` |
| `syncGoogleCalendar()` | POST a `/api/google?action=sync` |
| `logout()` | Pulisce `localStorage` e torna alla schermata login |
| `renderMediaGauge()` | Gauge animata su `<canvas>` per la media voti |
| `initGradesCharts()` | Grafico lineare andamento voti per materia su `<canvas>` |
| `togglePomodoro()` | Timer Pomodoro integrato nel planner |
| `showAddBacklogModal()` | Aggiunge compiti al backlog manuale |
| `showCompetencyInputModal()` | Input competenze studente |
| `calcolaMedia(voti)` | Calcola media numerica filtrando valori non numerici e giustifiche |

#### Architettura state management
Tutto lo stato è un oggetto globale `window.state` con campi: `view`, `user`, `tasks`, `voti`, `exams`, `verifiche`, `assenzeData`, `plannedTasks`, `manualVerifiche`, `aiChatHistory`, `googleConnected`, ecc.

Ogni render viene lanciato da `scheduleRender()` che usa `requestAnimationFrame`.

---

### 3.16 `fluidity-engine-v3.js` — Effetti visuali (~280 righe)

- Genera particelle animate su canvas per l'effetto sfondo fluido/glassmorphism
- Usa `requestAnimationFrame` per loop animazione
- Si adatta al resize della finestra

---

## 4. Gestione dei dati

### 4.1 Flusso di ingresso dati

```
Browser (utente)
    │  POST /login { schoolCode, username, password }
    ▼
Backend (login.js)
    │  HTTPS → portaleargo.it (OAuth2 PKCE)
    ▼
Argo API
    │  JSON response: access_token + profili + dashboard
    ▼
Funzioni di estrazione (argo.js)
    │  voti[], tasks[], promemoria[], assenze, verifiche[]
    ▼
Supabase "profiles" (upsert)
    │
    ▼
Response JSON al browser
    │
    ▼
localStorage (persistenza locale)
```

### 4.2 Tabelle Supabase

| Tabella | Campi principali | Uso |
|---|---|---|
| `profiles` | `id` (PID), `name`, `class`, `specialization`, `avatar`, `last_active` | Profilo studente |
| `planners` | `user_id`, `planned_tasks` (jsonb), `stress_levels` (jsonb), `planned_details` (jsonb), `tasks` (jsonb), `prep_levels` (jsonb), `updated_at` | Planner cross-device |
| `manual_verifiche` | `id`, `user_id`, `subject`, `date`, `type`, `args`, `done` | Verifiche inserite manualmente |
| `google_tokens` | `user_id`, `access_token`, `refresh_token`, `expiry_date`, `calendar_id`, `argo_school_code`, `argo_username`, `argo_password`, `updated_at` | Token Google + credenziali Argo per cron |

### 4.3 Persistenza locale (localStorage)

Tutte le chiavi usano un prefisso derivato dall'utente: `p:<school>:<user>:<idx>:<chiave>`

| Chiave localStorage | Contenuto |
|---|---|
| `argo_session` | `{ schoolCode, authToken, accessToken, userName, profileIndex, storedUser (b64), storedPass (b64) }` |
| `argo_is_logged_in` | `"true"` |
| `<pid>:tasks` | Array compiti |
| `<pid>:voti` | Array voti |
| `<pid>:assenzeData` | Oggetto assenze |
| `<pid>:verifiche` | Array verifiche |
| `<pid>:planned_tasks` | Oggetto compiti pianificati |
| `<pid>:manual_verifiche` | Array verifiche manuali |
| `<pid>:user` | Oggetto profilo utente |
| `<pid>:reminders` | Array promemoria |
| `<pid>:ai_chat` | Storico chat AI |
| `mh_daily_quote` | Citazione del giorno |

### 4.4 Trasformazioni e validazioni

- **Voti:** Il campo `valore` può essere numerico, alfanumerico (es. `6+`, `7-`, `NC`) o stringa. `calcolaMedia()` filtra i valori non parsabili.
- **Date:** Molteplici formati supportati (`YYYY-MM-DD`, `DD/MM/YYYY`, date testuali italiane); tutte normalizzate con `toCalendarDate()` o `parseArgoDate()`
- **Classi:** Normalizzazione con blacklist parole comuni; regex multipli per `<numero><sezione>`
- **Nomi:** Validazione con `isValidName()`: min 3 char, min 2 parole, no parole riservate UI

---

## 5. Superficie API

### 5.1 Endpoints esposti (via `vercel.json` rewrites)

| Path | Metodo | Handler interno | Auth richiesta |
|---|---|---|---|
| `GET /health` | GET | `api_internal/health.js` | Nessuna |
| `POST /login` | POST | `api_internal/login.js` | Nessuna (riceve credenziali) |
| `POST /sync` | POST | `api_internal/sync.js` | Credenziali Argo in body (base64) |
| `GET /api/planner/:user_id` | GET | `api_internal/planner/[user_id].js` | Nessuna |
| `PUT /api/planner/:user_id` | PUT | `api_internal/planner/[user_id].js` | Nessuna |
| `GET /api/profile/:user_id` | GET | `api_internal/profile/[user_id].js` | Nessuna |
| `PUT /api/profile` | PUT | `api_internal/profile/index.js` | Nessuna |
| `POST /api/ai/chat` | POST | `api_internal/ai/chat.js` | Nessuna |
| `GET /api/circolari` | GET | `api_internal/circolari/index.js` | Nessuna |
| `POST /api/circolari/sintesi` | POST | `api_internal/circolari/sintesi.js` | Nessuna |
| `GET /api/ping` | GET | `api_internal/ping.js` | Nessuna |
| `GET /api/google?action=auth-url` | GET | `api/google.js` | `userId` in query |
| `GET /api/google?action=callback` | GET | `api/google.js` | OAuth `state` |
| `GET /api/google?action=status` | GET | `api/google.js` | `userId` in query |
| `POST /api/google?action=sync` | POST | `api/google.js` | `userId` + token Supabase |
| `POST /api/google?action=save-argo` | POST | `api/google.js` | `userId` |
| `GET /api/google?action=disconnect` | GET | `api/google.js` | `userId` |
| `GET /api/manual-verifiche/:uid` | GET | `api/manual-verifiche/[user_id].js` | Nessuna |
| `POST /api/manual-verifiche/:uid` | POST | `api/manual-verifiche/[user_id].js` | Nessuna |
| `PUT /api/manual-verifiche/:uid` | PUT | `api/manual-verifiche/[user_id].js` | Nessuna |
| `DELETE /api/manual-verifiche/:uid` | DELETE | `api/manual-verifiche/[user_id].js` | Nessuna |
| `GET /api/cron-sync` | GET | `api/cron-sync.js` | Opzionale (commentata) |
| `POST /api/debug/profile-raw` | POST | `api_internal/debug/profile-raw.js` | Solo DEBUG_MODE=true |
| `POST /api/auth?action=resolve-profile` | POST | `api_internal/resolve-profile.js` | Nessuna |

### 5.2 Pattern request/response

**POST /login**
```json
// Request
{ "schoolCode": "MRGBGS", "username": "mario.rossi", "password": "secret", "selectedProfileIndex": null }

// Response 200 (singolo profilo)
{
  "success": true,
  "session": { "schoolCode": "MRGBGS", "authToken": "...", "accessToken": "...", "userName": "mario.rossi", "profileIndex": 0 },
  "student": { "id": "p:mrgbgs:mario.rossi:0", "name": "ROSSI MARIO", "class": "4D", "school": "MRGBGS" },
  "tasks": [...], "voti": [...], "promemoria": [...], "assenzeData": {...}, "verifiche": [...]
}

// Response 200 (più profili)
{ "success": true, "status": "MULTIPLE_PROFILES", "profiles": [{ "index": 0, "name": "...", "class": "...", "school": "..." }] }
```

**POST /sync**
```json
// Request
{ "schoolCode": "MRGBGS", "storedUser": "<base64>", "storedPass": "<base64>", "profileIndex": 0 }

// Response 200
{ "success": true, "tasks": [...], "voti": [...], "promemoria": [...], "assenzeData": {...}, "verifiche": [...], "new_tokens": { "authToken": "...", "accessToken": "..." }, "planner": {...}, "student": {...} }
```

### 5.3 Gestione errori

- Tutti gli handler restituiscono `{ success: false, error: "messaggio" }` + HTTP status code
- Login fallito: 401 con messaggio Argo o eccezione
- Parametri mancanti: 400
- Metodo non consentito: 405
- Credenziali errate Argo: 401 o 403 (a seconda della risposta Argo)
- Errori AI: 429 (quota), 500 (generico)
- **⚠️ Debug endpoint espone `stack trace`:** In `debug/profile-raw.js` la response include `e.stack` — solo con `DEBUG_MODE=true`

---

## 6. Analisi della sicurezza

### 6.1 🔴 CRITICO — File `.env` con credenziali reali committato in Git

**Problema:** Il file `.env` è presente nel repository con valori reali (non solo placeholder):

```
SUPABASE_URL=https://mlcutgkfunbpmrnbeznd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.[...]
VAPID_PUBLIC_KEY=BGykItHVYlyzS1HWADHj9[...]
VAPID_PRIVATE_KEY=0MnVAHDutWmmAhuIzeiRIpylAO[...]
```

- Il `SUPABASE_SERVICE_ROLE_KEY` è una chiave JWT con ruolo `service_role` che **bypassa completamente le Row Level Security (RLS)** di Supabase. Con questa chiave chiunque può leggere, modificare o cancellare tutti i dati del database.
- Le chiavi VAPID sono utilizzate per Web Push Notifications e una volta esposte devono essere rigenerate.
- Il `.gitignore` include già `.env` ma evidentemente il file era già tracciato da git prima dell'aggiunta alla gitignore, oppure è stato aggiunto accidentalmente con `git add -f`.
- La stessa `SUPABASE_URL` è visibile anche in chiaro in `index.html` e in `api/cron-sync.js` come fallback hardcoded.

**Impatto:** Accesso non autorizzato completo al database Supabase (profili studenti, planner, credenziali Argo, token Google OAuth2).

**Azione urgente:** Rigenerare immediatamente la `SUPABASE_SERVICE_ROLE_KEY` dal pannello Supabase, revocare le chiavi VAPID, e rimuovere il file `.env` dalla history git con `git filter-repo` o BFG Repo Cleaner.

---

### 6.2 🔴 CRITICO — Credenziali Argo archiviate in plaintext su Supabase

**Problema:** La tabella `google_tokens` archivia `argo_password` in chiaro (plaintext). L'endpoint `POST /api/google?action=save-argo` salva direttamente la password dell'utente.

```javascript
// api/google.js
await getSupabase().from('google_tokens').update({
    argo_school_code: schoolCode,
    argo_username: username,
    argo_password: password,  // ← plaintext
    ...
```

**Impatto:** Chiunque acceda al database (incluso chi ha la `service_role_key` esposta al §6.1) può leggere le credenziali Argo di tutti gli utenti.

---

### 6.3 🔴 CRITICO — Nessuna autenticazione sugli endpoint sensibili

**Problema:** Tutti gli endpoint del backend non richiedono alcuna forma di autenticazione o autorizzazione reale:

- `GET /api/planner/<user_id>` — restituisce il planner di **qualsiasi** utente conoscendo solo il loro PID
- `PUT /api/planner/<user_id>` — sovrascrive il planner di qualsiasi utente
- `GET /api/profile/<user_id>` — legge profilo di qualsiasi utente
- `PUT /api/profile` — aggiorna profilo di qualsiasi utente fornendo solo `userId` nel body
- `GET/POST/PUT/DELETE /api/manual-verifiche/<uid>` — accesso CRUD completo ai dati di qualsiasi utente

Il PID è deterministico e deducibile: `p:<scuola>:<username>:<indice>` (tutto lowercase). Chi conosce il codice scuola e l'username può accedere a tutti i dati di un altro studente.

---

### 6.4 🔴 CRITICO — Password trasmessa in base64 (non cifrata)

**Problema:** Il client salva la password come base64 in `localStorage.argo_session.storedPass`. Il backend la decodifica semplicemente:

```javascript
// api_internal/sync.js
const pwd = decodeURIComponent(Buffer.from(storedPass, 'base64').toString('utf-8'));
```

**Base64 non è cifratura.** La password è immediatamente recuperabile da:
- Chiunque acceda al browser (localStorage), tramite XSS o DevTools
- Qualsiasi estensione browser con accesso alla pagina
- Network inspection (se HTTPS viene bypassato)

---

### 6.5 🟠 ALTO — Protezione cron endpoint commentata

**Problema:** In `api/cron-sync.js` la verifica del `CRON_SECRET` è commentata:

```javascript
// if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
//     return res.status(401).json({ success: false, error: 'Unauthorized' });
// }
```

**Impatto:** Chiunque può invocare manualmente il cron con GET/POST su `/api/cron-sync`, causando un login Argo per tutti gli utenti presenti nel database contemporaneamente (possibile rate-limit o blocco IP da Argo).

---

### 6.6 🟠 ALTO — CORS wildcard su tutti gli endpoint

**Problema:** Sia `vercel.json` che `lib/helpers.js` impostano `Access-Control-Allow-Origin: *` su tutti gli endpoint API.

In `helpers.js`:
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Credentials', 'true');
```

**Nota:** La combinazione `Access-Control-Allow-Origin: *` con `Access-Control-Allow-Credentials: true` è **invalida per lo standard CORS** ma non causa un errore esplicito in tutti i browser; tuttavia indica una configurazione non pensata. L'ambiente `.env` definisce `ALLOWED_ORIGINS` ma questa variabile **non è mai usata nel codice**.

**Impatto:** Qualsiasi sito web può chiamare le API backend con fetch() senza restrizioni di origine.

---

### 6.7 🟠 ALTO — Credenziali Supabase hardcoded nel frontend

**Problema:** In `index.html` le credenziali Supabase sono hardcoded:

```javascript
const SUPABASE_URL = "https://mlcutgkfunbpmrnbeznd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.[...]";
```

La `SUPABASE_ANON_KEY` (ruolo `anon`) è meno pericolosa della `service_role_key` (§6.1), ma è comunque visibile a chiunque inspeczioni il sorgente della pagina. Se RLS non è configurata correttamente su Supabase, consente accesso ai dati.

Anche `api/cron-sync.js` e `api/google.js` hanno hardcoded la SUPABASE_URL come fallback:
```javascript
const url = process.env.SUPABASE_URL || 'https://mlcutgkfunbpmrnbeznd.supabase.co';
```

---

### 6.8 🟠 ALTO — Endpoint debug espone stack trace e dati grezzi Argo

**Problema:** `api_internal/debug/profile-raw.js` è protetto solo da `DEBUG_MODE`, ma:
1. Se `DEBUG_MODE=true` (come nel `.env` committato), espone i dati grezzi Argo del profilo incluso `fullRaw`
2. La response include `e.stack` in caso di errore

```javascript
// debug/profile-raw.js
res.status(500).json({ success: false, error: e.message, stack: e.stack });
```

---

### 6.9 🟡 MEDIO — `node_modules` committato in repository

**Problema:** La directory `node_modules` (~400+ MB) è presente nel repository. Questo è un problema perché:
- Aumenta enormemente la dimensione del repository
- Rende impossibile verificare la supply-chain delle dipendenze (audit npm)
- Potrebbe contenere versioni vulnerabili di pacchetti

---

### 6.10 🟡 MEDIO — Nessuna validazione input per XSS nei dati Argo

**Problema:** I dati provenienti da Argo (nomi materie, testi compiti, titoli promemoria) vengono inseriti direttamente nel DOM tramite template string HTML in `ui.js`:

```javascript
// ui.js (esempio)
`<div class="task-text">${task.text}</div>`
```

Se Argo restituisse HTML nei campi testo (es. `<script>alert(1)</script>`), potrebbe verificarsi un XSS stored/reflected. Non ci sono funzioni di sanitizzazione `innerHTML` o uso di `textContent`.

---

### 6.11 🟡 MEDIO — Orario scolastico hardcoded per classe specifica

**Problema:** In `lib/googleCalendar.js` l'orario scolastico è hardcoded per la **classe 4D**:

```javascript
const ORARIO_SCOLASTICO = {
    "lunedi": [
        { "materia": "SCIENZE", "inizio": "08:00", "fine": "09:00" },
        // ... specifico per 4D
    ]
};
```

Tutti gli utenti di altre classi riceveranno eventi Google Calendar con orari errati.

---

### 6.12 🟡 MEDIO — Prompt AI hardcoded per Liceo Gandhi

**Problema:** Il prompt per la sintesi circolari contiene:

```javascript
const prompt = `Sei un assistente per studenti del Liceo Gandhi.`;
```

E l'URL di scraping circolari è:
```javascript
const SCHOOL_URL = 'https://www.liceogandhi.edu.it/categoria/storico-circolari/';
```

L'applicazione è hardcoded per un istituto specifico, limitando la generalizzabilità.

---

### 6.13 🟢 POSITIVO — Aspetti di sicurezza corretti

- **PKCE implementato correttamente:** Il flusso OAuth2 con `code_verifier`/`code_challenge` SHA-256 è implementato seguendo lo standard RFC 7636
- **Redaction nei log:** La funzione `redact()` oscura token e password nei log di debug
- **Validazione tipo metodo HTTP:** Tutti gli handler verificano il metodo HTTP
- **Security check su DELETE/PUT verifiche:** `manual-verifiche` controlla che `user_id` corrisponda all'ID nell'URL
- **`isValidName()` previene iniezione di dati UI-like come nome studente**

---

## 7. Punti deboli e debito tecnico

### 7.1 🔴 Credenziali e segreti esposti (Priorità: CRITICA)

Come dettagliato nel §6, il problema principale è la **compromissione dei segreti** tramite il file `.env` committato e le credenziali hardcoded.

**Impatto:** Accesso completo al database, credenziali studenti leggibili.

---

### 7.2 🔴 Mancanza totale di autenticazione/autorizzazione API (Priorità: CRITICA)

Nessun endpoint verifica l'identità del chiamante. Qualsiasi utente con conoscenza del formato PID può:
- Leggere il planner di altri studenti
- Modificare il profilo di chiunque
- Aggiungere/eliminare verifiche manuali altrui

**Impatto:** Violazione della privacy degli studenti, possibilità di sabotaggio dati.

---

### 7.3 🟠 Architettura monolitica frontend (Priorità: ALTA)

`ui.js` ha ~4170 righe in un unico file con funzioni annidate, closure multiple e un oggetto `state` globale. Questo porta a:
- Difficoltà di manutenzione e debug
- Impossibilità di test unitari
- Conflitti in caso di sviluppo parallelo
- Caricamento sincrono di tutto il codice al boot

---

### 7.4 🟠 `node_modules` committato (Priorità: ALTA)

Il repository include `node_modules` che non dovrebbe mai essere versionato:
- Dimensione repository inutilmente grande
- Difficoltà di `git clone` e `git pull`
- Impossibilità di audit vulnerabilità

---

### 7.5 🟠 Cache serverless inaffidabile (Priorità: ALTA)

Sia `sintesiCache.js` che `circolari/index.js` usano `/tmp` come cache. In ambiente serverless Vercel:
- Ogni cold start azzera la cache
- Istanze parallele hanno `/tmp` separati
- Non c'è garanzia di coerenza tra invocazioni

**Impatto:** Chiamate ridondanti a Groq (costi API) e scraping ripetuto.

---

### 7.6 🟡 Date assemblee scolastiche hardcoded (Priorità: MEDIA)

In `extractAssenzeFromDashboard()` ci sono date di assemblea hardcoded:

```javascript
const assemblyDates = ['2026-02-07', '2026-01-16', '2025-12-15', '2025-11-11', '2025-10-25', '2025-09-30'];
```

Queste date scadranno e dovranno essere aggiornate manualmente ogni anno scolastico.

---

### 7.7 🟡 Nessun sistema di test (Priorità: MEDIA)

Il `package.json` non definisce script `test`. Non esiste alcun test unitario o di integrazione. Questo significa:
- Regressioni non rilevabili automaticamente
- Difficoltà nel refactoring sicuro
- Nessuna CI/CD di qualità

---

### 7.8 🟡 Gestione errori inconsistente (Priorità: MEDIA)

- Alcuni handler rilanciano le eccezioni, altri le silenziano
- `cron-sync.js` logga errori per utente ma continua senza notificarne nessuno
- La sintesi AI su 429/500 ritenta silenziosamente ma non avvisa l'utente del numero di retry

---

### 7.9 🟡 `.DS_Store` committato (Priorità: BASSA)

File macOS metadata versionato. Espone informazioni sulla struttura del filesystem dello sviluppatore.

---

### 7.10 🟡 Mancanza di rate limiting (Priorità: MEDIA)

Nessun endpoint implementa rate limiting. Possibili attacchi:
- Brute force su `/login` (tentativo credenziali Argo)
- Spam sull'endpoint AI (consumo quota Groq)
- Spam su `/api/circolari/sintesi` (consumo quota Groq + download PDF)

---

### 7.11 🟢 Debito tecnico minore

- Commento `// Kept for backward compat` su `extractGradesMultiStrategy` indica codice legacy non rimosso
- `google.js` duplica la logica Supabase rispetto a `lib/supabase.js` (due singletons separati)
- `cron-sync.js` duplica la stessa logica Supabase di `google.js`
- Il README ha una riga duplicata: `"Planner: Gestione attività scolastiche."` appare due volte

---

## 8. Raccomandazioni

### 8.1 Quick Wins (entro 1-2 giorni)

#### ✅ QW-1 — Revocare immediatamente le credenziali esposte
1. Andare su [supabase.com](https://supabase.com) → Project Settings → API → Rigenera `service_role_key`
2. Aggiornare la variabile d'ambiente su Vercel Dashboard
3. Revocare e rigenerare le chiavi VAPID
4. Rimuovere `.env` dalla history git:
   ```bash
   git rm --cached .env
   git filter-repo --path .env --invert-paths
   git push --force-with-lease
   ```
5. Aggiornare `.gitignore` e verificare che `.env` sia escluso

#### ✅ QW-2 — Rimuovere `node_modules` dal repository
```bash
git rm -r --cached node_modules
git commit -m "Remove node_modules from tracking"
git push
```
Assicurarsi che `node_modules` sia nel `.gitignore` (lo è già).

#### ✅ QW-3 — Abilitare la protezione cron
In `api/cron-sync.js`, decommentare le righe:
```javascript
if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
}
```
Aggiungere `CRON_SECRET` come variabile d'ambiente Vercel.

#### ✅ QW-4 — Disabilitare `DEBUG_MODE` in produzione
Assicurarsi che la variabile `DEBUG_MODE=false` sia impostata nell'ambiente Vercel di produzione (non `true` come nel `.env` committato).

---

### 8.2 Miglioramenti a medio termine (entro 2-4 settimane)

#### 🔐 MT-1 — Implementare autenticazione JWT sugli endpoint protetti

Aggiungere un middleware di verifica token. Schema consigliato:
1. Al login, il backend genera un JWT firmato con `user_id` e `exp` (es. 24h) usando una chiave segreta su Vercel
2. Il client invia il JWT nell'header `Authorization: Bearer <token>` su ogni richiesta protetta
3. Gli handler verificano il JWT e confrontano `user_id` con il parametro URL

```javascript
// Esempio middleware (da aggiungere a lib/auth.js)
const jwt = require('jsonwebtoken');

function verifyToken(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new Error('Token mancante');
    return jwt.verify(token, process.env.JWT_SECRET);
}
```

#### 🔐 MT-2 — Cifrare le credenziali Argo archiviate

Se è necessario archiviare le credenziali Argo per il cron:
- Usare cifratura simmetrica AES-256-GCM con chiave su Vercel env vars
- **Alternativa migliore:** Usare un approccio refresh-token invece di credenziali plaintext

#### 🛡️ MT-3 — Configurare CORS in modo restrittivo

In `lib/helpers.js`, usare la variabile `ALLOWED_ORIGINS` che è già definita in `.env.example` ma non usata:

```javascript
function setCorsHeaders(req, res) {
    const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
    const origin = req.headers.origin || '';
    if (allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');
    // ... resto degli header (senza Credentials: true se origin è wildcard)
}
```

#### 🛡️ MT-4 — Aggiungere sanitizzazione output XSS

In `ui.js`, sostituire le interpolazioni HTML dirette con una funzione di escape:

```javascript
function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Poi: `<div class="task-text">${esc(task.text)}</div>`
```

#### 🗄️ MT-5 — Migrare la cache sintesi da `/tmp` a Supabase

Aggiungere una tabella `sintesi_cache` su Supabase:
```sql
CREATE TABLE sintesi_cache (
    id TEXT PRIMARY KEY,
    sintesi TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 📦 MT-6 — Spezzare `ui.js` in moduli

Suddividere `ui.js` in file ES modules:
- `state.js` — state management
- `views/home.js`, `views/planner.js`, ecc. — view rendering
- `api.js` — chiamate API
- `utils.js` — utility (date, hash, ecc.)

#### ⏱️ MT-7 — Aggiungere rate limiting

Usare la KV store di Vercel o un semplice rate limiter in memoria per limitare:
- `/login`: max 5 tentativi/min per IP
- `/api/ai/chat`: max 20 msg/min per utente
- `/api/circolari/sintesi`: max 10 req/min

#### 🔧 MT-8 — Parametrizzare l'orario scolastico e la scuola target

- Spostare `ORARIO_SCOLASTICO` in Supabase o in un file di configurazione per-utente
- Rendere `SCHOOL_URL` (URL circolari) configurabile via variabile d'ambiente
- Rendere il prompt AI parametrico (senza riferimento al "Liceo Gandhi")

#### 🧪 MT-9 — Aggiungere test

Configurare Jest e aggiungere almeno:
- Test unitari per `helpers.js` (normalizeClass, isValidName, generatePid)
- Test unitari per `googleCalendar.js` (normalizeTitle, generateArgoId)
- Test di integrazione per `/login` con mock di Argo

```bash
npm install --save-dev jest
```

---

### 8.3 Riepilogo priorità

| ID | Problema | Priorità | Effort |
|---|---|---|---|
| QW-1 | Credenziali `.env` esposte | 🔴 CRITICA | Basso |
| QW-2 | `node_modules` in git | 🟠 ALTA | Basso |
| QW-3 | Protezione cron disabilitata | 🟠 ALTA | Basso |
| QW-4 | DEBUG_MODE=true in prod | 🔴 CRITICA | Basso |
| MT-1 | Nessuna autenticazione API | 🔴 CRITICA | Alto |
| MT-2 | Password Argo in plaintext | 🔴 CRITICA | Medio |
| MT-3 | CORS wildcard | 🟠 ALTA | Basso |
| MT-4 | XSS injection via dati Argo | 🟡 MEDIA | Medio |
| MT-5 | Cache /tmp inaffidabile | 🟡 MEDIA | Medio |
| MT-6 | `ui.js` monolitico | 🟡 MEDIA | Alto |
| MT-7 | Nessun rate limiting | 🟡 MEDIA | Medio |
| MT-8 | Hardcoding scuola/orario | 🟡 MEDIA | Medio |
| MT-9 | Nessun test | 🟡 MEDIA | Alto |

---

## Note conclusive

G-Connect è un progetto **tecnicamente ambizioso e funzionalmente completo** per una PWA scolastica personale. Il flusso OAuth2 PKCE con Argo, il sistema multi-strategia di risoluzione identità, l'integrazione Google Calendar con deduplicazione e l'estrazione dati dalla dashboard Argo mostrano una notevole competenza tecnica.

Tuttavia, il progetto presenta **criticità di sicurezza gravi** che ne impediscono la distribuzione pubblica sicura nella forma attuale, in particolare:

1. Le credenziali di produzione sono compromesse (§6.1) e devono essere rigenerate **immediatamente**
2. Il backend non ha autenticazione sugli endpoint che gestiscono dati personali degli studenti (§6.3)
3. Le password Argo sono archiviate in chiaro (§6.2)

Prima di qualsiasi proposta commerciale (es. a DidUP), è **indispensabile** risolvere almeno i Quick Wins §8.1 e il punto MT-1 (§8.2).

---

*Analisi prodotta in modalità read-only. Nessun file del repository è stato modificato.*  
*Tutte le osservazioni sono basate sul codice sorgente effettivo al momento dell'analisi.*
