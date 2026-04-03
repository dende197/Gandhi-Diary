# Review completo repository `g-connect-backend` (bug hunt)

## Metodologia
- Analisi riga-per-riga dei file testuali del repo (API, librerie, frontend, config, workflow, docs, migration).
- Verifica funzionale statica lato **server** (routing, auth, sync, gestione errori) e lato **interfaccia** (stato, sicurezza DOM, flussi login/sync).
- File binari (PNG/SVG) non hanno codice eseguibile JS/Node da analizzare riga-per-riga come logica applicativa.

---

## Executive summary
Il progetto è funzionale e ben avanzato, ma contiene alcuni punti critici (soprattutto sicurezza e complessità frontend) che possono generare bug logici o rischi in produzione.

### Priorità ALTA
1. **Session auth aggirabile se manca `ARGO_ENCRYPTION_KEY`**  
   - File: `lib/helpers.js`  
   - `verifySessionToken()` ritorna `true` quando la chiave non è configurata.  
   - Impatto: endpoint protetti diventano di fatto pubblici in caso di misconfigurazione ambiente.

2. **Password Argo salvata lato client in `localStorage` (base64, non cifrata)**  
   - File: `index.html`, `ui.js`, `api_internal/sync.js`  
   - `storedPass` è recuperabile facilmente da script malevoli/XSS/device compromise.  
   - Impatto: compromissione credenziali utente.

3. **CORS: `Access-Control-Allow-Credentials: true` + wildcard potenziale**  
   - File: `lib/helpers.js`  
   - Quando `ALLOWED_ORIGINS` è vuoto, viene impostato `*` insieme a credentials=true.  
   - Impatto: configurazione insicura/non standard, comportamento ambiguo tra browser/proxy.

4. **Cron secret accettato anche via query string**  
   - File: `api/cron-sync.js`  
   - `req.query.secret` può finire in log/history/monitoring URL.  
   - Impatto: possibile leakage del segreto.

### Priorità MEDIA
1. **Frontend monolitico molto grande (`ui.js` ~5.4k righe)**  
   - Rischio regressioni, difficile test/manutenzione, alta fragilità.

2. **Override aggressivi globali nel motore fluidità**  
   - File: `fluidity-engine-v3.js`  
   - Patch runtime di `window.render`, `window.navigate`, `window.loadCircolari`: potente ma fragile su futuri refactor.

3. **URL backend hardcoded nel frontend**  
   - File: `index.html`  
   - `API_BASE_URL` fissato a un deploy specifico; rischio ambienti multipli incoerenti.

4. **Uso esteso di `innerHTML`**  
   - File: `ui.js`, `fluidity-engine-v3.js`  
   - Buon uso di `escapeHtml` in molti punti, ma superficie XSS resta ampia per futuri cambi.

### Priorità BASSA / Debito tecnico
1. **Messaggi/lingua/gestione errori non uniformi** (401/403/500 in parte inconsistenti).
2. **Log molto verbosi in produzione** (`console.log/error` diffusi).
3. **Duplicazioni logiche** (parse date, fallback identity/sync) tra moduli.
4. **File probabilmente superflui/non funzionali al runtime**
   - `Picsart_26-04-03_11-47-32-568.png` (non referenziato nel codice).
   - `CODE_ANALYSIS.md` molto lungo e parzialmente storico (utile come nota interna ma non runtime).

---

## Review dettagliata per aree

## 1) Server/API

### Routing e gateway
- `api/main.js`, `api/auth.js`, `api/resources.js`, `api/ai.js`, `api/circolari.js`: struttura semplice e leggibile.
- `api/resources.js` usa `url.includes('/planner')` e `url.includes('/profile')`: funziona ma routing string-based è fragile rispetto a matching esplicito.

### Sicurezza auth/sessione
- `lib/helpers.js`
  - `generateSessionToken`/`verifySessionToken` buoni (HMAC + timingSafeEqual).
  - **Issue critico**: fallback permissivo quando chiave non valida (`verifySessionToken => true`).

### Endpoint login/sync
- `api_internal/login.js`: completo, robusto nei fallback identity, buona resilienza.
- `api_internal/sync.js`
  - Dipendenza da `storedUser/storedPass` (base64) lato client.
  - Catch finale restituisce sempre 401, anche per errori server/non auth.

