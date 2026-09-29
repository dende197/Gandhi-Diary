# Correzioni audit backend — 28 settembre 2026

Base: `e75602955481f8a655eef16a2c90b5a53cce5ecb`, repository `dende197/Gandhi-Diary`.

Le modifiche trattano i 40 rilievi dell'audit. Sono state verificate con servizi esterni simulati e un database PostgreSQL PGlite isolato. Non sono state applicate migrazioni al database reale né eseguite operazioni sui calendari degli utenti. Il codice originale locale e le modifiche frontend preesistenti sono rimasti intatti nella loro cartella; questo ramo contiene le correzioni backend e gli adattamenti client necessari.

## Cambiamenti di comportamento

- Sessioni casuali distinte per dispositivo, memorizzate solo come digest, revocabili al logout. Validità accesso 24 ore, rinnovo entro un limite assoluto di 14 giorni. Le vecchie sessioni HMAC richiedono un nuovo login.
- Credenziali Argo lette esclusivamente dalla riga dell'utente autenticato. Il recupero del profilo usa l'identificativo dello studente Argo; nessun ripiego automatico su fratelli o username simili.
- Un servizio comune gestisce recupero Argo, cache breve e rinnovo; un altro gestisce Google per sincronizzazione manuale e cron. Le scritture restituiscono errori espliciti.
- Le classi sono identificate da scuola, anno scolastico e classe verificata su Argo. Tutte le letture e scritture richiedono una sessione. Le nomine a rappresentante richiedono una concessione amministrativa; il limite di due e i voti sulle proposte aperte sono verificati nel database.
- Planner con versione obbligatoria e aggiornamento atomico. I campi omessi restano intatti. Il client serializza i salvataggi, conserva bozze in caso di errore e propone una scelta quando un altro dispositivo ha modificato il planner.
- Calendar usa identificativi deterministici, paginazione completa e aggiornamenti degli eventi. Gli errori parziali fanno fallire la sincronizzazione. Scollegare Google conserva le credenziali Argo.
- Il cron elabora una coda ordinata per tentativo meno recente, con durata limitata, blocco distribuito e annullamento delle richieste. Vengono selezionati solo account con refresh token Google. Se non termina tutti gli utenti, i successivi avranno priorità nella prossima esecuzione.
- La cache delle sintesi è condivisa nel database, scade dopo 24 ore ed è legata all'URL. Sintesi e chat richiedono autenticazione e una quota persistente. I PDF con query string e link relativi sono gestiti correttamente.

## Migrazione e pubblicazione

Questa versione richiede una pubblicazione coordinata. **Non pubblicare soltanto il backend prima di preparare Supabase.** Il ramo e la PR sono destinati alla revisione prima della produzione.

1. Conservare un backup del database. Verificare lo schema reale, in particolare le tabelle storiche `profiles`, `planners`, `manual_verifiche`, `google_tokens` e le personalizzazioni RLS. I test coprono lo schema del repository, non uno schema di produzione non ispezionato.
2. Per un database nuovo, applicare tutte le migrazioni di `supabase/migrations` in ordine. Per uno esistente, riconciliare prima la cronologia Supabase: `20260801000000_core_schema.sql` crea le tabelle di base mancanti ed è idempotente; non contrassegnare alla cieca come già applicata una migrazione sconosciuta.
3. Applicare `202609280001_backend_integrity.sql` durante la finestra di aggiornamento. Crea sessioni, membership, concessioni, cache, quote, blocchi e funzioni atomiche. Rimuove **tutte** le policy delle tabelle elencate e revoca accesso diretto ai ruoli `anon`/`authenticated`: eventuali altre applicazioni che usano quelle policy richiedono valutazione preventiva.
4. Pubblicare backend e client aggiornati insieme. Il client ora legge le classi tramite API autenticata e polling, non tramite il vecchio accesso pubblico Realtime. I client vecchi ricevono errori di autenticazione/versione anziché sovrascrivere dati.
5. Eseguire nuovamente il login Argo. Questa operazione registra l'identità verificata e la nuova sessione. Se un profilo storico non ha un identificativo Argo attendibile, verificare l'associazione prima di migrare i suoi dati: non viene associato automaticamente a un altro studente.
6. Registrare le nomine ufficiali dei rappresentanti usando un accesso amministrativo. Le vecchie auto-nomine non costituiscono prova del ruolo. Esempio, sostituendo l'ID con quello verificato:

   ```sql
   insert into public.class_rep_grants (user_id, class_key)
   select user_id, class_key
   from public.verified_memberships
   where user_id = 'p:codicescuola:username:0'
   on conflict do nothing;
   ```

   Dopo la concessione, il rappresentante può attivare il ruolo nell'app. Revocare la concessione impedisce le successive operazioni di gestione. I dati di classe precedenti, privi di scuola/anno verificati, restano conservati ma non sono esposti nelle nuove classi: vanno eventualmente riassegnati con una migrazione amministrativa verificata.

