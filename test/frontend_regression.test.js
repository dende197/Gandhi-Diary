// Regression tests for the frontend audit; synthetic accounts and mocked transport only.
// Only synthetic data and mocked network calls; never connects to production.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const acorn=require('../frontend/node_modules/acorn');
const {JSDOM}=require('../frontend/node_modules/jsdom');
const repo=path.resolve(__dirname,'..');
const sources={},nodes={};
for(const file of ['ui.js','app-bootstrap.js','fluidity-engine-v3.js','fluidity-boot-patch.js','service-worker.js']){
 const src=sources[file]=fs.readFileSync(path.join(repo,file),'utf8');nodes[file]=[];
 const ast=acorn.parse(src,{ecmaVersion:'latest',locations:true});
 function walk(n){if(!n||typeof n!=='object')return;if(n.type)nodes[file].push(n);for(const [k,v] of Object.entries(n))if(k!=='loc'){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}
 walk(ast);
}
function get(file,name){const candidates=nodes[file].filter(n=>n.type==='FunctionDeclaration'&&n.id?.name===name||n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.name==='window'&&n.left.property.name===name&&['FunctionExpression','ArrowFunctionExpression'].includes(n.right.type));assert.ok(candidates.length,name);const n=candidates.at(-1);return sources[file].slice(n.start,n.end)+(n.type==='AssignmentExpression'?';':'');}
function context(){
 const dom=new JSDOM('<div id="app"></div><div id="nav-container"></div><div id="modals"></div>',{url:'https://audit.invalid/Gandhi-Diary/'});
 const c={document:dom.window.document,localStorage:dom.window.localStorage,location:dom.window.location,URL,Response,Request,AbortController,AbortSignal,console:{log(){},warn(){},error(){}},state:{isLoggedIn:true,user:{id:'alice',name:'Alice'},view:'home',tasks:[],voti:[],plannedTasks:{},plannedDetails:{},manualVerifiche:[],reminders:[],didup:{}},setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},requestAnimationFrame(){return 1},cancelAnimationFrame(){},performance:{now:()=>1000},navigator:{onLine:false},showToast(...args){c.toasts.push(args)},toasts:[],alert(){},confirm:()=>false,closeModal(){},getUserId:()=>c.state.user.id,getSessionHeaders:()=>({}),lsKey:k=>c.state.user.id+':'+k,saveTasks(){},scheduleRender(){},notifyPlannerChanged(){},getLocalDateString:()=> '2026-09-29'};
 c.API_BASE_URL='';c.window=c;c.window.scrollTo=()=>{};c.addEventListener=()=>{};const ctx=vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(repo,'frontend-runtime.js'),'utf8'),ctx);return ctx;
}
function add(c,file,...names){for(const name of names)vm.runInContext(get(file,name),c);}
const test=require('node:test');
test('F01 personal tasks survive sync cleanup and exams use their own endpoint',async()=>{
 const c=context();add(c,'ui.js','applyImmediateCalendarAction');add(c,'app-bootstrap.js','isUserGeneratedTaskId','isUserGeneratedTask','purgeUserGeneratedTasksAndPlans','parseArgoDate','djb2','stableTaskId','updateTasks');
 c.saveTasks=()=>c.localStorage.setItem(c.lsKey('tasks'),JSON.stringify(c.state.tasks));
 await c.applyImmediateCalendarAction({type:'add',missing:[],subject:'Math',text:'Personal task',date:'2026-09-30'});
 const id=c.state.tasks[0].id;c.purgeUserGeneratedTasksAndPlans();c.updateTasks([]);assert.equal(c.state.tasks[0].id,id);assert.ok(c.state.plannedTasks['2026-09-30'].includes(id));
 let body;c.fetch=async(url,o)=>{assert.match(url,/manual-verifiche/);body=JSON.parse(o.body);return {ok:true,json:async()=>({success:true,data:{id:'exam-1',...body}})}};
 await c.applyImmediateCalendarAction({type:'add',missing:[],subject:'Math',text:'Exam',date:'2026-10-01',isExam:true,examType:'orale'});
 assert.equal(c.state.tasks.length,1);assert.equal(c.state.manualVerifiche[0].type,'orale');assert.equal(body.args,'Exam');
});

