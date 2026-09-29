const crypto = require('crypto');
const { database, checked, endpoint, httpError, deadline, withLease } = require('../lib/backend');
const { syncGoogleUser } = require('../lib/google-sync');
function secureEquals(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
    return (
        a.length === b.length &&
        Buffer.byteLength(a) === Buffer.byteLength(b) &&
        crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
    );
}
module.exports = endpoint(async (req, res) => {
    if (req.method !== 'GET') throw httpError(405, 'Metodo non consentito');
    const secret =
        (req.headers.authorization || '').replace(/^Bearer /, '') || req.headers['x-vercel-cron-secret'];
    if (!secureEquals(secret, process.env.CRON_SECRET)) throw httpError(401, 'Non autorizzato');
    const hour = Number(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Rome',
            hour: '2-digit',
            hourCycle: 'h23',
        }).format(new Date()),
    );
    if (!['1', 'true'].includes(req.query?.force) && (hour < 8 || hour >= 20))
        return res.json({ success: true, skipped: true, reason: 'nighttime' });
    const result = await withLease('cron:google', async () => {
        const db = database();
        await checked(db.rpc('prune_backend_state'));
        const started = Date.now();
        const result = { processed: 0, succeeded: 0, failed: 0, deferred: false };
        // A bounded, oldest-attempt-first queue gives later users a turn even when
        // one execution cannot finish the whole population. No offset skips.
        const users = await checked(
            db
                .from('google_tokens')
                .select('user_id')
                .not('refresh_token', 'is', null)
                .not('argo_school_code', 'is', null)
                .not('argo_username', 'is', null)
                .order('last_cron_attempt', { ascending: true, nullsFirst: true })
                .order('user_id')
                .limit(100),
        );
        for (const user of users || []) {
            if (Date.now() - started > 45000) {
                result.deferred = true;
                break;
            }
            await checked(
                db
                    .from('google_tokens')
                    .update({ last_cron_attempt: new Date().toISOString() })
                    .eq('user_id', user.user_id),
            );
            result.processed++;
            try {
                const sync = await deadline(() => syncGoogleUser(user.user_id), 30000);
                if (sync.success) result.succeeded++;
                else result.failed++;
            } catch (e) {
                result.failed++;
                console.error('Cron user failed', { code: e.code || e.status || 'SYNC_FAILED' });
            }
        }
        if (users?.length === 100) result.deferred = true;
        return result;
    });
    return res.status(result.failed ? 502 : 200).json({ success: result.failed === 0, results: result });
});
