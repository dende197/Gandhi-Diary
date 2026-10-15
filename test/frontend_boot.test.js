const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,ResourceLoader,VirtualConsole}=require('../frontend/node_modules/jsdom');
const root=path.resolve(__dirname,'..');
class LocalResources extends ResourceLoader {
 fetch(url){
  const u=new URL(url);
  if(u.origin!=='https://audit.invalid')return Promise.resolve(Buffer.from(''));
  const rel=u.pathname.replace(/^\/Gandhi-Diary\//,'');
  const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return null;
  return Promise.resolve(fs.readFileSync(file));
 }
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<60;i++){if(check())return;await pause(25)}assert.ok(check(),'UI did not reach expected state');}
function app(loggedIn=false, options={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(e.type!=='css parsing')errors.push(e.message)});
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://audit.invalid/Gandhi-Diary/',runScripts:'dangerously',resources:new LocalResources(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.scroll=()=>{};w.matchMedia=()=>({matches:false,addListener(){},addEventListener(){}});w.alert=()=>{};w.confirm=()=>false;
  w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=options.fetch || (async()=>new Response(JSON.stringify({success:true,connected:false,data:[],circolari:[]}),{status:200,headers:{'Content-Type':'application/json'}}));
  options.beforeParse?.(w);
  if(loggedIn){w.localStorage.setItem('argo_session',JSON.stringify({schoolCode:'TEST',userName:'alice',studentId:'alice',sessionToken:'synthetic',name:'Alice',class:'4D'}));w.localStorage.setItem('argo_is_logged_in','true');w.localStorage.setItem('alice:user',JSON.stringify(options.cachedUser || {id:'alice',name:'Alice',class:'4D'}));w.localStorage.setItem('alice:last_sync_at',String(options.lastSync ?? Date.now()));}
 }});
 return {dom,w:dom.window,errors};
}
test('built frontend boots logged out without external libraries or live API',async()=>{
 const {dom,w,errors}=app();try{await until(()=>w.document.getElementById('app')?.textContent.includes('Accedi'));assert.equal(w.state.isLoggedIn,false);assert.deepEqual(errors,[]);}finally{dom.window.close();}
});
test('built frontend hydrates and lazy routes/dialogs load with real script order',async()=>{
 const {dom,w,errors}=app(true);try{
  await until(()=>w.state?.isLoggedIn&&w.document.getElementById('app')?.textContent.includes('QUANTO MANCA'));
  w.navigate('profile',true,true);await until(()=>w.document.getElementById('app').textContent.includes('Google Calendar'));
  w.navigate('voti',true,true);await until(()=>w.document.getElementById('app').textContent.toLowerCase().includes('media'));
  w.navigate('academic_profile',true,true);await until(()=>w.document.getElementById('studyStart'));
  assert.equal(w.document.getElementById('studyStart').value,'15:00');
  await w.showQuickAddTaskModal();await until(()=>w.document.getElementById('qs-submit-new'));
  assert.equal(w.document.getElementById('qs-submit-new').textContent.includes('Aggiungi Compito'),true);
  assert.deepEqual(errors,[]);
 }catch(error){error.message += '\nBrowser errors: '+JSON.stringify(errors)+'\nPage: '+w.document.getElementById('app').textContent.slice(0,800);throw error;}finally{dom.window.close();}
});
test('fresh login clears previous account session metadata and state',async()=>{
 const {dom,w,errors}=app(true);try{
  await until(()=>w.state?.isLoggedIn&&w.handleLoginSuccess);
  const oldSession=JSON.parse(w.localStorage.getItem('argo_session'));
  w.localStorage.setItem('argo_session',JSON.stringify({...oldSession,idSoggetto:'alice-subject',avatar:'alice-avatar',specialization:'alice-course'}));
  w.state.voti=[{id:'alice-vote',materia:'Matematica',valore:8,data:'2024-10-10'}];
  await w.handleLoginSuccess({session:{schoolCode:'SECOND',userName:'bob',profileIndex:0},student:{id:'bob',name:'Bob'},sessionToken:'synthetic-bob',tasks:[],voti:[]},'synthetic-password');
  const session=JSON.parse(w.localStorage.getItem('argo_session'));
  assert.equal(session.studentId,'bob');
  for(const key of ['idSoggetto','avatar','specialization','class'])assert.equal(session[key],undefined,key+' leaked from previous account');
  assert.equal(w.state.user.id,'bob');
  assert.equal(w.state.voti.some(v=>v.id==='alice-vote'),false);
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});

test('built app reopening a six-hour cache refreshes immediately and displays the actual server sync time',async()=>{
 let syncs=0;
 const serverTime=new Date(Date.now()-20000).toISOString();
 const {dom,w,errors}=app(true,{lastSync:Date.now()-6*3600000,fetch:async url=>{
  const sync=new URL(url).pathname==='/sync'; if(sync)syncs++;
  return new Response(JSON.stringify(sync ? {success:true,tasks:[],voti:[],promemoria:[{id:'new-notice',titolo:'Nuovo avviso'}],lastArgoSync:serverTime} : {success:true,connected:false,circolari:[]}),{status:200});
 }});
 try{
  await until(()=>syncs>0&&w.state?.promemoria?.some(p=>p.id==='new-notice'));
  assert.equal(syncs,1);
  assert.equal(Number(w.localStorage.getItem('alice:last_sync_at')),Date.parse(serverTime));
  assert.ok(Number(w.localStorage.getItem('alice:last_sync_check_at'))>Date.parse(serverTime));
  assert.equal(w.state.syncing,false);
  assert.equal(w.state.didup.connected,true);
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
test('built app shows an error after failed automatic sync without advancing last successful update',async()=>{
 const old=Date.now()-6*3600000;
 const {dom,w,errors}=app(true,{lastSync:old,fetch:async url=>new Response(JSON.stringify(
  new URL(url).pathname==='/sync' ? {success:false,error:'Unavailable'} : {success:true,connected:false,circolari:[]}
 ),{status:new URL(url).pathname==='/sync'?503:200})});
 try{
  await until(()=>w.state?.syncError);
  assert.equal(Number(w.localStorage.getItem('alice:last_sync_at')),old);
  assert.equal(w.state.syncing,false);
  w.navigate('profile',true,true);
  await until(()=>w.document.getElementById('app').textContent.includes('Ultimo aggiornamento non riuscito'));
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});

function registerReply(revision=1, id='alice') {
 return {success:true,student:{id,name:'Alice',class:'4D'},
  tasks:[{id:'argo-task',subject:'Matematica',text:'Esercizio '+revision,due_date:new Date().toISOString().slice(0,10)}],
  voti:[{id:'grade',materia:'Matematica',valore:revision+5,data:new Date().toISOString().slice(0,10)}],
  promemoria:[],activities:[],plannedActivities:[],assenzeData:{assenze:[]},verifiche:[],
  planner:{version:0,plannedTasks:{},plannedDetails:{},tasks:[],manualVerifiche:[]},
  lastArgoSync:new Date().toISOString()};
}
function timerClock() {
 let now=Date.now(), next=-1;const pending=new Map();
 return {beforeParse(w){
  w.Date.now=()=>now;
  const originalSet=w.setTimeout.bind(w), originalClear=w.clearTimeout.bind(w);
  w.setTimeout=(fn,ms,...args)=>{if(ms>=1000){const id=next--;pending.set(id,{fn:()=>fn(...args),at:now+ms});return id;}return originalSet(fn,ms,...args);};
  w.clearTimeout=id=>pending.has(id)?pending.delete(id):originalClear(id);
 }, async advance(ms){now+=ms;const due=[...pending].filter(([,v])=>v.at<=now);for(const [id,v] of due){pending.delete(id);v.fn();}await pause(100);}};
}
test('built frontend keeps polling full Argo responses and applies changed values, not just counts',async()=>{
 const clock=timerClock();let syncs=0;
 const {dom,w,errors}=app(true,{lastSync:Date.now()-3600000,beforeParse:clock.beforeParse,fetch:async url=>{
  const sync=new URL(url).pathname==='/sync';
  return new Response(JSON.stringify(sync?registerReply(++syncs):{success:true,connected:false,circolari:[]}),{status:200});
 }});
 try{
  await until(()=>syncs===1&&!w.state.syncing);
  assert.equal(w.state.tasks[0].text,'Esercizio 1');
  await clock.advance(61000);await until(()=>syncs===2&&!w.state.syncing);
  assert.equal(w.state.tasks[0].text,'Esercizio 2');
  await clock.advance(61000);await until(()=>syncs===3&&!w.state.syncing);
  assert.equal(w.state.voti[0].valore,8);
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
test('profile refresh button performs a forced request and reports failure instead of only announcing a start',async()=>{
 let requests=[];
 const {dom,w,errors}=app(true,{fetch:async(url,options)=>{
  const sync=new URL(url).pathname==='/sync';if(sync)requests.push(JSON.parse(options.body));
  return new Response(JSON.stringify(sync?{success:false,error:'Sessione scaduta. Accedi di nuovo.'}:{success:true,connected:false,circolari:[]}),{status:sync || new URL(url).pathname==='/api/auth'?403:200});
 }});
 try{
  await until(()=>w.state?.isLoggedIn);w.navigate('profile',true,true);
  await until(()=>w.document.querySelector('button[aria-label="Sincronizza"]'));
  const messages=[];w.showToast=message=>messages.push(message);
  w.document.querySelector('button[aria-label="Sincronizza"]').click();
  await until(()=>requests.length>0&&!w.state.syncing);
  assert.equal(requests[0].force,true);
  assert.ok(messages.some(m=>m.includes('Accedi di nuovo')),JSON.stringify(messages));
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});

test('legacy cached profile without an id cannot leave synchronization permanently locked',async()=>{
 let syncs=0;const clock=timerClock();
 const {dom,w}=app(true,{lastSync:Date.now()-3600000,cachedUser:{name:'Alice'},beforeParse:clock.beforeParse,fetch:async url=>{
  const sync=new URL(url).pathname==='/sync';
  return new Response(JSON.stringify(sync?registerReply(++syncs):{success:true,connected:false,circolari:[]}),{status:200});
 }});
 try{
  await until(()=>syncs===1);await pause(100);
  assert.equal(w.state.syncing,false,'successful response must release its lock');
  await clock.advance(61000);await until(()=>syncs===2);
 }finally{dom.window.close();}
});
test('automatic Argo sync refreshes an expired app session and retries with the new token',async()=>{
 let calls=0,refreshes=0;
 const {dom,w,errors}=app(true,{lastSync:Date.now()-3600000,fetch:async(url,options)=>{
  const u=new URL(url);
  if(u.pathname==='/sync'){
   calls++;
   if(calls===1)return new Response(JSON.stringify({success:false,error:'Non autorizzato'}),{status:403});
   assert.equal(options.headers['x-session-token'],'renewed-token');
   return new Response(JSON.stringify(registerReply(2)),{status:200});
  }
  if(u.pathname==='/api/auth'&&u.searchParams.get('action')==='refresh-session'){
   refreshes++;return new Response(JSON.stringify({success:true,student:{id:'alice'},sessionToken:'renewed-token',session:{schoolCode:'TEST',userName:'alice',profileIndex:0}}),{status:200});
  }
  return new Response(JSON.stringify({success:true,connected:false,circolari:[]}),{status:200});
 }});
 try{
  await until(()=>calls===2&&!w.state.syncing);
  assert.equal(refreshes,1);assert.equal(w.state.tasks[0].text,'Esercizio 2');
  assert.equal(w.state.didup.connected,true);assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});

test('manual register refresh completes while Google is stalled and invalidates cached views',async()=>{
 let calls=0;
 const {dom,w,errors}=app(true,{fetch:async(url)=>{
  const u=new URL(url);
  if(u.pathname==='/sync'){calls++;return new Response(JSON.stringify(registerReply(calls)),{status:200});}
  if(u.pathname==='/api/google'&&u.searchParams.get('action')==='sync')return new Promise(()=>{});
  return new Response(JSON.stringify({success:true,connected:u.pathname==='/api/google',circolari:[]}),{status:200});
 }});
 try{
  await until(()=>w.state?.isLoggedIn&&w.runManualOwaResync);
  w.state._weeklyAgendaCacheHtml='stale';w._plannerDayContentCache='stale';
  const result=await Promise.race([w.runManualOwaResync({showBootOverlay:false}),pause(1000).then(()=>{throw Error('Google blocked Argo resync');})]);
  assert.equal(result,true);assert.equal(calls,1);
  assert.notEqual(w.state._weeklyAgendaCacheHtml,'stale');assert.equal(w._plannerDayContentCache,null);
  assert.equal(w.state.tasks[0].text,'Esercizio 1');assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});

test('AI circular summaries refresh expired sessions and ignore stale state tokens',async()=>{
 let summaries=0,refreshes=0;
 const {dom,w,errors}=app(true,{fetch:async(url,options)=>{
  const u=new URL(url);
  if(u.pathname==='/api/circolari/sintesi'){
   summaries++;
   assert.equal(options.headers['x-session-token'],summaries===1?'synthetic':'renewed-summary-token');
   return new Response(JSON.stringify(summaries===1?{success:false,error:'Sessione non valida'}:{success:true,sintesi:'Nuova sintesi'}),{status:summaries===1?403:200});
  }
  if(u.pathname==='/api/auth'&&u.searchParams.get('action')==='refresh-session'){
   refreshes++;return new Response(JSON.stringify({success:true,sessionToken:'renewed-summary-token',student:{id:'alice'}}),{status:200});
  }
  return new Response(JSON.stringify({success:true,connected:false,circolari:[]}),{status:200});
 }});
 try{
  await until(()=>w.state?.isLoggedIn);w.state.sessionToken='obsolete-token';
  w.state.circolari=[{id:'notice',link:'https://www.liceogandhi.edu.it/example'}];
  const result=await w.loadCircolareSintesi('notice',w.state.circolari[0].link);
  assert.equal(result.success,true);assert.equal(w.state.circolari[0].sintesi,'Nuova sintesi');
  assert.equal(refreshes,1);assert.equal(summaries,2);assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
test('nonrenewable summary session requests login and does not retry indefinitely',async()=>{
 let summaries=0;
 const {dom,w}=app(true,{fetch:async url=>{
  const u=new URL(url),protectedCall=u.pathname==='/api/circolari/sintesi'||u.pathname==='/api/auth';
  if(u.pathname==='/api/circolari/sintesi')summaries++;
  return new Response(JSON.stringify(protectedCall?{success:false,error:'Sessione non valida'}:{success:true,connected:false,circolari:[]}),{status:protectedCall?403:200});
 }});
 try{
  await until(()=>w.state?.isLoggedIn);
  const result=await w.loadCircolareSintesi('notice','https://www.liceogandhi.edu.it/example');
  assert.equal(result.success,false);assert.match(result.error,/Accedi di nuovo/);assert.equal(summaries,1);
 }finally{dom.window.close();}
});
test('late AI summary from a previous account cannot populate the new account',async()=>{
 let finish;
 const {dom,w}=app(true,{fetch:async url=>new URL(url).pathname==='/api/circolari/sintesi'
  ? new Promise(resolve=>{finish=resolve;})
  : new Response(JSON.stringify({success:true,connected:false,circolari:[]}),{status:200})});
 try{
  await until(()=>w.state?.isLoggedIn);
  const pending=w.loadCircolareSintesi('notice','https://www.liceogandhi.edu.it/example');
  await until(()=>finish);w.ClientRuntime.invalidate();w.state.circolari=[{id:'notice'}];
  finish(new Response(JSON.stringify({success:true,sintesi:'Old account result'}),{status:200}));
  assert.equal((await pending).success,false);assert.equal(w.state.circolari[0].sintesi,undefined);
 }finally{dom.window.close();}
});