test('F02 completed tasks are included in remote planner payload',async()=>{
 const c=context();c.plannerSaveQueue=Promise.resolve();c.state.tasks=[{id:'t1',done:true}];c.localStorage.setItem('gc_planner_sync:alice',JSON.stringify({version:1}));let body;c.fetch=async(u,o)=>{body=JSON.parse(o.body);return {ok:true,json:async()=>({data:{version:2}})}};add(c,'app-bootstrap.js','saveTasksToSupabase');await c.saveTasksToSupabase();assert.equal(body.tasks[0].done,true);
});
test('F03 rejected profile save preserves local name',async()=>{
 const c=context();c.document.body.insertAdjacentHTML('beforeend','<input id="edit-user-name" value="New name">');c.API_BASE_URL='';c.fetch=async()=>({ok:false,status:403,json:async()=>({success:false,error:'denied'})});add(c,'ui.js','saveProfileToServer','saveProfileChanges');await c.saveProfileChanges();assert.equal(c.state.user.name,'Alice');
});
test('F04 changed content redraws even with unchanged counts',()=>{
 const c=context();c.state.view='profile';c.renderProfile=()=>c.state.user.name;c.renderNav=()=>'';
 vm.runInContext('let _lastRenderedView=null,_lastRenderedLoggedIn=null,_lastRenderedTaskCount=-1,_lastRenderedVotiCount=-1;',c);add(c,'ui.js','_renderCore');c._renderCore();c.state.user.name='New name';c._renderCore();assert.equal(c.document.getElementById('app').innerHTML,'New name');
});
test('F05 failed manual resync returns false without a success toast',async()=>{
 const c=context();c.sessionManager={load:()=>({schoolCode:'X',userName:'alice'})};c.API_BASE_URL='';c.fetch=async()=>{throw Error('offline')};c.updateLoader=()=>{};c.hideBoot=()=>{};c.appendSyncDiagnostic=()=>{};c.runSilentGoogleSync=async()=>{};c.loadCircolari=async()=>{};add(c,'app-bootstrap.js','performSync','runManualOwaResync');const result=await c.runManualOwaResync({showBootOverlay:false});assert.equal(c.state.isOffline,true);assert.equal(result,false);assert.equal(c.toasts.some(x=>x[0].includes('completato')),false);
});
test('F06 daily moods are isolated even without resetting in-memory data',()=>{
 const c=context();add(c,'ui.js','getDailyMoods','getDailyMoodForDate','setDailyMood');c.setDailyMood(0);c.state.user.id='bob';assert.equal(c.getDailyMoodForDate('2026-09-29'),null);
});
test('F07 class cache is isolated by profile',()=>{
 const c=context();add(c,'ui.js','getClassCacheKey','getClassProposalsStorageKey','getStoredClassProposals','saveStoredClassProposals');c.saveStoredClassProposals('4D',[{id:'alice-school-proposal'}]);c.state.user.id='bob-other-school';assert.equal(c.getStoredClassProposals('4D').length,0);
});
test('F08 rejected proposal is not shown as saved',async()=>{
 const c=context();c.getEffectiveUserClass=()=> '4D';c.getClassRepAuthInfo=()=>({userId:'alice',userName:'Alice',headers:{}});c.fetch=async()=>({ok:false,json:async()=>({success:false,error:'denied'})});add(c,'ui.js','getClassCacheKey','getClassProposalsStorageKey','getStoredClassProposals','saveStoredClassProposals','submitClassProposal');await c.submitClassProposal({type:'assembly',targetDate:'2026-10-01',reason:'Synthetic'});assert.equal(c.getStoredClassProposals('4D').length,0);
});
test('F09 task toggle does not require a browser-global event',()=>{const c=context();add(c,'ui.js','toggleTask');assert.doesNotThrow(()=>c.toggleTask('missing'));});
test('F10 OAuth success is read from query and preserves deployment path',()=>{const src=sources['app-bootstrap.js'];const a=src.indexOf('const oauthUrl ='),b=src.indexOf("if (typeof hideLoader",a);const c=context();c.location={href:'https://audit.invalid/Gandhi-Diary/?google=success#profile'};let target;c.history={replaceState:(x,y,url)=>target=url};vm.runInContext(src.slice(a,b),c);assert.equal(c.state.googleConnected,true);assert.equal(target,'/Gandhi-Diary/#profile');});

