const crypto = require('crypto');
const webpush = require('web-push');
const { database, checked, httpError, todayRome, isoDate, withLease, deadline } = require('./backend');
const { parseJsonb } = require('./helpers');
const CATEGORIES = ['grades', 'circulars', 'homework', 'absences', 'late', 'exits', 'reminder'];
const DEFAULTS = Object.freeze(Object.fromEntries([...CATEGORIES.map(k => [k, true]), ['reminderHour', 19], ['showDetails', false]]));
const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
function preferences(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'Preferenze non valide');
    const result = { ...DEFAULTS };
    for (const key of [...CATEGORIES, 'showDetails']) {
        if (value[key] !== undefined && typeof value[key] !== 'boolean') throw httpError(400, 'Preferenze non valide');
        if (value[key] !== undefined) result[key] = value[key];
    }
    if (value.reminderHour !== undefined) {
        if (!Number.isInteger(value.reminderHour) || value.reminderHour < 16 || value.reminderHour > 21)
            throw httpError(400, 'Scegli un orario fra le 16 e le 21');
        result.reminderHour = value.reminderHour;
    }
    return result;
}
function validateSubscription(value) {
    let url;
    try { url = new URL(value?.endpoint); } catch { throw httpError(400, 'Dispositivo non valido'); }
    const host = url.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'web.push.apple.com' ||
        /^[a-z0-9-]+\.push\.apple\.com$/.test(host) ||
        /^(?:[a-z0-9-]+\.)?push\.services\.mozilla\.com$/.test(host);
    if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.href.length > 4096)
        throw httpError(400, 'Servizio notifiche non supportato');
    const keys = value.keys || {};
    for (const [name, size] of [['auth', 16], ['p256dh', 65]]) {
        if (typeof keys[name] !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(keys[name]) || Buffer.from(keys[name], 'base64url').length !== size)
            throw httpError(400, 'Chiave del dispositivo non valida');
    }
    try { crypto.ECDH.convertKey(Buffer.from(keys.p256dh, 'base64url'), 'prime256v1'); }
    catch { throw httpError(400, 'Chiave del dispositivo non valida'); }
    return { endpoint: url.href, keys: { auth: keys.auth, p256dh: keys.p256dh } };
}
function config() {
    const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) return null;
    try {
        const pair = crypto.createECDH('prime256v1');
        pair.setPrivateKey(Buffer.from(privateKey, 'base64url'));
        if (pair.getPublicKey().toString('base64url') !== publicKey) return null;
        webpush.generateRequestDetails({endpoint:'https://fcm.googleapis.com/fcm/send/config-check'}, null,
        {vapidDetails:{subject,publicKey,privateKey}}); }
    catch { return null; }
    return { subject, publicKey, privateKey };
}
const clean = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
function observation(category, items, title, body, route, now = new Date()) {
    const today = todayRome(now), year = Number(today.slice(0,4)) - (Number(today.slice(5,7)) < 9 ? 1 : 0);
    return items.filter(item => {
        const day = isoDate(item.date || item.data || item.assigned_date || item.dataPubblicazione);
        return !day || day >= `${year}-09-01`;
    }).map(item => ({
        key: digest(['absences','late','exits'].includes(category) ? JSON.stringify([category,item.data,item.oraInizio,item.oraFine]) : (item.id ?? JSON.stringify(item))),
        payload: { title, body: clean(body(item)), route, category }
    }));
}
function dashboardObservations(dashboard, schedule, now) {
    const argo = require('./argo');
    const attendance = argo.extractAssenzeFromDashboard(dashboard, { schedule });
    const tasks = argo.extractHomeworkFromDashboard(dashboard);
    return { tasks, observations: {
        grades: observation('grades', argo.extractGradesFromDashboard(dashboard), 'Nuovo voto', v => `${v.materia}: ${v.valore}`, 'voti', now),
        homework: observation('homework', tasks, 'Nuovo compito assegnato', t => `${t.subject}: ${t.text}`, 'planner', now),
        absences: observation('absences', attendance.assenze, 'Nuova assenza', a => `Assenza registrata il ${a.data}`, 'home', now),
        late: observation('late', attendance.ritardi, 'Nuovo ritardo', a => `Ritardo registrato il ${a.data}`, 'home', now),
        exits: observation('exits', attendance.uscite, 'Nuova uscita anticipata', a => `Uscita registrata il ${a.data}`, 'home', now)
    }};
}
function tomorrowRome(now = new Date()) {
    const d = new Date(`${todayRome(now)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0,10);
}
function pendingTomorrow(remoteTasks, planner, now = new Date()) {
    const saved = parseJsonb(planner?.tasks, []);
    const composite = t => `${t.subject}||${t.text}||${t.due_date}`;
    const local = new Map();
    for (const t of saved) { if(t.id != null) local.set(String(t.id),t); local.set(composite(t),t); }
    const all = new Map();
    for (const t of [...saved, ...remoteTasks]) {
        if (t.isExam || isoDate(t.due_date) !== tomorrowRome(now)) continue;
        const match = (t.id != null && local.get(String(t.id))) || local.get(composite(t));
        all.set(composite(t), {...t, done: match ? match.done === true : t.done === true});
    }
    return [...all.values()].filter(t => !t.done).length;
}
const romeHour = now => Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',hourCycle:'h23'}).format(now));
async function observe(user, category, items) {
    await checked(database().rpc('observe_web_push', {p_user:user,p_category:category,p_items:items}));
}
async function enqueueReminders(user, tasks, now) {
    const db = database();
    const planner = await checked(db.from('planners').select('tasks').eq('user_id',user).maybeSingle());
    const count = pendingTomorrow(tasks,planner,now);
    if (!count) return;
    const devices = await checked(db.from('web_push_devices').select('id,preferences').eq('user_id',user));
    for (const device of devices || []) {
        if (!device.preferences.reminder || romeHour(now) < device.preferences.reminderHour || romeHour(now) >= 22) continue;
        await checked(db.from('web_push_outbox').upsert({device_id:device.id,category:'reminder',event_key:todayRome(now),
            payload:{title:'Compiti per domani',body:`Per domani ti ${count === 1 ? 'manca ancora 1 compito da completare' : `mancano ancora ${count} compiti da completare`}.`,route:'planner',category:'reminder',day:todayRome(now)},
            expires_at:new Date(now.getTime()+2*3600000).toISOString()
        }, {onConflict:'device_id,category,event_key',ignoreDuplicates:true}));
    }
}
async function send(device, payload, eventKey, ttl = 3600) {
    const vapidDetails = config();
    if (!vapidDetails) throw httpError(503, 'Notifiche non ancora configurate sul server');
    // Revalidate database rows as well: a push endpoint must never become an arbitrary HTTP target.
    const sub = validateSubscription(device.subscription);
    const tag = digest(`${device.user_id}:${payload.category}:${eventKey}`).slice(0,32);
    const visible = device.preferences.showDetails || ['reminder','test'].includes(payload.category) ? payload : {...payload,body:'Apri Gandhi Diary per vedere i dettagli.'};
    return webpush.sendNotification(sub, JSON.stringify({...visible,tag}), {vapidDetails,TTL:ttl,timeout:8000,urgency:'normal',topic:tag});
}
async function deliver(started, now = new Date()) {
    const db = database();
    const rows = await checked(db.from('web_push_outbox').select('*').is('sent_at',null).lte('next_attempt',now.toISOString())
        .gt('expires_at',now.toISOString()).order('id').limit(60));
    let sent = 0, failed = 0;
    for (const job of rows || []) {
        if (Date.now()-started > 65000) break;
        const device = await checked(db.from('web_push_devices').select('*').eq('id',job.device_id).maybeSingle());
        if (!device || !device.preferences[job.category]) {
            await checked(db.from('web_push_outbox').delete().eq('id',job.id)); continue;
        }
        let payload = job.payload;
        if (job.category === 'reminder') {
            // Re-read completion state just before delivery; do not send a stale count after retry.
            const snapshot = await checked(db.from('argo_snapshots').select('payload').eq('user_id',device.user_id).maybeSingle());
            const planner = await checked(db.from('planners').select('tasks').eq('user_id',device.user_id).maybeSingle());
            const count = pendingTomorrow(require('./argo').extractHomeworkFromDashboard(snapshot?.payload),planner,now);
            if (!count || payload.day !== todayRome(now) || romeHour(now)>=22) {
                await checked(db.from('web_push_outbox').delete().eq('id',job.id)); continue;
            }
            payload = {...payload, body:`Per domani ti ${count===1?'manca ancora 1 compito':'mancano ancora '+count+' compiti'} da completare.`};
        }
        try {
            await send(device,payload,job.event_key, Math.max(0,Math.min(3600,Math.floor((new Date(job.expires_at)-now)/1000))));
            await checked(db.from('web_push_outbox').update({sent_at:new Date().toISOString()}).eq('id',job.id)); sent++;
        } catch(e) {
            if ([404,410].includes(e.statusCode)) await checked(db.from('web_push_devices').delete().eq('id',device.id));
            else {
                failed++;
                await checked(db.from('web_push_outbox').update({attempts:job.attempts+1,next_attempt:new Date(Date.now()+Math.min(3600000,60000*2**Math.min(job.attempts,6))).toISOString()}).eq('id',job.id));
            }
        }
    }
    return {sent,failed};
}
async function runCron() {
    if (!config()) throw httpError(503,'Notifiche non ancora configurate sul server');
    return withLease('cron:web-push',async()=>{
        const db = database(), started=Date.now(), now=new Date();
        await checked(db.rpc('prune_web_push'));
        if (romeHour(now)<7 || romeHour(now)>=22) return {skipped:true,reason:'nighttime'};
        let processed=0, failed=0, circulars;
        try { circulars=await require('../api_internal/circolari/index').fetchCircolari(); }
        catch { failed++; /* Do not seed or advance circulars on a failed scrape. Argo remains independent. */ }
        const users=await checked(db.rpc('next_web_push_users'));
        for(const user of users||[]) {
            if(Date.now()-started>40000) break;
            await checked(db.from('web_push_poll').update({last_attempt:new Date().toISOString()}).eq('user_id',user.user_id));
            processed++;
            try {
                await deadline(async()=>{
                    if(circulars) await observe(user.user_id,'circulars',observation('circulars',circulars,'Nuova circolare',c=>c.titolo,'circolari',now));
                    const {row,dashboard}=await require('./argo-session').loadArgoDashboard(user.user_id);
                    const extracted=dashboardObservations(dashboard,row.class_schedule,now);
                    for(const [category,items] of Object.entries(extracted.observations)) await observe(user.user_id,category,items);
                    await enqueueReminders(user.user_id,extracted.tasks,now);
                    await checked(db.from('web_push_poll').update({last_success:new Date().toISOString(),last_error:circulars?null:'CIRCOLARI_UNAVAILABLE'}).eq('user_id',user.user_id));
                },20000);
            } catch(e) {
                failed++;
                await checked(db.from('web_push_poll').update({last_error:[401,403,409].includes(e.status)?'LOGIN_REQUIRED':'SYNC_UNAVAILABLE'}).eq('user_id',user.user_id));
            }
        }
        const delivery=await deliver(started,now);
        return {processed,...delivery,failed:failed+delivery.failed, deferred:processed<(users||[]).length,circularsUnavailable:!circulars};
    });
}
module.exports={CATEGORIES,DEFAULTS,preferences,validateSubscription,config,digest,observation,dashboardObservations,pendingTomorrow,tomorrowRome,romeHour,runCron,send};
