# G-Connect 🎓

**G-Connect** è una Progressive Web App (PWA) moderna per studenti, progettata per integrarsi con il registro elettronico **Argo DidUP**.

## ✨ Caratteristiche
- **Design Premium**: Interfaccia stile iOS/Glassmorphism.
- **Argo Integration**: Login sicuro e sincronizzazione Compiti.
- **Planner**: Gestione attività scolastiche.
- **Planner**: Gestione attività scolastiche.

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
4. I cron job sono configurati automaticamente tramite `vercel.json`.

## 🛠 Tecnologie
- **Frontend**: HTML5, Vanilla JS, CSS3 (No Frameworks).
- **Backend**: Node.js, Vercel Serverless Functions.
- **Database**: Supabase.
- **AI**: Groq SDK / Gemini API.
- **Argo API**: Integrazione diretta con il registro.