test('F11 missing task date remains unknown',()=>{const c=context();add(c,'app-bootstrap.js','isUserGeneratedTaskId','isUserGeneratedTask','parseArgoDate','djb2','stableTaskId','updateTasks');c.updateTasks([{id:'a',subject:'Math',text:'no date'}]);assert.equal(c.state.tasks[0].hasValidDate,false);assert.equal(c.state.tasks[0].due_date,'');});
test('F12 agenda cache invalidates when the filter changes',()=>{const c=context();add(c,'ui.js','getAgendaCacheKey','getCachedWeeklyAgendaHtml','saveWeeklyAgendaCache');c.state.agendaSearchSubject='Math';c.saveWeeklyAgendaCache('Math HTML');c.state.agendaSearchSubject='English';assert.equal(c.getCachedWeeklyAgendaHtml(),'');});
test('F13 planning toggle uses one persistence entry point',()=>{const c=context();c.event={stopPropagation(){}};let immediate=0,delayed=0;c.saveTasks=()=>immediate++;c.debouncedSavePlannerRemote=()=>delayed++;add(c,'ui.js','togglePlanDay');c.togglePlanDay('t1','2026-09-30');assert.equal(immediate,1);assert.equal(delayed,0);});
test('F14 text cannot break out of the event HTML attribute',()=>{const c=context();add(c,'ui.js','escapeJsSingleQuote');const safe=c.escapeJsSingleQuote('Math" data-audit="injected');const box=c.document.createElement('div');box.innerHTML=`<button onclick="promptSetGoal('${safe}')">x</button>`;assert.equal(box.firstChild.hasAttribute('data-audit'),false);let value;c.promptSetGoal=v=>value=v;vm.runInContext(box.firstChild.getAttribute('onclick'),c);assert.equal(value,'Math\" data-audit=\"injected');});
test('F15 edge swipe clears the actual selected subject',()=>{assert.ok(sources['fluidity-engine-v3.js'].includes('if (state.activeSubject)'));assert.ok(sources['fluidity-engine-v3.js'].includes('state.activeSubject = subjName'));const c=context(),events={};c.state.activeSubject='Math';c.state.view='voti';c.document.addEventListener=(name,fn)=>events[name]=fn;c.document.readyState='loading';c.matchMedia=()=>({matches:true});c.render=()=>{};c.navigate=()=>{};c.setTimeout=()=>1;vm.runInContext(sources['fluidity-engine-v3.js'],c);events.touchstart({touches:[{clientX:1,clientY:50}]});events.touchend({changedTouches:[{clientX:100,clientY:50}]});assert.equal(c.state.activeSubject,null);});
test('F16 missing script returns an explicit offline error',async()=>{const c=context(),events={};c.self={registration:{scope:'https://audit.invalid/Gandhi-Diary/'},location:{origin:'https://audit.invalid'},addEventListener:(n,fn)=>events[n]=fn};c.caches={match:async k=>typeof k==='string'&&k.endsWith('index.html')?new Response('<html>cached</html>',{headers:{'Content-Type':'text/html'}}):undefined};c.fetch=async()=>{throw Error('offline')};vm.runInContext(sources['service-worker.js'],c);let answer;events.fetch({request:new Request('https://audit.invalid/Gandhi-Diary/missing.js'),respondWith:p=>answer=p,waitUntil(){}});const response=await answer;assert.equal(response.headers.get('Content-Type'),'text/plain');assert.equal(response.status,504);});
test('F17 failed HTTP response preserves healthy asset cache',async()=>{const c=context(),events={};let stored=new Response('healthy javascript',{status:200,headers:{'Content-Type':'application/javascript'}}),background;c.self={registration:{scope:'https://audit.invalid/Gandhi-Diary/'},location:{origin:'https://audit.invalid'},addEventListener:(n,fn)=>events[n]=fn};c.caches={match:async()=>stored.clone(),open:async()=>({put:async(k,v)=>stored=v})};c.fetch=async()=>new Response('upstream failure',{status:503});vm.runInContext(sources['service-worker.js'],c);let answer;events.fetch({request:new Request('https://audit.invalid/Gandhi-Diary/ui.js'),respondWith:p=>answer=p,waitUntil:p=>background=p});const current=await answer;assert.equal(current.status,200);await background;assert.equal(stored.status,200);});
test('F18 local profile key remains stable when profiles reorder',()=>{const c=context();let index=0;c.sessionManager={load:()=>({schoolCode:'X',userName:'parent',profileIndex:index,studentId:'p:x:parent:0'}),isLoggedIn:()=>true};add(c,'app-bootstrap.js','getActiveProfileKey');const first=c.getActiveProfileKey();index=1;assert.equal(first,c.getActiveProfileKey());});
test('F19 old sync response is ignored after profile switch',async()=>{
 const c=context();let finish;c.fetch=()=>new Promise(resolve=>finish=resolve);c.sessionManager={load:()=>({schoolCode:'X',userName:c.state.user.id})};c.updateLoader=()=>{};c.hideBoot=()=>{};c.appendSyncDiagnostic=()=>{};c.setPersistedLastSyncAt=()=>{};c.purgeUserGeneratedTasksAndPlans=()=>{};
 add(c,'app-bootstrap.js','performSync');const running=c.performSync(null,{preserveUiState:false});c.state.user={id:'bob',name:'Bob'};finish({ok:true,json:async()=>({success:true,student:{id:'alice',name:'Alice'}})});await running;assert.equal(c.state.user.id,'bob');
});
test('F20 network failure retains last known Google link status',async()=>{
 const c=context();c.state.googleConnected=true;c.googleFetchWithAuthRetry=async()=>{throw Error('offline')};add(c,'ui.js','checkGoogleStatus');await c.checkGoogleStatus();assert.equal(c.state.googleConnected,true);assert.equal(c.state.googleStatusUnknown,true);
});
test('F21 manual exam selector highlights the selected type',()=>{
 const c=context();c.document.body.insertAdjacentHTML('beforeend','<button id="tipo-scritta" style="background:black"></button><button id="tipo-orale" style="background:white"></button>');add(c,'ui.js','selectRegistroTipo');c.selectRegistroTipo('orale');assert.equal(c._registroTipo,'orale');assert.notEqual(c.document.getElementById('tipo-scritta').style.background,'black');assert.equal(c.document.getElementById('tipo-orale').style.background,'rgb(20, 20, 20)');
});
test('F22 offline cache primes the exact pinned icon URLs',()=>{
 const c=context();c.self={registration:{scope:'https://audit.invalid/Gandhi-Diary/'},location:{origin:'https://audit.invalid'},addEventListener(){}};vm.runInContext(sources['service-worker.js']+';window.assets=EXTERNAL_ASSETS;',c);const html=new JSDOM(fs.readFileSync(path.join(repo,'index.html'),'utf8'));for(const src of [...html.window.document.querySelectorAll('script[src]')].map(e=>e.src).filter(s=>s.includes('unpkg.com')))assert.equal(c.assets.includes(src),true);
});
test('F23 focus schedules a redraw when suppression ends',()=>{
 const c=context(),events={},timers=[];let draws=0;c.navigator.serviceWorker={addEventListener(){}};c.addEventListener=(n,fn)=>events[n]=fn;c.matchMedia=()=>({matches:false});c.performance.now=()=>1000;c.setTimeout=fn=>(timers.push(fn),timers.length);c.render=()=>draws++;c.render._isV3=true;c._renderCore=()=>draws++;c.requestAnimationFrame=fn=>{fn();return 1};c.scheduleRender=()=>c.render();c.hideBoot=()=>{};c.gsapAnimateView=()=>{};vm.runInContext(sources['fluidity-boot-patch.js'],c);events.focus();c.state._forceRender=true;c.scheduleRender(0);for(const fn of timers)fn();assert.ok(draws>0);
});
test('F24 planner timeout releases queue and preserves unsaved draft',async()=>{
 const c=context();c.plannerSaveQueue=Promise.resolve();c.setTimeout=setTimeout;c.clearTimeout=clearTimeout;
 c.localStorage.setItem('gc_planner_sync:alice',JSON.stringify({version:1}));
 const deadline=c.fetchWithDeadline;c.fetchWithDeadline=(u,o)=>deadline(u,o,10);
 let signal;c.fetch=(u,o)=>new Promise((resolve,reject)=>{signal=o.signal;signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true})});
 add(c,'app-bootstrap.js','saveTasksToSupabase');await c.saveTasksToSupabase();
 assert.equal(signal.aborted,true);assert.ok(JSON.parse(c.localStorage.getItem('gc_planner_sync:alice')).draft);
});

