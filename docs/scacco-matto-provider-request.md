# Richiesta di chiarimenti e integrazione Argo

Preparata il 6 ottobre 2026. **Bozza da inviare: nessun messaggio è stato inviato.**

## Messaggio per la scuola e l’assistenza Argo

**Oggetto: Accesso SPID/CIE dal 1° novembre e integrazione autorizzata della PWA Gandhi Diary**

Buongiorno,

sto sviluppando Gandhi Diary, una PWA che permette allo studente di consultare i propri dati scolastici e organizzare i compiti. Ho appreso di una comunicazione sul passaggio all’accesso tramite SPID/CIE dal 1° novembre 2026, ma non dispongo della circolare. Vorrei chiarire l’ambito del cambiamento e individuare un collegamento ufficialmente supportato al registro Argo.

**Alla scuola chiedo:**

1. Potete condividere la comunicazione applicabile alle famiglie? Il cambiamento riguarda genitori/tutori, studenti o entrambi? Sono previste modalità diverse per studenti minorenni o eccezioni all’eliminazione delle credenziali? Qual è la data effettiva per ciascuna categoria?
2. SPID e CIE sono già abilitati per queste utenze? Come deve procedere chi deve ancora attivarli o correggere l’associazione del proprio profilo? Qual è il referente per valutare un’integrazione della PWA con Argo?

**Ad Argo, eventualmente tramite il referente scolastico, chiedo:**

3. Esiste una procedura per autorizzare un’applicazione di terzi a consultare, per conto dell’utente, voti, compiti assegnati, assenze/ritardi/uscite e comunicazioni? Ci serve accesso ai dati del registro: la sola autenticazione SPID/CIE o la sola anagrafica dell’utente non sono sufficienti. Quali funzionalità sono effettivamente disponibili e quali accordi o abilitazioni sono richiesti?
4. Qual è il flusso di autenticazione e delega supportato? Se è previsto OAuth/OIDC, come si ottengono un client dedicato, le callback HTTPS autorizzate, gli endpoint e gli scope necessari? Il flusso consente sia SPID sia CIE e può essere usato da una PWA su Android e iOS?
5. È consentita la sincronizzazione dal server quando l’utente non ha l’app aperta, per inviare notifiche sui nuovi eventi? Quali sono durata dei token, scadenza per inattività e durata massima della delega? Sono disponibili rinnovo senza interazione, rotazione e revoca? Quando diventa obbligatorio ripetere l’accesso SPID/CIE?
6. Quali identificativi stabili permettono di associare in modo corretto identità autenticata, istituto, ruolo e profilo studente? Come si gestiscono genitori con più figli, utenze studente/genitore e profili preesistenti, senza duplicare o confondere gli account?
7. Sono disponibili documentazione, ambiente di prova e utenze di test, inclusi casi con più profili e accesso di minorenni? Quali limiti di chiamata, codici di errore e modalità di assistenza sono previsti?

L’obiettivo è mantenere l’accesso attuale durante la preparazione e attivare il nuovo collegamento dopo averne verificato il funzionamento. La PWA non deve raccogliere password SPID, PIN CIE o codici temporanei. Per questa richiesta non occorrono credenziali, token, documenti di identità né dati personali di studenti.

Grazie per le indicazioni e per il contatto del referente competente.

## Fonti ufficiali e limiti della verifica

- [Argo — DDL Semplificazioni e accesso tramite SPID, 19 gennaio 2026](https://supportoclienti.argosoft.it/ddl-semplificazioni-e-accesso-tramite-spid/): documenta la scelta della scuola tra accesso facoltativo ed esclusivo. Non attesta la data del 1° novembre per questo istituto.
- [Argo — Adozione delle identità digitali SPID e CIE per famiglie e studenti](https://supportoclienti.argosoft.it/adozione-delle-identita-digitali-spid-e-cie-per-laccesso-ai-servizi-offerti-alle-famiglie-e-agli-studenti-dalle-istituzioni-scolastiche/) e [guida alla gestione SPID delle utenze famiglia](https://www.argosoft.it/argox/docx/guidesintetiche/scuolanext/Gestione_SPID_Famiglia.pdf): riguardano l’abilitazione delle utenze, compresi genitori/tutori e alunni; non definiscono il calendario della singola scuola.
- [Argo — Integrazione con l’eID-Gateway del MIM](https://supportoclienti.argosoft.it/integrazione-degli-accessi-con-il-sistema-pubblico-di-identita-digitale-del-ministero-dellistruzione-e-del-merito/): descrive l’aggregazione della scuola al sistema di identità digitale. Non concede automaticamente accesso ai dati del registro a una PWA esterna.
- [Argo — Manuale Scuolanext, pagina 68](https://www.argosoft.it/argox/docx/scuolanext/preside/manualepreside.pdf): descrive un’integrazione OAuth2 con bSmart per dati anagrafici e qualifica. Non documenta API didattiche accessibili a client generici.
- [Argo — Sicurezza digitale nelle scuole, nota Assoscuola del 9 giugno 2026](https://www.argosoft.it/argonews/index.php?id=64&p=&search=): richiama l’interoperabilità documentata e autorizzata. Non è una specifica tecnica di integrazione.
- [Specifiche SPID/CIE OIDC — Token Endpoint](https://docs.italia.it/italia/spid/spid-cie-oidc-docs/it/versione-corrente/token_endpoint.html): distinguono i token per ottenere gli attributi dell’identità e l’eventuale rinnovo. Non attestano la durata dei token Argo né la possibilità di interrogare il registro in background.
- [AgID — Linee guida SPID per i minori](https://www.agid.gov.it/sites/agid/files/2024-06/linee_guida_operative_fruizione_spid_minori_0.pdf): la gestione dipende dall’età e dal servizio. L’applicazione concreta alla PWA e alle utenze scolastiche va chiarita con i soggetti competenti.

Alla data della verifica non sono stati trovati, nelle fonti pubbliche consultate, una procedura di registrazione di client didattici di terzi o una durata documentata dei relativi token Argo. Occorre una risposta del fornitore; l’assenza di documentazione trovata non dimostra che un’integrazione sia impossibile.
