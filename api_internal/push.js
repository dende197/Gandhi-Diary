const {handleCors,getRequestBody,normalizeUserId,verifySessionToken}=require('../lib/helpers');
const {endpoint,database,checked,httpError,quota}=require('../lib/backend');
const push=require('../lib/web-push');
const crypto=require('crypto');
function authorizeCron(req) {
    const given=String(req.headers.authorization || '').replace(/^Bearer /,'');
    // The database scheduler gets a dedicated, push-only credential.
    const allowed=[process.env.PUSH_CRON_SECRET,process.env.CRON_SECRET].filter(Boolean);
    if(!allowed.some(expected=>Buffer.byteLength(given)===Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(given),Buffer.from(expected))))
        throw httpError(401,'Non autorizzato');
}
module.exports=endpoint(async(req,res)=>{
    if(handleCors(req,res)) return;
    const action=req.query?.op || 'status';
    if(action==='cron') {
        if(req.method!=='GET') throw httpError(405,'Metodo non consentito');
        authorizeCron(req);
        const result=await push.runCron();
        return res.status(result.failed?502:200).json({success:!result.failed,results:result});
    }
    if(!['GET','POST','PUT','DELETE'].includes(req.method)) throw httpError(405,'Metodo non consentito');
    const body=getRequestBody(req), user=normalizeUserId(req.method==='GET'?req.query?.userId:body.userId);
    if(!user || !(await verifySessionToken(req,user))) throw httpError(403,'Sessione scaduta. Accedi nuovamente.');
    const config=push.config();
    if(req.method==='GET' && action==='config') return res.json({success:true,configured:!!config,publicKey:config?.publicKey || null});
    if(!config) throw httpError(503,'Notifiche non ancora configurate sul server');
    const db=database();
    if(req.method==='GET') {
        const id=String(req.query?.deviceId||'');
        const device=id?await checked(db.from('web_push_devices').select('preferences').eq('id',id).eq('user_id',user).maybeSingle()):null;
        const poll=await checked(db.from('web_push_poll').select('last_attempt,last_success,last_error').eq('user_id',user).maybeSingle());
        return res.json({success:true,enabled:!!device,preferences:device?.preferences||push.DEFAULTS,poll});
    }
    await quota(`push:${user}`,30,60);
    if(req.method==='POST' && action==='subscribe') {
        const sub=push.validateSubscription(body.subscription), prefs=push.preferences(body.preferences||{}), id=push.digest(sub.endpoint);
        await checked(db.rpc('register_web_push',{p_id:id,p_user:user,p_session:push.digest(req.headers['x-session-token']),p_subscription:sub,p_preferences:prefs}));
        const initialized=await push.initializeUser(user);
        return res.json({success:true,deviceId:id,preferences:prefs,initialized});
    }
    const id=String(body.deviceId||'');
    if(!/^[a-f0-9]{64}$/.test(id)) throw httpError(400,'Dispositivo non valido');
    const device=await checked(db.from('web_push_devices').select('*').eq('id',id).eq('user_id',user).maybeSingle());
    if(req.method==='DELETE') {
        await checked(db.from('web_push_devices').delete().eq('id',id).eq('user_id',user));
        return res.json({success:true});
    }
    if(!device) throw httpError(404,'Attiva prima le notifiche su questo dispositivo');
    if(req.method==='PUT') {
        const prefs=push.preferences(body.preferences);
        await checked(db.from('web_push_devices').update({preferences:prefs,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',user));
        // Cancel queued notifications for categories just disabled; they must not reappear on re-enable.
        for(const category of push.CATEGORIES.filter(k=>!prefs[k]))
            await checked(db.from('web_push_outbox').delete().eq('device_id',id).eq('category',category).is('sent_at',null));
        return res.json({success:true,preferences:prefs});
    }
    if(req.method==='POST' && action==='test') {
        await quota(`push-test:${user}`,3,300);
        try { await push.send(device,{title:'Gandhi Diary',body:'Le notifiche su questo telefono funzionano.',route:'profile',category:'test'},'test',60); }
        catch(e) {
            if([404,410].includes(e.statusCode)) {
                await checked(db.from('web_push_devices').delete().eq('id',id));
                throw httpError(410,'Registrazione scaduta. Disattiva e riattiva le notifiche.');
            }
            throw httpError(502,'Invio di prova non riuscito. Riprova più tardi.');
        }
        return res.json({success:true});
    }
    throw httpError(404,'Operazione sconosciuta');
});
