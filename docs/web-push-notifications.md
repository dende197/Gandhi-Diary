# Notifiche sul telefono

Implementazione Web Push standard per la PWA, senza dipendenza da Google Calendar. Comprende nuovi voti, nuove circolari pubblicate dal sito scolastico, nuovi compiti assegnati, assenze, ritardi, uscite e un promemoria dei compiti incompleti con scadenza domani.

## Uso

Nel profilo, «Notifiche sul telefono» permette di attivare/disattivare questo dispositivo, scegliere le sette categorie, impostare il promemoria dalle 16 alle 21 (predefinito 19:00, fuso Europe/Rome), mostrare facoltativamente i dettagli sul blocco schermo e inviare una prova. I dettagli sono nascosti per impostazione iniziale; il promemoria mostra il numero dei compiti.

Il permesso viene chiesto solo premendo «Attiva notifiche». Su Android serve un browser compatibile aggiornato, come Chrome. Su iPhone/iPad occorrono iOS/iPadOS 16.4 o successivi e l’app aggiunta alla schermata Home; la scheda Safari normale non basta. L’interfaccia spiega come installarla. Logout e cambio account annullano l’abbonamento locale; un successivo accesso allo stesso account mantiene l’attivazione se non è stato eseguito logout.

Le preferenze valgono per il singolo dispositivo. Una revoca dalle impostazioni del sistema operativo può richiedere una nuova attivazione dall’app. La registrazione scaduta viene rimossa dal server alla risposta 404/410 del servizio push.

## Funzionamento e limiti

- Il job Supabase `gandhi-web-push` chiama `GET /api/push?op=cron` ogni 15 minuti tramite `pg_cron` e `pg_net`, dalle 07:00 alle 22:00 italiane. Il workflow GitHub `push-notifications.yml` resta disponibile solo per avvii manuali diagnostici: la precedente pianificazione GitHub ha mostrato intervalli reali di oltre cinque ore. Il controllo rimane periodico e dipende dalla disponibilità dei servizi, non è una notifica istantanea.
- La coda controlla prima gli utenti con il tentativo più vecchio. Limiti per esecuzione: selezione di 100 utenti, 40 secondi per avviare controlli, 20 secondi per utente, 60 invii e circa 65 secondi di budget complessivo per avviarli. `deferred` indica lavoro rimandato; monitorarlo prima di ampliare il numero di utenti. La frequenza effettiva per persona può diminuire se la coda cresce.
- Le credenziali Argo cifrate già salvate dall’accesso alimentano il controllo a app chiusa. Nessun account Google è richiesto. Una password cambiata o un profilo non più valido richiede un nuovo login; l’errore appare nelle impostazioni.
- L’attivazione avvia subito il primo controllo (massimo 15 secondi), senza attendere lo scheduler. Se fallisce, la registrazione resta valida e l’interfaccia indica che la preparazione è incompleta; il controllo periodico riprova. Il primo controllo per categoria prepara la base e non notifica lo storico. Ogni nuovo dispositivo salta la sua prima fotografia dei dati. Osservazione degli identificativi e creazione dei messaggi sono una transazione PostgreSQL; risposte Argo parziali non cancellano gli identificativi già visti. Non vengono riproposti elementi di anni scolastici precedenti.
- Gli identificativi degli avvisi dipendono dagli identificativi estratti da Argo: in assenza di un ID upstream, una modifica del contenuto di un voto/compito può essere interpretata come un nuovo elemento. Il servizio rileva solo elementi restituiti da Argo e le circolari presenti nella pagina letta (massimo 20), non eventi che la sorgente omette.
- Il promemoria usa scadenza domani, ora italiana anche nei cambi d’ora, esclude verifiche e compiti completati e comprende i compiti personali salvati nel planner. Le spunte fatte offline devono arrivare al server. Il conteggio viene riletto prima dell’invio e durante i tentativi successivi; niente avviso se è zero. Una ricevuta giornaliera impedisce nuovi promemoria nella stessa giornata anche dopo la scadenza del messaggio.
- La selezione della coda usa l’ora del database dopo aver registrato le novità: i messaggi appena creati vengono inviati nella stessa esecuzione. Gli invii falliti rimangono in una coda persistente con attesa crescente; quelli disattivati vengono cancellati. Un crash dopo l’accettazione del servizio push ma prima del salvataggio della ricevuta può causare un nuovo tentativo: `topic` e `tag` stabili riducono le notifiche duplicate, ma non promettono consegna esattamente una volta.
- Le notifiche scadono, non attendono settimane sul servizio del browser. Il sistema operativo, la rete, il risparmio energetico e Non disturbare possono ritardare o nascondere un avviso. La UI non sostituisce le informazioni ufficiali del registro.

## Sicurezza e struttura

`api_internal/push.js` è raggiunto attraverso `api/main.js` e una riscrittura, mantenendo il numero delle funzioni Vercel preesistenti. Configurazione pubblica VAPID, stato, registrazione, preferenze, cancellazione e prova richiedono una sessione valida. Il controllo periodico accetta `PUSH_CRON_SECRET`, dedicato alle notifiche, oppure `CRON_SECRET` per la diagnostica manuale, con confronto costante. Il primo è conservato in Vercel e in Supabase Vault; non compare nel codice o nel comando del job. Le registrazioni sono filtrate per proprietario; quote limitano registrazioni e prove; massimo 10 dispositivi per profilo.

