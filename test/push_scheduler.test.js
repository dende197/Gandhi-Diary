const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');

test('private scheduler uses Vault, a fixed backend URL, bounded HTTP timeout and one idempotent job',async()=>{
 const db=new PGlite();
 try {
  // Hosted extensions are represented by recording SQL functions; the dispatcher
  // itself runs unchanged, except for a fixed daytime hour to make CI deterministic.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
   CREATE TABLE public.web_push_devices(id text);
   CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
   CREATE SCHEMA net; CREATE TABLE net.calls(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb,timeout integer);
   CREATE FUNCTION net.http_get(url text,headers jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO net.calls(url,headers,timeout) VALUES(url,headers,timeout_milliseconds) RETURNING id;
   $$;
   CREATE SCHEMA cron; CREATE TABLE cron.jobs(name text PRIMARY KEY,schedule text,command text);
   CREATE FUNCTION cron.schedule(n text,s text,c text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN
    INSERT INTO cron.jobs VALUES(n,s,c) ON CONFLICT(name) DO UPDATE SET schedule=excluded.schedule,command=excluded.command;
    RETURN 1;
   END $$;`);
  const script=fs.readFileSync(path.join(__dirname,'../scripts/configure-push-scheduler.sql'),'utf8')
   .replace(/^CREATE EXTENSION.*$/gm,'')
   .replace("hour_in_rome := extract(hour FROM now() AT TIME ZONE 'Europe/Rome');",'hour_in_rome := 12;');
  await db.exec(script);await db.exec(script);
  assert.deepEqual((await db.query('SELECT * FROM cron.jobs')).rows,[{name:'gandhi-web-push',schedule:'*/15 * * * *',command:'SELECT push_scheduler.dispatch()'}]);
  assert.equal((await db.query('SELECT push_scheduler.dispatch() AS id')).rows[0].id,null);
  await db.exec("INSERT INTO public.web_push_devices VALUES('phone')");
  await assert.rejects(()=>db.query('SELECT push_scheduler.dispatch()'),/Configure web_push_cron_token/);
  const token='synthetic-test-token-not-a-real-secret';
  await db.query("INSERT INTO vault.decrypted_secrets VALUES('web_push_cron_token',$1)",[token]);
  const request=(await db.query('SELECT push_scheduler.dispatch() AS id')).rows[0].id;
  const call=(await db.query('SELECT * FROM net.calls')).rows[0];
  assert.equal(call.id,request);assert.equal(call.url,'https://g-connect-backend-r5j1.vercel.app/api/push?op=cron');
  assert.equal(call.headers.Authorization,'Bearer '+token);assert.equal(call.timeout,110000);
  assert.equal((await db.query('SELECT request_id FROM push_scheduler.requests')).rows[0].request_id,request);
  for(const role of ['anon','authenticated']) {
   await db.exec('SET ROLE '+role);
   await assert.rejects(()=>db.query('SELECT push_scheduler.dispatch()'),/permission denied/);
   await assert.rejects(()=>db.query('SELECT * FROM push_scheduler.requests'),/permission denied/);
   await db.exec('RESET ROLE');
  }
 }finally{await db.close();}
});
