# G-Connect 🎓

**G-Connect** è una Progressive Web App (PWA) moderna per studenti, progettata per integrarsi con il registro elettronico **Argo DidUP**.

## ✨ Caratteristiche
- **Design Premium**: Interfaccia stile iOS/Glassmorphism.
- **Argo Integration**: Login sicuro e sincronizzazione Compiti.
- **Planner**: Gestione attività scolastiche.
- **Google Calendar Sync**: Sincronizzazione automatica dei compiti con orari scolastici precisi.

## 🚀 Architettura & Deploy

Il backend è basato su **Vercel Serverless Functions** (Node.js).

### 1. Requisiti
- Node.js 20.x
- Account Vercel

### 2. Sviluppo Locale
```bash
# Installa le dipendenze
npm install

# Avvia in modalità sviluppo con Vercel CLI
vercel dev
```

### 3. Deploy
Il progetto è configurato per il deploy su **Vercel**.
1. Carica questa cartella su **GitHub**.
2. Collega la repository a **Vercel**.
3. Le variabili d'ambiente (.env) devono essere configurate nel pannello di controllo Vercel.
4. Il cron job è configurato tramite GitHub Actions (`.github/workflows/cron-sync.yml`).

### 4. Configurazione Cron Job (GitHub Actions)

Il sync automatico orario usa GitHub Actions. Per farlo funzionare correttamente:

#### Variabili e Segreti GitHub richiesti
Vai su **Settings → Secrets and variables → Actions** nella tua repository GitHub:

| Tipo | Nome | Valore |
|------|------|--------|
| **Secret** | `CRON_SECRET` | Il valore di `CRON_SECRET` configurato su Vercel (es. `gconnect_sync_2024_secure_key`) |
| **Variable** | `VERCEL_URL` | L'URL del tuo deploy Vercel (es. `https://g-connect-backend-r5j1.vercel.app`) |

> ⚠️ **Importante**: Il valore di `CRON_SECRET` deve essere **identico** sia nel segreto GitHub che nella variabile d'ambiente Vercel. Se i valori non corrispondono, il cron restituirà HTTP 401 e non effettuerà il sync.

#### Configurazione Vercel richiesta
Nel pannello Vercel (Settings → Environment Variables), assicurati di avere:
- `CRON_SECRET` — stesso valore del segreto GitHub
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — credenziali Google OAuth2
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — credenziali Supabase
- `ARGO_ENCRYPTION_KEY` — chiave di cifratura per le password Argo

> **Nota**: `CLASS_SCHEDULE` è **opzionale**. Se non impostato, viene usato automaticamente l'orario predefinito della classe 4D (Lun-Sab, 08:00–13:00). È comunque possibile impostare un orario personalizzato **per singolo utente** tramite l'azione `save-schedule` (vedere sezione API).

### 5. Orario Scolastico per-utente (Google Calendar Sync)

Ogni utente può salvare il proprio orario scolastico personale, che viene usato per determinare l'orario preciso degli eventi su Google Calendar. Se non impostato, viene usato il valore dell'env var `CLASS_SCHEDULE` (globale) oppure l'orario di default della classe 4D.

**Salva l'orario tramite API:**
```
POST /api/google?action=save-schedule
x-session-token: <session_token>
Content-Type: application/json

{
  "userId": "...",
  "classSchedule": {
    "lunedi":   [{"materia":"MATEMATICA","inizio":"08:00","fine":"09:00"}, ...],
    "martedi":  [...],
    "mercoledi":[...],
    "giovedi":  [...],
    "venerdi":  [...],
    "sabato":   [...]
  }
}
```

**Passa l'orario direttamente al sync (senza salvarlo):**
```
POST /api/google?action=sync
Content-Type: application/json

{
  "userId": "...",
  "tasks": [...],
  "classSchedule": { ... }
}
```

## 🛠 Tecnologie
- **Frontend**: HTML5, Vanilla JS, CSS3 (No Frameworks).
- **Backend**: Node.js, Vercel Serverless Functions.
- **Database**: Supabase.
- **AI**: Groq SDK / Gemini API.
- **Argo API**: Integrazione diretta con il registro.