### Google integration
- `api/google.js`: molto completo (OAuth state firmato, refresh token update, schedule validation).
- Buona gestione fallback per `classSchedule`.
- Da migliorare: ridurre superficie dati sensibili che transitano dal client (password Argo in più punti di sync/link).

### Cron sync
- `api/cron-sync.js`: ben strutturato, buon reporting per utente, secure compare corretto.
- **Issue**: accetta secret via query (`req.query.secret`).

### Circolari e sintesi
- `api_internal/circolari/index.js`: scraping + cache `/tmp`, ok.
- `api_internal/circolari/sintesi.js`: buona difesa SSRF (hostname allowlist + https), retry AI gestito bene.

### DB/Supabase
- `lib/supabase.js`: inizializzazione singleton pulita.
- `api_internal/profile/*`, `planner/*`, `manual-verifiche/*`: endpoint funzionali; policy auth coerente (a eccezione del fallback permissivo se manca chiave).

---

## 2) Interfaccia frontend

### Stato e sessione
- `index.html` + `ui.js` implementano bene i flussi principali (login, sync, profilo, planner, google).
- **Issue importante**: `storedPass` persistita in localStorage (base64).

### Rendering/UI architecture
- `ui.js` contiene moltissima logica business + rendering + networking.
- Il progetto funziona, ma la complessità è molto alta: rischio regressioni e bug nascosti.

### Sicurezza lato UI
- Presente `escapeHtml` e usata in molti punti: positivo.
- Uso intensivo `innerHTML` resta punto di attenzione continuo.

### PWA e service worker
- `service-worker.js` ben fatto (cache versionata, skip waiting, network-first + fallback).
- Buona gestione update immediati.

### CSS/animazioni
- `style.css` e `animations.css` ricchi e coerenti col design.
- Debito: quantità elevata di stili inline/complessità visuale può rallentare manutenzione.

---

## 3) Qualità generale, ridondanze, complessità

### Ridondanze reali osservate
- Parsing date e normalizzazioni replicate in più moduli (`lib/argo.js`, `lib/googleCalendar.js`, frontend).
- Fallback multipli di identity resolution molto estesi (robusti ma complessi).
- Logging e gestione errori non sempre allineati.

### Complessità evitabile
- Patch runtime in `fluidity-engine-v3.js` su funzioni globali già definite: potente ma poco prevedibile nel lungo termine.
- Monolite frontend: difficile isolare bug e fare QA puntuale.

---

## 4) File superflui / da rivalutare

1. `Picsart_26-04-03_11-47-32-568.png`  
   - Non referenziato nell’app; possibile artefatto non necessario.

2. `CODE_ANALYSIS.md`  
   - Documento utile ma molto esteso e parzialmente storico; verificare se mantenerlo in root o archiviarlo.

3. `.gitignore`  
   - Copre basi comuni, ma non include esplicitamente eventuali report temporanei futuri (attenzione a file di audit generati localmente).

---

## 5) Controllo “funzioni davvero?” (server + interfaccia)

### Lato server (valutazione statica)
- Routing principale coerente.
- Endpoint core presenti e collegati.
- Nessun errore di sintassi evidente nei file analizzati.
- Punti logici critici già segnalati (session fallback permissivo, secret in query).

### Lato interfaccia (valutazione statica)
- Flussi login/sync/google/profilo/planner presenti e integrati.
- Presente gestione offline/sync/retry.
- Rischio principale non è la mancanza feature, ma **fragilità/manutenibilità** e gestione credenziali client.

---

## 6) Patch consigliate (ordine pratico)
1. Rendere **obbligatoria** `ARGO_ENCRYPTION_KEY` in produzione e far fallire hard gli endpoint protetti se manca.
2. Eliminare `storedPass` da localStorage (passare a sessione server-side/token breve + reauth mirata).
3. In `cron-sync`, rimuovere `req.query.secret` e tenere solo header auth.
4. Sistemare CORS: niente wildcard con credentials=true.
5. Modularizzare `ui.js` in moduli (auth, planner, google, rendering, components).
6. Ridurre override globali del fluidity engine o incapsularli con interfacce più stabili.
7. Pulizia artefatti/file non usati in root.

---

## Conclusione
Il repository è ricco di funzionalità e mostra molta cura lato prodotto, ma ha alcuni nodi critici (soprattutto sicurezza sessione/credenziali e complessità frontend) che meritano priorità alta.  
Con poche correzioni mirate ai punti critici e una graduale semplificazione architetturale, la stabilità generale può crescere in modo significativo.