7. Verificare le variabili di `.env.example`: mantenere invariata `ARGO_ENCRYPTION_KEY`; configurare `PWA_URL`, OAuth Google, `CRON_SECRET`, origini esatte e modelli AI disponibili. `SESSION_HMAC_KEY` non serve più. Impostare `SCHOOL_ANNUAL_HOURS` solo con il monte ore reale: senza configurazione il Watch restituisce `null` per percentuale e monte ore. L'orario per utente salvato da Google prevale sul valore generico; in assenza di durata Argo e orario, il ripiego giornaliero è configurabile tramite `SCHOOL_DAILY_HOURS` (4 ore).
8. Provare con account di test: login, selezione fratelli, rinnovo, logout/revoca, salvataggio planner da due dispositivi, Google OAuth/sync/disconnessione, ruoli/voti di classe e cron. Verificare che la durata massima di 120 secondi configurata su Vercel sia supportata dal deployment.

### Limiti dichiarati

- **B15, rimozione degli eventi:** gli aggiornamenti di data/testo/orario e l'idempotenza sono implementati. La rimozione degli eventi mancanti è eseguita solo se il chiamante certifica uno snapshot completo. Il servizio Argo richiede `complete: true` nella risposta; non presume che un elenco vuoto o troncato sia completo. In assenza di questa garanzia gli eventi mancanti vengono conservati. L'eliminazione automatica di tutti gli eventi rimossi da Argo resta subordinata alla verifica del protocollo reale, per evitare cancellazioni sbagliate.
- Quando Argo non offre un ID stabile, l'identità dell'evento è dedotta dai dati disponibili: una modifica al testo può apparire come un elemento nuovo. Non viene inventata una corrispondenza tra compiti diversi.
- Non sono stati misurati tempi o consumi nel deployment reale, né verificati ruoli RLS custom, credenziali Google/Argo, disponibilità del modello AI o compatibilità del client Watch distribuito. PGlite verifica SQL e condizioni atomiche, non replica l'intero ambiente Supabase/PostgREST o un cluster concorrente.
- La pubblicazione del ramo su GitHub non applica la migrazione Supabase e non certifica l'avvenuta distribuzione in produzione.

## Tracciamento dei rilievi

