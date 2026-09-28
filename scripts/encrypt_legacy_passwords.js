/** Run with exported environment variables, or node --env-file=.env.local scripts/encrypt_legacy_passwords.js. */
const { database, checked } = require('../lib/backend');
const { encryptArgoPassword, isSessionSecurityConfigured } = require('../lib/auth');
async function run() {
    if (!isSessionSecurityConfigured()) throw new Error('ARGO_ENCRYPTION_KEY non valida');
    const db = database();
    const counts = { migrated: 0, skipped: 0, changedConcurrently: 0 };
    let after = '';
    for (;;) {
        const rows = await checked(
            db
                .from('google_tokens')
                .select('user_id,argo_password')
                .gt('user_id', after)
                .order('user_id')
                .limit(500),
        );
        if (!rows.length) break;
        for (const row of rows) {
            if (!row.argo_password || row.argo_password.startsWith('enc:')) {
                counts.skipped++;
                continue;
            }
            const changed = await checked(
                db
                    .from('google_tokens')
                    .update({
                        argo_password: encryptArgoPassword(row.argo_password),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', row.user_id)
                    .eq('argo_password', row.argo_password)
                    .select('user_id'),
            );
            if (changed.length) counts.migrated++;
            else counts.changedConcurrently++;
        }
        after = rows[rows.length - 1].user_id;
    }
    console.log('Migration complete', counts);
    return counts;
}
if (require.main === module)
    run().catch((e) => {
        console.error('Migration failed', e.code || e.message);
        process.exitCode = 1;
    });
module.exports = { run };
