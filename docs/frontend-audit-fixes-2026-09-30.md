# Correzioni dell’audit frontend — 30 settembre 2026

Le correzioni riguardano le 27 segnalazioni dell’audit sulla revisione `35aac916`. Il comportamento viene verificato con dati sintetici, rete simulata e caricamento dei file di produzione nell’ordine dell’HTML. Nessun dato reale viene usato nei test.

## Comportamento corretto

| Audit | Correzione |
|---|---|
| F01 | Le attività personali sopravvivono all’avvio e alla sincronizzazione. Il planner conserva `tasks`; le verifiche usano l’API dedicata. Pianificare un compito Argo conserva il suo ID. |
| F02 | Lo stato `done` viene inviato con i compiti e ripristinato dal planner remoto; il successivo aggiornamento Argo lo conserva. |
| F03 | Il nome locale cambia solo dopo una risposta valida. La modifica del nome non invia più `avatar: null`. |
| F04 | Il rendering non considera più il semplice numero degli elementi come prova che i dati siano invariati. |
| F05 | La sincronizzazione restituisce un esito esplicito. Un fallimento non genera una conferma; lo stato offline deriva dalla disponibilità della rete. |
| F06 | Il diario dell’umore è separato per identità stabile, anche in memoria. I vecchi dati globali senza proprietario verificabile non vengono assegnati automaticamente. |
| F07 | Cache di classe e preferenze relative alla classe sono separate per profilo; rappresentanti/proposte includono anche scuola e anno scolastico. |
| F08 | Una proposta compare tra i dati salvati soltanto dopo la conferma del server. |
| F09 | Il completamento dei compiti e la sincronizzazione Google ricevono l’evento esplicitamente; gli altri usi opzionali sono protetti. |
| F10 | Il ritorno Google viene letto dalla query dell’URL e conserva il percorso di pubblicazione dell’app. |
| F11 | Date assenti o impossibili restano non valide; la serializzazione delle date usa il giorno locale. |
| F12 | La cache HTML dell’agenda conserva una sola coppia chiave/contenuto in memoria e si invalida quando cambia il filtro. |
| F13 | Un’azione usa un solo percorso di salvataggio remoto. La bozza viene conservata subito, prima del ritardo che raggruppa le richieste. |
| F14 | I caratteri che possono interrompere attributi HTML vengono codificati mantenendo il valore JavaScript. L’apertura del collegamento della circolare accetta solo HTTP/HTTPS. |
| F15 | Il gesto indietro dalla materia usa `activeSubject`, come la navigazione. |
| F16 | Una risorsa statica mancante offline riceve un errore esplicito, non il documento HTML. |
| F17 | Errori HTTP e contenuti incompatibili non sostituiscono file JavaScript/CSS validi nella cache. |
| F18 | Le chiavi locali usano `studentId`; la migrazione copia una vecchia cache soltanto se il suo utente coincide, senza cancellare l’originale. |
| F19 | Le operazioni asincrone verificano identità e generazione della sessione. Login/logout invalidano le richieste precedenti; il cambio profilo riparte da uno stato pulito e non eredita campi della sessione precedente. Un login superato da un altro accesso non avvia ulteriori operazioni. |
| F20 | Un errore nel controllo Google mantiene l’ultima informazione confermata e indica che lo stato va verificato. |
| F21 | Rimane un solo selettore del tipo di verifica, coerente con i pulsanti del modulo. |
| F22 | Gli URL delle librerie di icone e dei font corrispondono al precaricamento; le librerie hanno versioni fissate. |
| F23 | Un solo coordinatore pianifica i ridisegni; una sospensione al ritorno nell’app termina con un nuovo aggiornamento. |
| F24 | Le richieste hanno una scadenza che copre anche la lettura del corpo. Le operazioni brevi usano 20 secondi; login/sync/sintesi rispettano il limite server di 120 secondi con un margine di 5 secondi. La bozza rimane recuperabile dopo un errore. |
| F25 | Il profilo accademico inizializza e salva disponibilità e materie difficili per profilo, con validazione dell’intervallo orario. |
| F26 | Zero ore di assenza resta zero. Il frontend non inventa ore quando il totale manca e non assume un monte ore annuo di 990 ore. |
| F27 | Le scadenze scolastiche vengono impostate nel pannello del calendario per profilo e anno. Non vengono mostrate date ufficiali non verificate; il progresso richiede inizio e fine lezioni configurati. |

