const {test}=require('node:test');
const assert=require('node:assert/strict'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const {PGlite}=require('@electric-sql/pglite');
const push=require('../lib/web-push');
const {load,fakeDb,response,request}=require('./support/backend');
const checked=async query=>{const {data,error}=await query;if(error)throw error;return data;};
function subscription(endpoint='https://fcm.googleapis.com/fcm/send/synthetic') {
 const ec=crypto.createECDH('prime256v1');ec.generateKeys();
 return {endpoint,keys:{auth:crypto.randomBytes(16).toString('base64url'),p256dh:ec.getPublicKey().toString('base64url')}};
}
test('push validates endpoints and cryptographic subscription keys without allowing arbitrary requests',()=>{
 assert.equal(push.validateSubscription(subscription()).endpoint,'https://fcm.googleapis.com/fcm/send/synthetic');
 for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.invalid/a','https://user:password@fcm.googleapis.com/a','https://web.push.apple.com:444/a','https://evil.push.apple.com.evil.invalid/a'])
  assert.throws(()=>push.validateSubscription(subscription(endpoint)),/supportato/);
 for(const endpoint of ['https://web.push.apple.com/a','https://updates.push.services.mozilla.com/wpush/v2/a'])assert.ok(push.validateSubscription(subscription(endpoint)));
 const sub=subscription();sub.keys.auth='invalid';assert.throws(()=>push.validateSubscription(sub),/Chiave/);
 sub.keys.auth=crypto.randomBytes(16).toString('base64url');sub.keys.p256dh=Buffer.alloc(65).toString('base64url');assert.throws(()=>push.validateSubscription(sub),/Chiave/);
});
test('notification categories require boolean values and reminder time is bounded',()=>{
 assert.equal(push.preferences({}).reminderHour,19);
 assert.equal(push.preferences({}).showDetails,false);
 assert.equal(push.preferences({grades:false}).grades,false);
 for(const p of [{grades:'false'},{reminderHour:24},{reminderHour:'19'},{reminderHour:19.5},{showDetails:'yes'}])assert.throws(()=>push.preferences(p));
});
test('reminders count tomorrow in Rome across DST and merge done tasks and manual tasks without duplication',()=>{
 const now=new Date('2026-10-24T22:30:00Z'); // Already October 25 in Rome, DST transition night.
 assert.equal(push.tomorrowRome(now),'2026-10-26');
 const remote=[{id:'a',subject:'Matematica',text:'Esercizi',due_date:'2026-10-26'}, {id:'b',subject:'Storia',text:'Studiare',due_date:'2026-10-26'}];
 const saved=[{...remote[0],id:'legacy',done:true},{...remote[1],done:false},{id:'manual',subject:'Italiano',text:'Leggere',due_date:'2026-10-26'},{id:'exam',isExam:true,due_date:'2026-10-26'},{id:'past',due_date:'2026-10-25'}];
 assert.equal(push.pendingTomorrow(remote,{tasks:JSON.stringify(saved)},now),2);
 assert.equal(push.pendingTomorrow(remote,{tasks:[...saved,{...remote[1],done:true}]},now),1);
});
test('stable event keys survive grade edits, backfill from past school years is suppressed',()=>{
 const list=[{id:'stable',materia:'Matematica',valore:7,date:'2026-10-01'},{id:'old',date:'2025-10-01'}];
 const one=push.observation('grades',list,'Nuovo voto',v=>v.valore,'voti',new Date('2026-10-01'));
 const two=push.observation('grades',[{...list[0],valore:8}],'Nuovo voto',v=>v.valore,'voti',new Date('2026-10-01'));
 assert.equal(one.length,1);assert.equal(one[0].key,two[0].key);
});
test('database push pipeline seeds silently, deduplicates partial snapshots and isolates devices and preferences',async()=>{
 const db=new PGlite();
 try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610010001_web_push.sql'),'utf8'));
  const register=(id,user,prefs)=>db.query('SELECT register_web_push($1,$2,$3,$4,$5)',[id,user,'session',JSON.stringify(subscription()),JSON.stringify(prefs)]);
  const observe=items=>db.query('SELECT observe_web_push($1,$2,$3)',['alice','grades',JSON.stringify(items.map(key=>({key,payload:{title:key}})))]);
  const count=async()=>Number((await db.query('SELECT count(*) FROM web_push_outbox')).rows[0].count);
  await register('phone','alice',{grades:true});
  await observe(['old']);assert.equal(await count(),0);
  // Explicitly age the device, avoiding clock resolution assumptions in the test.
  await db.exec("UPDATE web_push_devices SET created_at=now()-interval '1 day'");
  await observe(['old','new']);assert.equal(await count(),1);
  await observe([]);await observe(['new','old']);assert.equal(await count(),1);
  await register('second','alice',{grades:false});
  await db.exec("UPDATE web_push_devices SET created_at=now()-interval '1 day'");
  await observe(['another']);assert.equal(await count(),2); // The disabled category on second never receives it.
  await register('new-phone','alice',{grades:true});
  await observe(['third']);assert.equal(await count(),3); // New phone silently skips its first snapshot.
  await register('phone','bob',{grades:true});assert.equal(await count(),0); // Reassignment cancels Alice's old queue.
  for(const role of ['anon','authenticated']){
   await db.exec('SET ROLE '+role);
   await assert.rejects(()=>db.query('SELECT * FROM web_push_devices'),/permission denied/);
   await assert.rejects(()=>db.query("SELECT observe_web_push('alice','grades','[]')"),/permission denied/);
   await db.exec('RESET ROLE');
  }
  await db.exec("INSERT INTO web_push_outbox(device_id,category,event_key,payload,expires_at,sent_at) VALUES('phone','reminder','today','{}',now()-interval '1 hour',now()-interval '3 hours')");
  await db.query('SELECT prune_web_push()');assert.equal(await count(),1,'same-day reminder receipt must survive expiry');
  await db.exec("DELETE FROM web_push_devices WHERE id='phone'");assert.equal(await count(),0);
 } finally {await db.close();}
});
function apiHarness(verified=true,resolve=()=>({data:null,error:null})) {
 const db=fakeDb(resolve), calls=[];
 const handler=load('api_internal/push.js',{
  '../lib/helpers':{handleCors:()=>false,getRequestBody:r=>r.body||{},normalizeUserId:x=>x,verifySessionToken:async()=>verified},
  '../lib/backend':{endpoint:h=>h,database:()=>db,checked,httpError:(status,message)=>Object.assign(new Error(message),{status}),quota:async()=>{}},
  '../lib/web-push':{...push,config:()=>({publicKey:'public'}),send:async(...args)=>calls.push(args)}
 });
 return {handler,db,calls};
}
test('push API denies unauthenticated access and server-side cron without secret',async()=>{
 const {handler,db}=apiHarness(false);
 await assert.rejects(()=>handler(request({}, {userId:'alice'},'GET'),response()),e=>e.status===403);
 await assert.rejects(()=>handler(request({}, {op:'cron'},'GET'),response()),e=>e.status===401);
 assert.equal(db.calls.length,0);
});
test('subscription registration binds the authenticated profile and disable filters by owner',async()=>{
 const {handler,db}=apiHarness();const res=response();
 await handler(request({userId:'alice',subscription:subscription()},{op:'subscribe'}),res);
 assert.equal(res.body.success,true);
 const call=db.calls.find(c=>c.table==='register_web_push');assert.equal(call.payload.p_user,'alice');assert.match(call.payload.p_session,/^[a-f0-9]{64}$/);
 await handler(request({userId:'alice',deviceId:'a'.repeat(64)},{},'DELETE'),response());
 const deletion=db.calls.find(c=>c.op==='delete');assert.ok(deletion.filters.some(f=>f[1]==='user_id'&&f[2]==='alice'));
});
test('preferences cannot modify another profile subscription',async()=>{
 const {handler}=apiHarness();
 await assert.rejects(()=>handler(request({userId:'mallory',deviceId:'b'.repeat(64),preferences:{}},{},'PUT'),response()),e=>e.status===404);
});
test('sender uses generic lockscreen content by default and caps delivery TTL',async()=>{
 let captured;
 const vapid=require('web-push').generateVAPIDKeys();
 const env={...process.env,VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,VAPID_SUBJECT:'https://example.org/contact'};
 const before={...process.env};Object.assign(process.env,env);
 try {
  const mod=load('lib/web-push.js',{'web-push':{...require('web-push'),sendNotification:async(...args)=>{captured=args;}}});
  await mod.send({subscription:subscription(),user_id:'alice',preferences:{showDetails:false}},{title:'Nuovo voto',body:'Matematica: 3',category:'grades'},'grade',60);
  assert.equal(JSON.parse(captured[1]).body,'Apri Gandhi Diary per vedere i dettagli.');assert.equal(captured[2].TTL,60);assert.equal(captured[2].timeout,8000);
 }finally{for(const k of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'])if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
});
test('delivery deletes expired endpoints, retries transient failures and cancels disabled categories',async()=>{
 const jobs=[{id:1,device_id:'gone',category:'grades',event_key:'1',payload:{category:'grades'},attempts:0,expires_at:'2099-01-01'},
 {id:2,device_id:'retry',category:'grades',event_key:'2',payload:{category:'grades'},attempts:1,expires_at:'2099-01-01'},
 {id:3,device_id:'disabled',category:'grades',event_key:'3',payload:{category:'grades'},attempts:0,expires_at:'2099-01-01'}];
 const devices={gone:{id:'gone',user_id:'alice',subscription:subscription('https://fcm.googleapis.com/fcm/send/gone'),preferences:{grades:true}},
 retry:{id:'retry',user_id:'alice',subscription:subscription('https://fcm.googleapis.com/fcm/send/retry'),preferences:{grades:true}},
 disabled:{id:'disabled',user_id:'alice',preferences:{grades:false}}};
 const db=fakeDb(c=>({data:c.table==='web_push_outbox'&&c.op==='select'?jobs:c.table==='web_push_devices'&&c.op==='select'?devices[c.filters.find(f=>f[1]==='id')[2]]:null,error:null}));
 const before={...process.env};const vapid=require('web-push').generateVAPIDKeys();Object.assign(process.env,{VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,VAPID_SUBJECT:'https://example.org'});
 try {
  const mod=load('lib/web-push.js',{
   './backend':{...require('../lib/backend'),database:()=>db,checked},
   'web-push':{...require('web-push'),sendNotification:async sub=>{throw {statusCode:sub.endpoint.endsWith('gone')?410:503};}}
  },';module.exports.deliver=deliver;');
  const result=await mod.deliver(Date.now());assert.equal(result.failed,1);
  assert.ok(db.calls.some(c=>c.table==='web_push_devices'&&c.op==='delete'&&c.filters.some(f=>f[2]==='gone')));
  assert.ok(db.calls.some(c=>c.op==='update'&&c.payload.attempts===2));
  assert.ok(db.calls.some(c=>c.table==='web_push_outbox'&&c.op==='delete'&&c.filters.some(f=>f[2]===3)));
 }finally{for(const k of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'])if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
});
test('worker polls Argo for opted-in users without any Google refresh token',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-01T10:00:00Z')});
 const db=fakeDb(c=>({data:c.table==='next_web_push_users'?[{user_id:'alice'}]:c.table==='web_push_devices'||c.table==='web_push_outbox'?[]:null,error:null}));
 const polled=[];
 const before={...process.env};const vapid=require('web-push').generateVAPIDKeys();Object.assign(process.env,{VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,VAPID_SUBJECT:'https://example.org'});
 try {
  const mod=load('lib/web-push.js',{
   './backend':{...require('../lib/backend'),database:()=>db,checked,withLease:async(k,fn)=>fn(),deadline:async fn=>fn()},
   './argo-session':{loadArgoDashboard:async user=>{polled.push(user);return {row:{},dashboard:{data:{dati:[]}}};}},
   '../api_internal/circolari/index':{fetchCircolari:async()=>[]}
  });
  const result=await mod.runCron();assert.equal(result.processed,1);assert.equal(result.failed,0);assert.deepEqual(polled,['alice']);
  assert.equal(db.calls.filter(c=>c.table==='observe_web_push').length,6);
  assert.ok(db.calls.some(c=>c.table==='web_push_poll'&&c.payload?.last_success));
 }finally{t.mock.timers.reset();for(const k of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'])if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
});
test('attendance justification or note edits do not generate a second absence alert',()=>{
 const a={id:'old',data:'2026-10-01',oraInizio:1,oraFine:4,nota:'da giustificare'};
 const b={...a,id:'new',nota:'giustificata',giustificata:true};
 const make=x=>push.observation('absences',[x],'Assenza',v=>v.nota,'home',new Date('2026-10-01'))[0];
 assert.equal(make(a).key,make(b).key);
});
test('public routing keeps push operations inside the existing serverless function',async()=>{
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../vercel.json'),'utf8'));
 assert.equal(config.rewrites.find(r=>r.source==='/api/push').destination,'/api/main?action=push');
 let forwarded=false;
 const main=load('api/main.js',{'../api_internal/push':async()=>{forwarded=true;}});
 await main(request({}, {action:'push',op:'config'},'GET'),response());assert.equal(forwarded,true);
});