test('F25 academic profile initializes defaults and renders',()=>{const c=context();add(c,'ui.js','escapeHtml','loadAcademicPreferences','getVotiData','renderAcademicProfile');assert.match(c.renderAcademicProfile(),/15:00/);assert.equal(c.state.difficulty.length,0);});
test('F26 absence modal respects authoritative zero',()=>{const c=context();c.ad={oreAssenzaTotali:0};c.rawAssenze=[{}];c.rawRitardi=[{}];c.rawUscite=[{}];const n=nodes['ui.js'].find(n=>n.type==='VariableDeclarator'&&n.id.name==='oreTotali');vm.runInContext('window.result='+sources['ui.js'].slice(n.init.start,n.init.end),c);assert.equal(c.result,0);});
test('F27 countdowns only use configured school dates and isolate years/profiles',()=>{
 const c=context();add(c,'ui.js','getSchoolCalendarConfig','getSchoolCalendarFields','getSchoolCountdowns');assert.equal(c.getSchoolCountdowns().milestones.length,0);
 const cfg=c.getSchoolCalendarConfig();c.localStorage.setItem(cfg.key,JSON.stringify({pasqua:`${cfg.year+1}-04-02`,fine_scuola:`${cfg.year+1}-06-10`}));
 assert.equal(c.getSchoolCountdowns().milestones[0].date.getDate(),2);c.state.user.id='bob';assert.equal(c.getSchoolCountdowns().milestones.length,0);
});
test('profile name update omits untouched avatar',async()=>{const c=context();let body;c.fetch=async(u,o)=>{body=JSON.parse(o.body);return {ok:true,json:async()=>({success:true})}};add(c,'ui.js','saveProfileToServer');await c.saveProfileToServer({name:'New name'});assert.equal(Object.hasOwn(body,'avatar'),false);assert.equal(body.name,'New name');});
test('planner draft is persisted before debounce and old timer cannot write new profile',()=>{
 const c=context();let timer,writes=0;c.setTimeout=fn=>(timer=fn,1);c.saveTasksToSupabase=()=>writes++;vm.runInContext('let _savePlannerTimer=null;',c);add(c,'app-bootstrap.js','debouncedSavePlannerRemote');c.state.tasks=[{id:'t1',done:true}];c.debouncedSavePlannerRemote();assert.equal(JSON.parse(c.localStorage.getItem('gc_planner_sync:alice')).draft.tasks[0].done,true);c.state.user.id='bob';timer();assert.equal(writes,0);
});
test('request deadline covers stalled JSON body after headers arrive',async()=>{
 const c=context();c.setTimeout=setTimeout;c.clearTimeout=clearTimeout;
 c.fetch=async(u,o)=>({ok:true,json:()=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('body timeout')),{once:true}))});
 const response=await c.fetchWithDeadline('/api/test',{},10);await assert.rejects(response.json(),/body timeout/);
});
test('logout/login generation rejects stale operations even for the same profile',()=>{const c=context();const current=c.ClientRuntime.capture();assert.equal(current(),true);c.ClientRuntime.invalidate();assert.equal(current(),false);assert.equal(c.ClientRuntime.capture()(),true);});
test('demo cleanup preserves real grades with similar text and real absence totals',()=>{
 const c=context();c.state.voti=[{id:'real',commento:'limiti notevoli'},{id:'v26-ita-1'}];c.state.assenzeData={totaleAssenze:1,totaleRitardi:1,totaleUscite:1,oreAssenzaTotali:5,daGiustificare:0};vm.runInContext(fs.readFileSync(path.join(repo,'demo-cleanup.js'),'utf8'),c);c.purgeAllDemoData(c.state);assert.equal(c.state.voti.length,1);assert.equal(c.state.assenzeData.oreAssenzaTotali,5);
});
test('stable cache migration copies verified owner only and retains recovery source',()=>{
 const c=context();c.sessionManager={load:()=>({schoolCode:'TEST',userName:'alice',profileIndex:0,studentId:'p:test:alice:0'})};
 c.localStorage.setItem('p:TEST:alice:0:user',JSON.stringify({id:'p:test:alice:0'}));c.localStorage.setItem('p:TEST:alice:0:tasks','[{"id":"manual_saved"}]');
 add(c,'app-bootstrap.js','migrateVerifiedProfileCache');c.migrateVerifiedProfileCache();assert.equal(c.localStorage.getItem('p:test:alice:0:tasks'),'[{"id":"manual_saved"}]');assert.ok(c.localStorage.getItem('p:TEST:alice:0:tasks'));
 c.sessionManager.load=()=>({schoolCode:'TEST',userName:'alice',profileIndex:0,studentId:'bob'});c.migrateVerifiedProfileCache();assert.equal(c.localStorage.getItem('bob:tasks'),null);
});
test('impossible calendar dates are invalid, including leap-year boundaries',()=>{const c=context();add(c,'app-bootstrap.js','parseArgoDate');assert.equal(Number.isNaN(c.parseArgoDate('2026-02-30').getTime()),true);assert.equal(Number.isNaN(c.parseArgoDate('29/02/2026').getTime()),true);assert.equal(c.parseArgoDate('2028-02-29').getDate(),29);});