Ulteriori protezioni: la pulizia dei dati demo riconosce solo identificativi espliciti, non testi dei voti o combinazioni di totali che potrebbero appartenere a dati reali. Le bozze del planner sopravvivono anche a una chiusura durante il raggruppamento dei salvataggi. Le animazioni non impediscono il rendering se la libreria esterna non è disponibile.

## Caricamento e manutenzione

- CSS Tailwind generato prima della pubblicazione; eliminata la compilazione nel browser.
- Viste secondarie e finestre principali caricate su richiesta. Il service worker prova a prepararle per l’uso offline senza rendere il loro download requisito dell’installazione.
- Unica implementazione del rendering; rimosse le sovrascritture del coordinatore nei due moduli di animazione.
- Rimossi il timer dell’orologio non presente, il vecchio Pomodoro incompleto e gli helper Supabase/password inutilizzati. Il motore demo resta disponibile per i test ma non viene caricato in produzione.
- Eliminata la richiesta duplicata del font e il caricamento dell’SDK Supabase inutilizzato. Le famiglie di icone ancora usate dai template sono conservate.
- Cache dell’agenda limitata e sincronizzazione al focus soggetta all’intervallo minimo.
- Le icone da 512 e 1024 pixel restano disponibili per installazione/manifest, ma sono escluse dal precaricamento obbligatorio: 1.081.829 byte in meno in quella lista.

Misura locale dei JavaScript dell’app referenziati direttamente dall’HTML, esclusi librerie esterne e moduli secondari: **962.658 → 655.169 byte (-32,0%)**, oppure **207.207 → 150.028 byte** con gzip locale. Il CSS generato occupa 20.571 byte; i moduli secondari 56.703 e 26.352 byte. Non sono misurazioni dei tempi di avvio né del traffico complessivo del service worker.

## Build e verifiche

```sh
npm ci
npm ci --prefix frontend
npm run build --prefix frontend
npm test
npm audit --audit-level=high
npm audit --prefix frontend --audit-level=high
```

I file in `assets/` sono generati e versionati per GitHub Pages. Modificare i sorgenti alla radice e rigenerare, senza modificare a mano gli asset. CI verifica che la rigenerazione non produca differenze. Il build conserva i nomi globali usati dai gestori HTML; estrae le funzioni delle viste/modali tramite AST, senza riscrivere i template manualmente.

Risultato locale: **169 test superati con Node 20.20.2**, inclusi 27 controlli delle segnalazioni, test di avvio completo dei file generati, caricamento delle viste/modali, bozze, migrazione e timeout. Audit delle dipendenze: zero vulnerabilità dopo gli aggiornamenti compatibili di `brace-expansion` e `undici` nel lockfile.

## Limiti e rilascio

Non sono state applicate migrazioni al database e non sono stati modificati dati di produzione. Le preferenze accademiche e il calendario scolastico sono locali al dispositivo e al profilo; i compiti personali, le pianificazioni, le spunte e le verifiche usano invece la persistenza remota.

La verifica visiva interattiva è rimasta bloccata: la revisione automatica del browser non ha potuto autorizzare l’anteprima locale per esaurimento del limite d’uso. I test DOM non verificano l’aspetto grafico su Safari/iOS o Android. Prima del rilascio va completata quella verifica, includendo aggiornamento della PWA installata, apertura offline e layout mobile dopo la generazione del CSS statico.
