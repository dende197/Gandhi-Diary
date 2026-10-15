# Aggiornamento automatico dei dati

Correzione del 14 ottobre 2026, separata dal ramo di preparazione SPID/CIE.

La PWA considerava freschi i dati per otto ore alla riapertura e avviava il controllo periodico solo ogni ora. Una sessione delle 17:45 poteva quindi ripartire alle 23 mostrando ancora gli stessi dati senza controllare subito Argo. Le circolari non facevano parte del ciclo automatico e i promemoria ricevuti dal backend non venivano applicati allo stato del frontend.

Il nuovo ciclo controlla Argo e circolari ogni 60 secondi mentre la pagina è visibile e online. Alla riapertura, al recupero dalla cache di navigazione o al ritorno della connessione riprende automaticamente. Usa un solo timer, evita richieste sovrapposte e annulla la proprietà del ciclo al logout/cambio profilo. Le richieste di rete conservano i timeout esistenti; una risposta lenta non produce altre richieste concorrenti. Google Calendar viene controllato separatamente, al massimo ogni cinque minuti nel ciclo automatico.

Le cache backend Argo/circolari durano 45 secondi per permettere al controllo del minuto successivo di vedere dati aggiornati, continuando a riutilizzare risposte per richieste ravvicinate. Il frontend distingue l'ultimo controllo locale dall'orario reale `lastArgoSync` del backend. Una risposta dalla cache non inventa una nuova sincronizzazione Argo. Un errore conserva dati e orario precedenti e viene mostrato nel profilo. I promemoria di bacheca sono salvati e ripristinati per profilo. Gli aggiornamenti automatici non ripetono ogni minuto il toast delle assenze da giustificare.

La versione degli asset e del service worker passa a 4.3.2. Le modifiche richiedono pubblicazione del frontend e del backend. Una vecchia pagina già aperta deve caricare i nuovi script; il service worker mantiene il comportamento esistente senza riavviare forzatamente l'interfaccia durante l'uso.

## Limiti distinti

Il telefono può sospendere una PWA nascosta o chiusa: non viene promesso un timer JavaScript attivo a schermo bloccato. Il job server delle notifiche resta quello già configurato, ogni 15 minuti nella fascia 07:00–22:00, per gli utenti con dispositivi registrati. Questo intervento non modifica la pianificazione Supabase né garantisce notifiche istantanee. Cambiare quella frequenza richiede modificare anche la selezione SQL degli utenti, oltre alla pianificazione, e verificarne il funzionamento sul server.

La visibilità delle novità dipende dalla loro disponibilità nelle risposte di Argo/del sito scolastico e dalla rete. Il polling non è un webhook del registro.

## Verifica

Build degli asset riuscita e 207 test superati. Le nuove regressioni coprono intervalli di un minuto, riapertura dopo sei ore con gli script realmente generati, ciclo offline/online, eventi duplicati, richieste lente, errori Google indipendenti, logout/cambio profilo, timestamp futuri, cache backend, promemoria e conservazione dell'ultimo aggiornamento riuscito. Il test SQL preesistente delle notifiche ora distingue esplicitamente la creazione del nuovo dispositivo dall'osservazione precedente, evitando un esito variabile quando PGlite assegna lo stesso millisecondo a due istruzioni.

Riferimento browser: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API#policies_in_place_to_aid_background_page_performance

## Recupero delle sincronizzazioni bloccate (15 ottobre, 4.3.3)

Riprodotto con gli asset compilati un caso non coperto dalla verifica iniziale: un profilo locale legacy privo di `id` cambia identità apparente quando arriva `student.id` dal backend. La guardia del runtime scarta il completamento e, prima della correzione, lasciava `state.syncing` attivo per sempre. Ora l'identità iniziale proviene dalla sessione e ogni richiesta rilascia esclusivamente il proprio blocco anche se i metadati del profilo sono cambiati.

Il pulsante del profilo usa il percorso manuale con esito visibile. Il resync e il pull-refresh inviano `force: true`, che il backend applica dopo i controlli di autenticazione e identità per ignorare lo snapshot ancora fresco. Google non blocca il completamento manuale; un errore Argo non viene più trasformato in successo dal pull-refresh. Le cache HTML dell'agenda vengono invalidate all'arrivo dei dati. Gli errori sono mostrati nel profilo, compresa la richiesta di nuovo accesso quando la sessione non può essere rinnovata.

213 test superati. Le nuove verifiche esercitano gli script compilati: polling con risposte complete e modifiche a parità di numero di elementi, profilo legacy, clic sul pulsante, sessione scaduta rinnovabile, Google bloccato e invalidazione cache. Il test backend verifica il bypass esplicito dello snapshot senza bypassare l'autenticazione.

Nei log di produzione sono state osservate risposte 403 prima di un nuovo login, seguito da un `/sync` 200. Questo non dimostra da solo quale dato manchi sui telefoni: serve il confronto indicato dall'utente con il registro ufficiale. Non vengono estese le scadenze di sicurezza delle sessioni.
