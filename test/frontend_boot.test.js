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
  if(loggedIn){w.localStorage.setItem('argo_session',JSON.stringify({schoolCode:'TEST',userName:'alice',studentId:'alice',sessionToken:'synthetic',name:'Alice',class:'4D'}));w.localStorage.setItem('argo_is_logged_in','true');w.localStorage.setItem('alice:user',JSON.stringify({id:'alice',name:'Alice',class:'4D'}));w.localStorage.setItem('alice:last_sync_at',String(options.lastSync ?? Date.now()));}
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