Gli endpoint push sono limitati ai servizi HTTPS di Google, Mozilla e Apple; le chiavi P-256 vengono validate. Solo la chiave VAPID pubblica arriva al browser. La chiave privata resta sul backend. I percorsi aperti dalle notifiche sono una lista chiusa interna alla PWA.

La migrazione `202610010001_web_push.sql` crea cinque nuove tabelle `web_push_*` con RLS e accesso riservato al servizio backend, più quattro funzioni riservate. Non modifica i dati della vecchia tabella `push_subscriptions`, né i planner. Le ricevute scadute vengono eliminate dopo due giorni, gli identificativi dopo 400 giorni; lo stato di utenti senza dispositivi viene ripulito. Le sottoscrizioni del browser e i messaggi in coda sono dati privati del backend.

## Attivazione del rilascio

Il codice da solo non rende attive le notifiche. Ordine richiesto:

1. Applicare la migrazione `supabase/migrations/202610010001_web_push.sql` sul progetto Supabase usato dal backend, dopo il normale backup di rilascio. La migrazione è verificata anche con PostgreSQL locale tramite PGlite.
2. Generare una coppia VAPID una volta (`npx web-push generate-vapid-keys`) e conservarla privatamente. Configurare `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` nelle variabili del backend Vercel. `VAPID_SUBJECT` deve essere un recapito HTTPS o `mailto:` valido; esempio HTTPS nell’`.env.example`. Non pubblicare la chiave privata e non rigenerarla a ogni deploy.
3. Pubblicare backend e frontend dello stesso ramo, che include le precedenti correzioni frontend non ancora integrate in main. GitHub Pages deve servire gli asset generati e il service worker 4.3.1.
4. Applicare anche `202610030001_push_delivery.sql`. Generare un segreto casuale dedicato di almeno 32 caratteri, configurarlo come `PUSH_CRON_SECRET` su Vercel e salvarlo in Supabase Vault con nome `web_push_cron_token`. Eseguire `scripts/configure-push-scheduler.sql` sul progetto Supabase dopo il deploy del backend. Lo script abilita `pg_cron` e `pg_net`, crea un dispatcher privato con destinazione fissa e pianifica ogni 15 minuti. Non incollare il segreto in file versionati o nei comandi del job. Verificare sia `cron.job_run_details` sia la risposta HTTP correlata tramite `push_scheduler.requests` e `net._http_response`: una pianificazione riuscita da sola non dimostra un HTTP 200. Per fermarlo reversibilmente: `select cron.alter_job(jobid, active := false) from cron.job where jobname = 'gandhi-web-push';`. Il workflow GitHub rimane manuale e richiede le variabili già esistenti `VERCEL_URL` e `CRON_SECRET`.
5. Aprire l’app dal telefono, attivare nel profilo e premere «Invia una notifica di prova». Verificare un Android e un iPhone installato, anche con app chiusa; eseguire il workflow una prima volta per la base e verificare un aggiornamento successivo. Provare opt-out, cambio account e promemoria con spunte sincronizzate.

Il rilascio iniziale è stato attivato il 2 ottobre 2026. La correzione del 3 ottobre richiede la nuova migrazione e l’attivazione dello scheduler descritti sopra; la loro presenza nel codice non equivale alla pubblicazione. L’invio reale ad Android/iOS rimane da verificare dopo questi passaggi. È stata controllata la schermata del profilo a 390px con dati simulati, senza overflow orizzontale; ciò non equivale a una prova Web Push sui sistemi operativi reali.

## Verifiche automatiche

**196 test superati con Node 24.13.1**; audit delle dipendenze backend e frontend senza vulnerabilità note. `npm run build --prefix frontend` e `npm test` verificano build e suite completa. I test specifici coprono SQL reale (base silenziosa, deduplicazione, preferenze, riassegnazione e RLS), sessioni API, servizi push ammessi, chiavi, promemoria/DST, retry/410, indipendenza da Google, gesto di attivazione iOS, cambio account durante il permesso, revoca, service worker e percorsi al tocco.

Fonti: [Web Push Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [libreria web-push](https://github.com/web-push-libs/web-push), [limiti dei workflow pianificati GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Il runtime e la CI usano Node.js 24: il 1 ottobre 2026 Vercel ha rifiutato la precedente configurazione 20.x come non più supportata.

## Diagnosi del 3 ottobre 2026

Il timestamp della coda era confrontato con l’inizio del controllo, precedente agli inserimenti: nessuna novità creata durante quel giro era selezionabile. Quattro compiti risultavano in attesa senza tentativi. La pianificazione GitHub aveva intervalli di oltre cinque ore, e la prima base era stata preparata quasi cinque ore dopo l’opt-in; novità di quel periodo potevano essere scartate come storico. La correzione usa la selezione SQL con orologio del database, prepara la base all’attivazione e sposta la pianificazione su Supabase. Il profilo mostra l’ultimo controllo e segnala ritardi durante le ore di attività.

Riferimento scheduler: [documentazione Supabase](https://supabase.com/docs/guides/functions/schedule-functions). Il token di push non dà accesso alle altre API del backend.
