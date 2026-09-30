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
function app(loggedIn=false){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(e.type!=='css parsing')errors.push(e.message)});
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://audit.invalid/Gandhi-Diary/',runScripts:'dangerously',resources:new LocalResources(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.scroll=()=>{};w.matchMedia=()=>({matches:false,addListener(){},addEventListener(){}});w.alert=()=>{};w.confirm=()=>false;
  w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=async()=>new Response(JSON.stringify({success:true,connected:false,data:[],circolari:[]}),{status:200,headers:{'Content-Type':'application/json'}});
  if(loggedIn){w.localStorage.setItem('argo_session',JSON.stringify({schoolCode:'TEST',userName:'alice',studentId:'alice',sessionToken:'synthetic',name:'Alice',class:'4D'}));w.localStorage.setItem('argo_is_logged_in','true');w.localStorage.setItem('alice:user',JSON.stringify({id:'alice',name:'Alice',class:'4D'}));w.localStorage.setItem('alice:last_sync_at',String(Date.now()));}
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
