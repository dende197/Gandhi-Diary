/**
 * One-shot migration script to encrypt any legacy plaintext passwords stored in google_tokens.
 *
 * Usage:
 *   node scripts/encrypt_legacy_passwords.js
 *
 * Prerequisites:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - ARGO_ENCRYPTION_KEY
 */

require('dotenv').config();
const { getSupabase } = require('../lib/supabase');
const { encryptArgoPassword } = require('../lib/helpers');

async function run() {
    console.log('🔒 Starting legacy password encryption migration...');

    if (!process.env.ARGO_ENCRYPTION_KEY) {
        console.error('❌ Missing ARGO_ENCRYPTION_KEY. Cannot encrypt legacy passwords.');
        process.exit(1);
    }

    const supabase = getSupabase();
    if (!supabase) {
        console.error('❌ Supabase client is not available. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
        process.exit(1);
    }

    try {
        const { data: rows, error } = await supabase
            .from('google_tokens')
            .select('user_id, argo_school_code, argo_username, argo_password')
            .not('argo_password', 'is', null);

        if (error) {
            console.error('❌ Failed to fetch tokens from Supabase:', error.message);
            process.exit(1);
        }

        if (!rows || rows.length === 0) {
            console.log('✅ No rows found in google_tokens with argo_password.');
            process.exit(0);
        }

        console.log(`Found ${rows.length} rows to inspect.`);
        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const row of rows) {
            const rawPwd = row.argo_password;
            if (rawPwd.startsWith('enc:')) {
                skippedCount++;
                continue;
            }

            console.log(`Encrypting legacy password for user_id: ${row.user_id} (${row.argo_school_code} / ${row.argo_username})...`);
            const encrypted = encryptArgoPassword(rawPwd);
            if (!encrypted) {
                console.error(`❌ Failed to encrypt password for ${row.user_id}`);
                errorCount++;
                continue;
            }

            const { error: updateError } = await supabase
                .from('google_tokens')
                .update({
                    argo_password: encrypted,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', row.user_id);

            if (updateError) {
                console.error(`❌ Update failed for ${row.user_id}:`, updateError.message);
                errorCount++;
            } else {
                migratedCount++;
            }
        }

        console.log('\nMigration complete:');
        console.log(`  - Migrated: ${migratedCount}`);
        console.log(`  - Already encrypted: ${skippedCount}`);
        console.log(`  - Errors: ${errorCount}`);

        if (errorCount > 0) {
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Migration failed with uncaught exception:', e.message);
        process.exit(1);
    }
}

if (require.main === module) {
    run();
}

module.exports = { run };
