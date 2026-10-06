# Scacco matto: preparazione accesso Argo

Stato al 6 ottobre 2026: **preparazione tecnica, non integrazione SPID/CIE operativa**.
Il ramo mantiene l'accesso esistente. Nessuna modifica di produzione o database
è necessaria per questa fase. Non esiste una scadenza automatica il 31 ottobre.

## Decisione e dipendenza esterna

L'utente non dispone della circolare; riferisce una comunicazione ai docenti che
potrebbe riguardare soltanto i genitori. Non è confermata la dismissione degli
account studente. Prima di un cambio globale serve il testo applicabile alle
diverse utenze della scuola. Se gli studenti conservano le credenziali, mantenere
quel percorso è la soluzione con il minor impatto, entro le condizioni del fornitore.

La strada da verificare per SPID/CIE è un collegamento Argo autorizzato, che
deleghi alla PWA l'accesso ai dati didattici dell'utente. Una propria adesione
SPID/CIE verifica un'identità ma non concede di per sé accesso al registro Argo.
Le fonti ufficiali consultate e la richiesta da inoltrare sono in
[scacco-matto-provider-request.md](scacco-matto-provider-request.md).
Non sono stati trovati un contratto pubblico di queste API, una registrazione
client accessibile alla PWA o una politica di rinnovo applicabile. Questo resta
un requisito esterno da chiarire, non un dettaglio risolvibile inventando endpoint.

## Modifiche di questa fase

- `lib/argo-credentials.js` isola il flusso password preesistente dal codice di
  lettura del registro. Il client e il callback dell'app ufficiale sono conservati
  solo per non cambiare il comportamento esistente; non costituiscono un client
  federato autorizzato per Gandhi Diary. Non estendere questo flusso a SPID/CIE.
- La scadenza del token usa `expires_in` della risposta Argo quando valido, con
  il limite prudenziale preesistente di sei ore. In sua assenza resta il vecchio
  limite. Non si deducono durate o autorizzazioni da un JWT non verificato.
- `ARGO_LEGACY_AUTH_ENABLED`, assente o `true`, mantiene le credenziali attive.
  Solo `false` le disabilita. Valori diversi (anche vuoti) restituiscono 503.
  Il controllo copre login, risoluzione profilo, scambio password, salvataggio
  e rinnovi in background prima della decifratura della password.
- `GET /api/auth?action=methods` espone capacità non segrete e non memorizzabili
  in cache. SPID e CIE rimangono esplicitamente indisponibili. Non esistono
  pulsanti, callback o risposte di successo che simulino un'integrazione.
- La disabilitazione riguarda l'uso delle password: non cancella dati o sessioni
  già valide. Queste possono continuare fino a scadenza/revoca; al rinnovo il
  server rifiuta le credenziali. Non è una migrazione né una revoca completa.

**Non impostare `false` in produzione adesso:** in questo ramo non è ancora
disponibile un metodo alternativo. È un controllo server preparatorio, non il
pulsante finale “scacco matto”. L'assenza di una migrazione protegge i dati attuali,
ma non rende superfluo il lavoro successivo sull'identità e sui token.

## Implementazione dopo il contratto Argo

1. Aggiungere un adapter basato sul protocollo effettivamente autorizzato e un
   client dedicato. Per OAuth/OIDC: callback HTTPS registrata, PKCE S256, stato
   monouso breve legato al browser, controllo issuer/audience/nonce quando
   applicabile; niente credenziali SPID/PIN CIE/OTP nella PWA o sul backend.
   Non usare il callback custom-scheme dell'app Argo, copiare cookie o chiedere
   all'utente di incollare token per costruire il nuovo accesso.
2. Separare la connessione Argo dall'account PWA. Conservare gli attuali `user_id`
   di planner, Google, notifiche e appartenenze. Aggiungere mapping privati per
   issuer, account/ruolo e profilo studente verificati. Collegare da una sessione
   esistente con verifica del medesimo account upstream; non unire account per
   nome/email o solo per studente (genitore e alunno possono essere distinti).
   Il PID attuale deriva da scuola, username e indice: sostituire lo username
   con un subject SPID produrrebbe account duplicati e perdita apparente dei dati.
3. Salvare i token Argo cifrati in una struttura dedicata con scadenza, revoca e
   metodo d'accesso. `google_tokens.refresh_token` appartiene a Google e non va
   riutilizzato. Gestire la rotazione dei token sotto la lease per utente e
   persistenza atomica; definire un recupero conforme al protocollo per timeout
   durante la rotazione. Non assumere supporto al rinnovo dal solo scope `offline`.
4. Distinguere sessione PWA e autorizzazione Argo. In caso di scadenza non
   rinnovabile, chiedere di ricollegare il registro mantenendo planner e dati
   locali. Segnalare dati non aggiornati e sospendere i tentativi automatici
   inutili. Senza delega rinnovabile consentita non si possono garantire notifiche
   continue ad app chiusa: il requisito va verificato prima di scegliere il flusso.
5. Aggiornare login, selezione profili, sync, refresh, collegamento Google e
   frontend: oggi richiedono username e, in alcuni percorsi, una password.
   Il nuovo percorso deve restituire solo la sessione PWA, non token upstream.
6. Affiancare i metodi soltanto dopo prove reali nell'ambiente consentito da Argo.
   Rendere la scelta visibile in base alle capacità del server; non indicare
   SPID/CIE disponibili solo perché una variabile di configurazione è presente.

## Criteri prima dell'attivazione manuale

- Ambito e data della scuola confermati, incluse utenze studente e minori.
- Client/API autorizzati e limiti operativi documentati.
- Login SPID e CIE reali su Android e iOS, ritorno alla PWA installata e browser.
- Selezione tra più profili; nessuna confusione fra genitore, alunno e fratelli.
- Planner, impostazioni Google e dispositivi push conservati sullo stesso account.
- Rinnovo dopo vera scadenza, revoca, sessione IdP scaduta, annullamento login,
  doppio callback, ripetizione/replay, timeout, due dispositivi contemporanei.
- Nuovo voto/compito/assenza rilevato con app chiusa e notifica ricevuta realmente;
  verifica promemoria e sincronizzazione Google senza password.
- Eliminazione dell'uso password verificata anche nei worker e nel frontend.
- Backup verificato, procedura di rollback conforme a ciò che la scuola permette.

Solo dopo questi esiti e un comando esplicito dell'utente si pubblicherà il
passaggio finale. Non basta che sia arrivato il 31 ottobre. La cancellazione
definitiva delle password memorizzate è un'operazione distinta da valutare con
backup, token attivi e possibilità di rollback: questo ramo non cancella nulla.

Se Argo non permette un collegamento delegato, non dichiarare il requisito
risolto con scraping o token estratti. Sarà necessario concordare la continuità
delle funzioni indipendenti dal registro e un eventuale import consentito;
l'automatismo completo dipende dall'accesso ai dati concesso dal fornitore.
