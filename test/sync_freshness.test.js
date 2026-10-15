const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,fakeDb,request,response}=require('./support/backend');
const backend=require('../lib/backend');

test('a one-minute circular poll revalidates upstream while simultaneous reads reuse the short cache',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-14T21:00:00Z')});
 let cache=null,reads=0;
 const circulars=load('api_internal/circolari/index.js',{
  fs:{existsSync:()=>!!cache,readFileSync:()=>cache,writeFileSync:(_,data)=>{cache=data;}},
  axios:{get:async()=>{reads++;return {data:`<div class="card-wrapper"><h3 class="card-title"><a href="https://school.example/${reads}">Circolare n. ${reads}</a></h3><div class="category-date">14 ottobre 2026</div></div>`};}}
 });
 const one=await circulars.fetchCircolari();
 t.mock.timers.tick(30000);const two=await circulars.fetchCircolari();
 assert.equal(one[0].id,two[0].id);assert.equal(reads,1);
 t.mock.timers.tick(30000);const three=await circulars.fetchCircolari();
 assert.notEqual(one[0].id,three[0].id);assert.equal(reads,2);
 const out=response();await circulars(request({}, {}, 'GET'),out);
 assert.equal(out.headers['Cache-Control'],'no-store');
});
test('one-minute register polls get fresh data without another password login, while a cached response retains its original sync time',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-14T21:00:00Z')});
 const user='p:school:alice:0';let snapshot=null,reads=0;
 const row={user_id:user,argo_school_code:'school',argo_username:'alice',profile_index:0,
  argo_access_token:'valid-access',argo_auth_token:'valid-auth',argo_id_soggetto:'student',
  argo_tokens_expiry:new Date(Date.now()+3600000).toISOString()};
 const db=fakeDb(c=>{
  if(c.table==='google_tokens'&&c.op==='select')return {data:{...row}};
  if(c.table==='google_tokens'&&c.op==='update')Object.assign(row,c.payload);
  if(c.table==='argo_snapshots'){
   if(c.op==='upsert')snapshot={...c.payload};
   return {data:snapshot};
  }
  return {data:null};
 });
 const service=load('lib/argo-session.js',{
  './backend':{...backend,database:()=>db,withLease:async(_,fn)=>fn()},
  './argo':{getDashboard:async()=>({revision:++reads}),AdvancedArgo:{rawLogin:()=>assert.fail('Valid tokens must be reused')}}
 });
 const first=await service.loadArgoDashboard(user);
 t.mock.timers.tick(30000);const cached=await service.loadArgoDashboard(user);
 assert.equal(reads,1);assert.equal(cached.row.last_argo_sync,first.row.last_argo_sync);
 t.mock.timers.tick(30000);const next=await service.loadArgoDashboard(user);
 assert.equal(reads,2);assert.equal(next.dashboard.revision,2);
 assert.notEqual(next.row.last_argo_sync,first.row.last_argo_sync);
 const forced=await service.loadArgoDashboard(user,{force:true});
 assert.equal(reads,3);assert.equal(forced.dashboard.revision,3,'manual refresh must bypass even a just-written snapshot');
});

test('sync route forwards an explicit manual force only after identity and session checks',async()=>{
 const calls=[];const user='p:school:alice:0';
 const handler=load('api_internal/sync.js',{
  '../lib/helpers':{...require('../lib/helpers'),verifySessionToken:async req=>req.headers['x-session-token']==='valid'},
  '../lib/backend':{...backend,database:()=>fakeDb(()=>({data:null}))},
  '../lib/argo-session':{...require('../lib/argo-session'),loadArgoDashboard:async(id,options)=>{calls.push({id,...options});return {row:{},dashboard:{}};}}
 });
 for(const force of [true,false,'true']){
  const out=response();await handler({...request({schoolCode:'school',username:'alice',userId:user,force}),headers:{'x-session-token':'valid'}},out);
  assert.equal(out.code,200);assert.equal(calls.at(-1).force,force===true);
 }
 const denied=response();await handler(request({schoolCode:'school',username:'alice',userId:user,force:true}),denied);
 assert.equal(denied.code,403);assert.equal(calls.length,3);
});
