const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const source=fs.readFileSync(path.join(__dirname,'../push-settings.js'),'utf8');
const wait=()=>new Promise(r=>setTimeout(r,0));
async function settle(){for(let i=0;i<6;i++)await wait();}
function browser(options={}) {
 let user='alice', subscribed=0,unsubscribed=0,failDelete=false;
 const requests=[];
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{}}),unsubscribe:async()=>{unsubscribed++;return true;}};
 const registration={pushManager:{getSubscription:async()=>options.existing?sub:null,subscribe:()=>{subscribed++;return options.pending || Promise.resolve(sub);}}};
 const c={URL,TextEncoder,Uint8Array,crypto:crypto.webcrypto,atob,setTimeout,clearTimeout,console,
  isSecureContext:true,PushManager:function(){},Notification:{permission:'granted'},state:{view:'profile'},
  navigator:{userAgent:options.ios?'iPhone':'Android',platform:'Linux',serviceWorker:{ready:Promise.resolve(registration),getRegistration:async()=>registration}},
  matchMedia:()=>({matches:false}),getUserId:()=>user,API_BASE_URL:'https://backend.invalid',getSessionHeaders:()=>({'x-session-token':'test'}),scheduleRender:()=>{},
  fetchWithDeadline:async(url,opts)=>{
   requests.push({url,opts});const action=new URL(url).searchParams.get('op');
   if(opts.method==='DELETE'&&failDelete)throw Error('Offline');
   let data={success:true};
   if(action==='config')data={...data,configured:true,publicKey:Buffer.alloc(65).toString('base64url')};
   if(action==='status')data={...data,enabled:!!options.existing,preferences:{grades:false,reminderHour:20},poll:options.poll};
   if(action==='subscribe')data={...data,deviceId:'a'.repeat(64),initialized:options.initialized};
   if(action==='preferences')data={...data,preferences:JSON.parse(opts.body).preferences};
   return {ok:true,json:async()=>data};
  }};
 if(options.now)c.Date=class extends Date{constructor(...args){super(...(args.length?args:[options.now]));}static now(){return new Date(options.now).getTime();}};
 c.window=c;vm.runInNewContext(source,c);
 return {c,requests,setUser(v){user=v;},failDelete(){failDelete=true;},get subscribed(){return subscribed;},get unsubscribed(){return unsubscribed;}};
}
test('iPhone outside Home Screen shows installation instructions without requesting permission',async()=>{
 const b=browser({ios:true});const html=b.c.PushSettings.render();await settle();
 assert.match(html,/Aggiungi alla schermata Home/);assert.equal(b.requests.length,0);assert.equal(b.subscribed,0);
});
test('settings initialize without prompting, then subscribe synchronously on explicit enable',async()=>{
 const b=browser();b.c.PushSettings.render();await settle();assert.equal(b.subscribed,0);
 const enabling=b.c.PushSettings.enable();assert.equal(b.subscribed,1,'subscribe must run within the user gesture');await enabling;
 assert.match(b.c.PushSettings.render(),/Disattiva notifiche/);
 assert.equal(JSON.parse(b.requests.find(r=>r.opts.method==='POST').opts.body).userId,'alice');
});
test('failed opt-out never displays success and successful opt-out removes server registration and browser subscription',async()=>{
 const b=browser({existing:true});b.c.PushSettings.render();await settle();b.failDelete();await b.c.PushSettings.disable();
 assert.match(b.c.PushSettings.render(),/Disattiva notifiche/);assert.equal(b.unsubscribed,0);
 const second=browser({existing:true});second.c.PushSettings.render();await settle();await second.c.PushSettings.disable();
 assert.match(second.c.PushSettings.render(),/Notifiche disattivate/);assert.equal(second.unsubscribed,1);
});
test('category changes preserve all the other preferences',async()=>{
 const b=browser({existing:true});b.c.PushSettings.render();await settle();await b.c.PushSettings.save('homework',false);
 const p=JSON.parse(b.requests.find(r=>r.opts.method==='PUT').opts.body).preferences;
 assert.equal(p.grades,false);assert.equal(p.reminderHour,20);assert.equal(p.homework,false);assert.equal(p.reminder,true);
});
test('switching profile while subscription prompt is pending cannot register the new profile',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r), b=browser({pending});b.c.PushSettings.render();await settle();
 const enabling=b.c.PushSettings.enable();b.setUser('bob');let removed=false;
 resolve({unsubscribe:async()=>{removed=true;return true;}});await enabling;
 assert.equal(removed,true);assert.equal(b.requests.filter(r=>r.opts.method==='POST').length,0);
});
test('logout unsubscribes even when the server registration cannot be removed',async()=>{
 const b=browser({existing:true});b.c.PushSettings.render();await settle();b.failDelete();await b.c.PushSettings.detach();assert.equal(b.unsubscribed,1);
});
test('profile distinguishes successful device registration from a delayed background check',async()=>{
 const b=browser({existing:true,now:'2026-10-03T12:00:00Z',poll:{last_success:'2026-10-03T06:00:00Z'}});
 b.c.PushSettings.render();await settle();
 const html=b.c.PushSettings.render();assert.match(html,/Ultimo controllo delle novità/);assert.match(html,/è in ritardo/);assert.match(html,/verifica solo la ricezione/);
 const night=browser({existing:true,now:'2026-10-03T22:00:00Z',poll:{last_success:'2026-10-03T18:00:00Z'}});
 night.c.PushSettings.render();await settle();assert.doesNotMatch(night.c.PushSettings.render(),/è in ritardo/);
 const fresh=browser({initialized:true});fresh.c.PushSettings.render();await settle();await fresh.c.PushSettings.enable();assert.match(fresh.c.PushSettings.render(),/Base iniziale preparata/);
 const pending=browser({initialized:false});pending.c.PushSettings.render();await settle();await pending.c.PushSettings.enable();assert.match(pending.c.PushSettings.render(),/primo controllo non è ancora completo/);
});
function worker() {
 const events={},notifications=[],opened=[];let windowClient=null;
 const c={URL,Set,console,self:{registration:{scope:'https://example.org/Gandhi-Diary/',showNotification:async(...args)=>notifications.push(args)},location:{origin:'https://example.org'},
 addEventListener:(name,fn)=>events[name]=fn,clients:{matchAll:async()=>windowClient?[windowClient]:[],openWindow:async url=>opened.push(url)}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8'),c);
 return {events,notifications,opened,setClient(v){windowClient=v;}};
}
test('service worker displays push and routes clicks safely within Pages scope',async()=>{
 const w=worker();let completion;
 w.events.push({data:{json:()=>({title:'Nuovo voto',body:'Apri il diario',route:'voti',tag:'grade-1'})},waitUntil:p=>completion=p});await completion;
 assert.equal(w.notifications[0][0],'Nuovo voto');assert.equal(w.notifications[0][1].data.route,'voti');
 w.events.notificationclick({notification:{close(){},data:{route:'https://evil.invalid'}},waitUntil:p=>completion=p});await completion;
 assert.equal(w.opened[0],'https://example.org/Gandhi-Diary/#home');
 let navigated,focused=false;w.setClient({url:'https://example.org/Gandhi-Diary/',navigate:async url=>navigated=url,focus:async()=>focused=true});
 w.events.notificationclick({notification:{close(){},data:{route:'planner'}},waitUntil:p=>completion=p});await completion;
 assert.equal(navigated,'https://example.org/Gandhi-Diary/#planner');assert.equal(focused,true);assert.equal(w.opened.length,1);
});
test('malformed push payload still produces a visible notification',async()=>{
 const w=worker();let done;w.events.push({data:{json(){throw Error('bad json')}},waitUntil:p=>done=p});await done;
 assert.equal(w.notifications[0][0],'Gandhi Diary');assert.ok(w.notifications[0][1].body);
});
