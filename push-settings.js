/* Device-scoped Web Push. Permission is requested only from the enable button. */
(function () {
    const labels={grades:'Nuovi voti',circulars:'Nuove circolari',homework:'Nuovi compiti',absences:'Assenze',late:'Ritardi',exits:'Uscite anticipate',reminder:'Compiti da completare per domani'};
    const defaults={...Object.fromEntries(Object.keys(labels).map(k=>[k,true])),reminderHour:19,showDetails:false};
    let current=null;
    const owner=()=>window.getUserId?.();
    const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const supported=()=>window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const installed=()=>navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches;
    const redraw=()=>{if(window.state?.view==='profile')window.scheduleRender?.(0);};
    const fail=(s,error)=>{s.message=error?.message||'Operazione non riuscita. Riprova.';redraw();};
    async function api(s,action,method='GET',data={}) {
        const url=new URL(`${window.API_BASE_URL}/api/push`);
        url.searchParams.set('op',action);
        if(method==='GET'){url.searchParams.set('userId',s.owner);if(s.deviceId)url.searchParams.set('deviceId',s.deviceId);}
        const response=await window.fetchWithDeadline(url.href,{method,headers:window.getSessionHeaders(),...(method==='GET'?{}:{body:JSON.stringify({userId:s.owner,deviceId:s.deviceId,...data})})});
        const result=await response.json();
        if(!response.ok||!result.success)throw new Error(result.error||'Servizio notifiche non disponibile.');
        if(s!==current||owner()!==s.owner)throw new Error('Il profilo è cambiato. Riapri le impostazioni.');
        return result;
    }
    async function endpointId(subscription) {
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(subscription.endpoint)))).map(n=>n.toString(16).padStart(2,'0')).join('');
    }
    function publicKey(value) {
        const bytes=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(bytes,c=>c.charCodeAt(0));
    }
    async function initialize(s) {
        if(!supported()||(ios()&&!installed())){s.loading=false;return;}
        try {
            const config=await api(s,'config');
            if(!config.configured)throw new Error('Le notifiche saranno disponibili dopo l’attivazione del servizio sul server.');
            s.key=config.publicKey;
            // Do not leave the profile loading forever if registration has failed.
            s.registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{s.timer=setTimeout(()=>reject(new Error('Riavvia l’app per completare l’aggiornamento delle notifiche.')),10000);})]);
            clearTimeout(s.timer);
            s.subscription=await s.registration.pushManager.getSubscription();
            if(s.subscription)s.deviceId=await endpointId(s.subscription);
            const result=await api(s,'status');
            s.enabled=!!result.enabled;
            if(s.enabled && Notification.permission!=='granted')s.message='Registrazione presente, ma le notifiche sono bloccate dal telefono. Puoi disattivarla qui sotto.';
            s.preferences={...defaults,...result.preferences};s.poll=result.poll;s.ready=true;
        } catch(e){if(s===current)fail(s,e);} finally {clearTimeout(s.timer);s.loading=false;if(s===current)redraw();}
    }
    function getState() {
        if(!current||current.owner!==owner()) {
            current={owner:owner(),loading:true,enabled:false,ready:false,busy:false,preferences:{...defaults},message:''};
            initialize(current);
        }
        return current;
    }
    async function enable() {
        const s=getState();if(s.busy||!s.ready)return;
        s.busy=true;s.message='';
        // subscribe() is invoked synchronously in the click handler, including on iOS.
        let subscriptionPromise;
        try { subscriptionPromise=s.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey(s.key)}); }
        catch(e){s.busy=false;fail(s,e);return;}
        redraw();
        try {
            const subscription=await subscriptionPromise;
            if(s!==current||owner()!==s.owner){await subscription.unsubscribe();return;}
            s.subscription=subscription;s.deviceId=await endpointId(subscription);
            const result=await api(s,'subscribe','POST',{subscription:subscription.toJSON(),preferences:s.preferences});
            s.deviceId=result.deviceId;s.enabled=true;s.message='Notifiche attive. Il primo controllo prepara le novità senza inviare lo storico.';
        } catch(e){fail(s,Notification.permission==='denied'?new Error('Notifiche bloccate. Consenti le notifiche nelle impostazioni del telefono o del browser.'):e);}
        finally {s.busy=false;redraw();}
    }
    async function disable() {
        const s=getState();if(s.busy)return;s.busy=true;redraw();
        try {
            if(s.deviceId)await api(s,'device','DELETE');
            s.enabled=false;
            if(s.subscription && !(await s.subscription.unsubscribe()))throw new Error('Invio disattivato. Riprova per rimuovere anche il permesso del browser.');
            s.subscription=null;s.deviceId=null;s.message='Notifiche disattivate su questo telefono.';
        }catch(e){fail(s,e);}finally{s.busy=false;redraw();}
    }
    async function save(key,value) {
        const s=getState();if(s.busy||!s.enabled)return;s.busy=true;redraw();
        try {const result=await api(s,'preferences','PUT',{preferences:{...s.preferences,[key]:value}});s.preferences=result.preferences;s.message='Preferenze salvate.';}
        catch(e){fail(s,e);}finally{s.busy=false;redraw();}
    }
    async function test() {
        const s=getState();if(s.busy||!s.enabled)return;s.busy=true;redraw();
        try {await api(s,'test','POST');s.message='Notifica di prova inviata.';}catch(e){fail(s,e);}finally{s.busy=false;redraw();}
    }
    async function beforeLogin(nextOwner) {
        if (owner() && owner() !== 'guest' && owner() === nextOwner) { current=null; return; }
        await detach();
    }
    async function detach() {
        // Unsubscribe even if the server session has expired; this stops delivery on a shared phone.
        if(!supported())return;
        const registration=await navigator.serviceWorker.getRegistration();
        const subscription=await registration?.pushManager.getSubscription();
        if(subscription && !(await subscription.unsubscribe()))throw new Error('Impossibile disattivare le notifiche del profilo precedente. Riprova.');
        if(subscription && owner() && owner()!=='guest') {
            const previous=current?.owner===owner()?current:{owner:owner()};
            previous.deviceId=await endpointId(subscription);
            current=previous;
            try{await api(previous,'device','DELETE');}catch{/* The push service invalidates the endpoint even if the server cannot be reached. */}
        }
        current=null;
    }
    function render() {
        const s=getState();
        let hint='Ricevi gli avvisi anche con l’app chiusa. I controlli sono periodici, dalle 7 alle 22 (ora italiana), non istantanei. Puoi disattivarli su questo telefono in qualsiasi momento.';
        if(ios()&&!installed())hint='Su iPhone: apri il sito in Safari, scegli Condividi → Aggiungi alla schermata Home, poi apri l’app da quell’icona. Richiede iOS 16.4 o successivo.';
        else if(!supported())hint='Questo browser non supporta le notifiche. Su Android usa Chrome aggiornato; su iPhone apri l’app installata nella schermata Home.';
        else if(Notification.permission==='denied')hint='Il telefono ha bloccato le notifiche. Riattivale nelle impostazioni del browser o dell’app per poterle usare.';
        const buttonStyle='min-height:44px;padding:10px 16px;border-radius:12px;border:1px solid #434653;background:#1d4ed8;color:white;font:inherit;cursor:pointer';
        const disabled=s.busy?'disabled':'';
        return `<section aria-labelledby="push-title" style="margin-bottom:20px;padding:20px;border-radius:24px;background:rgba(23,31,51,.85);border:1px solid rgba(182,196,255,.2)">
            <h2 id="push-title" style="font-size:18px;margin:0 0 10px">Notifiche sul telefono</h2>
            <p style="font-size:13px;line-height:1.5;color:#c4c5d6">${hint}</p>
            <p role="status" style="font-size:13px;color:#b6c4ff">${s.loading?'Controllo disponibilità…':escape(s.message || (s.enabled?'Attive su questo telefono':'Disattivate su questo telefono'))}</p>
            ${s.ready?`<button id="push-toggle" onclick="PushSettings.${s.enabled?'disable':'enable'}()" style="${buttonStyle}" ${disabled} ${!s.enabled&&Notification.permission==='denied'?'disabled':''}>${s.busy?'Attendi…':s.enabled?'Disattiva notifiche':'Attiva notifiche'}</button>`:!s.loading&&supported()?`<button onclick="PushSettings.retry()" style="${buttonStyle}">Ricontrolla disponibilità</button>`:''}
            ${s.enabled?`<fieldset ${disabled} style="border:0;padding:12px 0 0;margin:0"><legend style="padding-top:14px">Quali avvisi ricevere</legend>
            ${Object.entries(labels).map(([key,label])=>`<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;font-size:14px">${label}<input type="checkbox" ${s.preferences[key]?'checked':''} onchange="PushSettings.save('${key}',this.checked)" style="width:22px;height:22px;accent-color:#3b82f6"></label>`).join('')}
            <label style="display:flex;justify-content:space-between;align-items:center;min-height:48px">Promemoria dalle<select aria-label="Orario promemoria" onchange="PushSettings.save('reminderHour',Number(this.value))" style="background:#171f33;color:white;border-radius:8px">${[16,17,18,19,20,21].map(h=>`<option value="${h}" ${s.preferences.reminderHour===h?'selected':''}>${h}:00</option>`).join('')}</select></label>
            <p style="font-size:12px;color:#c4c5d6">Orario italiano. Un solo promemoria al giorno, se restano compiti per domani. Le spunte devono essere sincronizzate.</p>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;font-size:14px">Mostra dettagli di voti e compiti nelle notifiche<input type="checkbox" ${s.preferences.showDetails?'checked':''} onchange="PushSettings.save('showDetails',this.checked)" style="width:22px;height:22px"></label>
            <p style="font-size:12px;color:#c4c5d6">I dettagli possono comparire anche sullo schermo bloccato.</p>
            <button onclick="PushSettings.test()" style="${buttonStyle}">Invia una notifica di prova</button></fieldset>`:''}
            ${s.poll?.last_error?'<p style="font-size:13px;color:#ffb4ab">'+(s.poll.last_error==='LOGIN_REQUIRED'?'Accedi nuovamente ad Argo per riprendere il controllo delle novità.':'L’ultimo controllo non è riuscito del tutto. Il servizio riproverà automaticamente.')+'</p>':''}
        </section>`;
    }
    window.PushSettings={render,enable,disable,save,test,detach,beforeLogin,retry(){current=null;redraw();}};
})();
