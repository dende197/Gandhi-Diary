const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,fakeDb,request,response}=require('./support/backend');
const backend=require('../lib/backend');
const helpers=require('../lib/helpers');

test('valid refresh credential renews the app session without requesting Argo',async()=>{
 const user='p:school:alice:0',token='ab'.repeat(32);
 const db=fakeDb(c=>({data:c.table==='profiles'?{id:user}:c.table==='google_tokens'?{argo_school_code:'SCHOOL',argo_username:'alice',profile_index:0}:null}));
 let checkedLifetime;
 const handler=load('api_internal/refresh-session.js',{
  '../lib/backend':{...backend,database:()=>db},
  '../lib/helpers':{...helpers,verifySessionToken:async(req,id,days)=>{assert.equal(id,user);checkedLifetime=days;return true;}},
  '../lib/argo-session':{loadArgoDashboard:()=>assert.fail('Argo must not be needed to renew the app session')}
 });
 const out=response();await handler(request({userId:user}),out);
 assert.equal(out.code,200);assert.equal(out.body.success,true);assert.equal(out.body.sessionToken,token);
 assert.equal(checkedLifetime,14);assert.equal(out.body.session.userName,'alice');
 const update=db.calls.find(c=>c.table==='app_sessions'&&c.op==='update');
 assert.deepEqual(Object.keys(update.payload),['expires_at'],'absolute refresh expiry must remain unchanged');
 assert.ok(update.filters.some(([op,key,value])=>op==='eq'&&key==='user_id'&&value===user));
 assert.ok(update.filters.some(([op,key])=>op==='eq'&&key==='token_hash'));
});
test('expired or revoked refresh credentials cannot renew the app session',async()=>{
 const db=fakeDb(()=>assert.fail('No reads or writes after invalid authorization'));
 const handler=load('api_internal/refresh-session.js',{
  '../lib/backend':{...backend,database:()=>db},
  '../lib/helpers':{...helpers,verifySessionToken:async()=>false}
 });
 const out=response();await handler(request({userId:'p:school:alice:0'}),out);
 assert.equal(out.code,403);assert.equal(out.body.success,false);assert.equal(db.calls.length,0);
});