| Rilievo | Intervento e verifica |
|---|---|
| B01 | Sync rifiuta identità discordanti prima di leggere Argo; test accesso incrociato. |
| B02 | Eliminato recupero Google per scuola/username; solo user ID autenticato. |
| B03 | Eliminato il vault di password in RAM e il salvataggio di credenziali arbitrarie tramite Google. |
| B04 | Membership verificata e concessioni amministrative; voti solo nella propria classe e su proposta aperta. |
| B05 | GET autenticato e rimozione delle policy pubbliche; test dei privilegi SQL. |
| B06 | Sessioni per dispositivo, digest, scadenza assoluta e revoca; test accesso/rinnovo/logout. |
| B07 | Disconnessione Google con aggiornamento parziale, non cancellazione della riga Argo. |
| B08 | Stato basato sul refresh token Google e `last_google_sync`. |
| B09 | Coda cron limitata agli account collegati e ordinata per ultimo tentativo. |
| B10 | Token Argo validi e snapshot breve precedono il login; eliminato il falso blocco di cinque minuti. |
| B11 | Errori parziali propagati come fallimento, anche nel conteggio cron. |
| B12 | Hash SHA-256 dell'intera identità, senza prefissi base64 troncati. |
| B13 | Tutte le pagine di Calendar vengono lette. |
| B14 | ID Google deterministici, gestione 409 e blocco distribuito per utente. |
| B15 | Aggiornamento e riconciliazione implementati con vincolo di completezza; limite documentato sopra. |
| B16 | Errori di cancellazione promemoria producono `success: false`. |
| B17 | Unione ricorsiva dei blocchi giornalieri con campi complementari. |
| B18 | Normalizzazione dei contenitori Argo e tolleranza dei blocchi malformati coperti dai test. |
| B19 | Date relative delle verifiche calcolate rispetto alla pubblicazione. |
| B20 | Anno esplicito e abbreviazioni italiane dei mesi riconosciuti. |
| B21 | ID dei voti basati sull'ID Argo o su più attributi; deduplicazione. |
| B22 | Durata strutturata prioritaria, orario per utente e ripiego configurabile. |
| B23 | Giustificazioni ISO con fuso orario e millisecondi riconosciute. |
| B24 | Ricerca della classe anche nei contenitori annidati reali del dashboard. |
| B25 | Verifiche manuali caricate anche quando il planner non esiste. |
| B26 | Risultati `{error}` controllati e persistenza token Google esplicitamente attesa. |
| B27 | Orario validato e salvato per il riuso da cron. |
| B28 | Controlli su corpi, date, tipi, stati, voti e dimensione delle richieste. |
| B29 | Cache sintesi per URL con TTL, indipendente dall'ID scelto dal client. |
| B30 | Origini CORS esatte, senza fiducia in tutti i tenant GitHub Pages/Vercel. |
| B31 | Redazione delle chiavi sensibili ampliata e rimozione dei log ordinari dei compiti. |
| B32 | Filtro dei nomi per parole, senza respingere Francesco. |
| B33 | Script password senza dotenv, paginato per chiave e protetto da modifiche concorrenti. |
| B34 | Deadline con AbortSignal propagato alle richieste, nessun Promise.race che lascia lavoro nascosto. |
| B35 | Versione atomica del planner, errore 409, campi omessi preservati e bozze client conservate. |
| B36 | Recupero del profilo per identità Argo stabile, senza ripiego sul primo figlio. |
| B37 | Dettagli Watch basati sulle stesse ore effettive dei totali; denominatore reale configurabile. |
| B38 | Limite rappresentanti protetto da lock transazionale nel database. |
| B39 | Sintesi autenticata, quote persistenti anche per chat e validazione dei messaggi. |
| B40 | Orologio dei test Calendar controllato e ripetizione delle prove con data futura. |

## Verifiche ripetibili

### Verifica Supabase del 29 settembre

Ispezionati in sola lettura colonne, vincoli, policy, privilegi e cronologia del progetto collegato. Le tabelle usate dalle correzioni hanno i tipi e le chiavi attesi; le nuove tabelle operative e la versione del planner non sono ancora presenti. Nella cronologia risulta applicata soltanto `20260823142414_init_proposals_schema.sql`. La migrazione di base antecedente richiede quindi una riconciliazione esplicita (`db push --include-all --dry-run` per controllare l'elenco prima dell'applicazione); non segnare come applicati aggiornamenti non eseguiti.

Rilevate anche quattro tabelle storiche senza riferimenti nel codice corrente: `conversations`, `conversation_participants`, `mental_health_logs`, `push_subscriptions`. I privilegi consentono lettura/inserimento anonimi; le prime tre hanno policy pubbliche permissive, l'ultima non ha RLS. La policy chiamata "Service role full access" su `mental_health_logs` è in realtà assegnata a PUBLIC. La migrazione `202609290001_lock_legacy_tables.sql` chiude tali accessi, mantiene i dati e l'accesso amministrativo, e salta le tabelle assenti nelle installazioni nuove. La verifica locale copre sia tabelle assenti sia presenti, riesecuzione, conservazione dei dati e diniego di lettura/scrittura ai client. Eventuali applicazioni esterne alla repository che usano queste tabelle richiedono verifica prima del rilascio.

La simulazione `db push --linked --include-all --dry-run` è riuscita: elenca, nell'ordine, base (`20260801000000`), policy (`20260901`), integrità (`202609280001`) e tabelle storiche (`202609290001`). La suite locale aggiornata passa 132 test su 132 con Node 20. Nessuna modifica è stata applicata al database reale. Restano necessari backup, aggiornamento coordinato, nuovo login e prove con account di test; questa ispezione non certifica le integrazioni esterne o le prestazioni in produzione.

```sh
npm ci
npm test
npm audit --audit-level=high
```

La suite include regressioni dei difetti, sessioni, Calendar simulato e applicazione/riesecuzione delle migrazioni SQL. I test non usano credenziali reali. La dipendenza PGlite è di sviluppo e non fa parte del percorso di esecuzione delle API.
