# Scacco matto: preparazione accesso Argo

Stato all’8 ottobre 2026: **rinnovo delle sessioni implementato dietro un’opzione disattivata; accesso SPID/CIE alla PWA ancora da verificare e implementare**. Il ramo mantiene l’accesso esistente. Non attiva cambiamenti in produzione né una scadenza automatica il 31 ottobre. La PR rimane in bozza.

## Scenario personale e verifica necessaria

Gandhi Diary viene usata personalmente dallo sviluppatore. Il genitore accederà con la propria identità al proprio profilo genitore. L’utente non dispone della circolare: la dismissione delle credenziali dal 1° novembre potrebbe riguardare soltanto i genitori; non è confermata per gli studenti.

Argo documenta un [login esterno](https://argofamiglia.it/login-esterno/) che restituisce un codice da riportare in didUP Famiglia. La guida descrive l’accesso con scuola, username e password: **non documenta l’uso di quel codice in una PWA esterna né la combinazione con SPID/CIE**. Nella schermata ufficiale Argo è presente anche l’accesso SPID/CIE/EIDAS. Il genitore proverà più avanti il login esterno nell’app ufficiale e riferirà soltanto se appare un codice, si torna nell’app o compare un errore. Non occorre comunicare il codice in chat.

Il [documento pubblico OIDC di Argo](https://auth.portaleargo.it/.well-known/openid-configuration), consultato il 7 ottobre, pubblica il grant `refresh_token`, PKCE `S256`, gli scope `offline` e `offline_access`, e l’autenticazione token endpoint `none`. Non pubblica un `registration_endpoint`. Questo conferma capacità del server, **non il rilascio di refresh token per il client attualmente usato dalla PWA**, la loro durata o l’accessibilità della callback da una PWA.

Non è stato trovato un protocollo documentato per trasferire la sessione SPID/CIE da Argo a Gandhi Diary. Una callback destinata all’app nativa non torna automaticamente alla PWA; il codice breve della guida non va interpretato come un authorization code OAuth senza verificarne il protocollo. L’uso personale non elimina questa dipendenza tecnica. La [richiesta tecnica preparata](scacco-matto-provider-request.md) resta un’opzione per ottenere chiarimenti, non è stata inviata.

## Cosa implementa il ramo

- `lib/argo-credentials.js` isola il flusso password esistente. Conserva nel risultato interno l’eventuale refresh token restituito da Argo e il client che lo ha ottenuto. Il rinnovo accetta soltanto questo client noto, usa il token endpoint fisso, un timeout di 15 secondi e nessun redirect o cookie.
- `loadProfilesWithAccessToken` recupera i profili usando un access token, indipendentemente dal login con password. Il profilo selezionato viene cercato per identificativo esatto; non si passa silenziosamente al primo figlio.
- `argo_token_connections` conserva access token, token profilo e refresh token Argo cifrati con AES-256-GCM. La cifratura è legata all’utente e al campo; la tabella è privata, con RLS e accesso riservato al backend `service_role`. La chiave è l’attuale `ARGO_ENCRYPTION_KEY`. I campi Google non sono riutilizzati.
- Il rinnovo opera sotto la lease per utente e usa una versione diversa a ogni scrittura: un worker vecchio non può sovrascrivere una connessione più recente. I token ruotati vengono salvati **prima** di recuperare i profili. Se quel recupero fallisce temporaneamente, la richiesta successiva riparte dai token già salvati. Se Argo omette un nuovo refresh token si conserva quello precedente.
- Prima dello scambio si salva lo stato `refreshing`. In caso di interruzione, timeout ambiguo o token revocato si richiede una nuova autorizzazione invece di riutilizzare un token che potrebbe essere già stato consumato. Un timeout può quindi richiedere un nuovo login.
- Una connessione nata da credenziali può tornare al login password solo quando quel metodo è ancora abilitato. Le connessioni `interactive` previste dal modello non possono farlo. **Nessun endpoint crea oggi connessioni interactive**: il relativo flusso utente sarà implementato dopo la verifica del passaggio da Argo.
- `expires_in` limita la durata del token; resta il tetto preesistente di sei ore e il relativo fallback quando manca una durata valida. La cache dashboard può essere servita per 60 secondi; non estende la durata dell’autorizzazione Argo.
- I refresh token restano interni al backend, senza essere aggiunti alle risposte pubbliche. I vecchi campi access/auth della risposta restano per compatibilità con il frontend esistente.

## Opzioni e installazione di prova

`ARGO_LEGACY_AUTH_ENABLED` assente o `true` mantiene le credenziali attive; `false` blocca login, risoluzione profilo, scambio password, salvataggio e rinnovo tramite password. Non cancella dati, password già salvate o token ancora validi. **Non disabilitarlo ora in produzione:** manca ancora un nuovo accesso interattivo.

`ARGO_TOKEN_REFRESH_ENABLED` è `false` se assente. Con questa impostazione la nuova tabella non viene consultata né scritta e resta il comportamento attuale. Entrambe le opzioni accettano soltanto `true`/`false` minuscoli, con eventuali spazi esterni; valori diversi o vuoti restituiscono 503.

Per una verifica in ambiente di prova:

1. Applicare `supabase/migrations/202610080001_argo_token_connections.sql`.
2. Verificare `ARGO_ENCRYPTION_KEY` e impostare `ARGO_TOKEN_REFRESH_ENABLED=true`.
3. Effettuare un nuovo login: solo così si registra un nuovo grant, con il refresh token se Argo lo rilascia. Le righe precedenti non vengono convertite inventando token. Una connessione senza refresh token usa la password alla scadenza solo se la politica lo consente.
4. Verificare un vero rinnovo e una revoca senza registrare token nei log. I test automatici usano risposte simulate: non provano il rinnovo sul fornitore.

Un database o una chiave di cifratura non disponibili generano un errore esplicito, non un ritorno silenzioso alla password. Disattivare l’opzione ripristina il percorso attuale; non elimina la tabella né le connessioni cifrate. Questo rollback è valido solo finché il vecchio login è ancora utilizzabile.

## Lavoro restante prima del passaggio

1. Verificare il flusso reale del genitore e il protocollo di ritorno da Argo. Per OAuth/OIDC servono callback effettivamente accettata, PKCE, stato monouso breve e i controlli OIDC applicabili. La PWA non deve raccogliere password SPID, PIN CIE o OTP. Non sono previsti estrazione di cookie o inserimento manuale di refresh token nell’interfaccia.
2. Collegare l’identità genitore al profilo studente mantenendo gli attuali `user_id` di planner, Google e notifiche. Il PID attuale deriva da scuola, username e indice: sostituirlo con il subject SPID creerebbe un altro account. Non si possono assumere identici gli identificativi Argo di genitore e studente, né unire account soltanto per nome/email. Questa migrazione non è implementata.
3. Integrare il nuovo login in selezione profili, sessione PWA, frontend, Google e gestione della riconnessione. `GET /api/auth?action=methods` continua a dichiarare SPID e CIE indisponibili, senza pulsanti che simulano il successo.
4. Provare Android e iOS: login/annullamento, più figli, ritorno alla PWA, scadenza, revoca, due dispositivi, rinnovo e notifiche effettive ad app chiusa. Senza un grant rinnovabile non sono garantibili sincronizzazione e notifiche continue.
5. Chiarire la comunicazione della scuola e verificare il backup/rollback prima dell’attivazione manuale. Il comando “scacco matto” potrà disabilitare le credenziali solo dopo aver verificato la nuova modalità completa. Il calendario non attiva nulla automaticamente. L’eliminazione delle password memorizzate è un’operazione distinta, non eseguita da questo ramo.
