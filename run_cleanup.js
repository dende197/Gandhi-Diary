require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runAggressiveMigration() {
    console.log("🚀 Starting aggressive migration...");

    try {
        // 1. Migrate Participants (even orphans)
        console.log("🔗 Normalizing conversation_participants...");
        const { data: parts } = await supabase.from('conversation_participants').select('user_id').not('user_id', 'eq', '{}');
        const uniqueOldIds = [...new Set(parts.map(p => p.user_id))];

        for (const oldId of uniqueOldIds) {
            const newId = (oldId.startsWith('p:') ? oldId : 'p:' + oldId).toLowerCase().replace(/\s+/g, '');
            if (oldId !== newId) {
                console.log(`   - Migrating participant ${oldId} -> ${newId}`);
                const { error } = await supabase.from('conversation_participants').update({ user_id: newId }).eq('user_id', oldId);
                if (error) console.warn(`     Error: ${error.message}`);
            }
        }

        // 2. Migrate Messages
        console.log("✉️ Normalizing messages...");
        const { data: msgsS } = await supabase.from('messages').select('sender_id');
        const uniqueSenders = [...new Set(msgsS.map(m => m.sender_id))];
        for (const oldId of uniqueSenders) {
            if (!oldId) continue;
            const newId = (oldId.startsWith('p:') ? oldId : 'p:' + oldId).toLowerCase().replace(/\s+/g, '');
            if (oldId !== newId) {
                console.log(`   - Migrating sender ${oldId} -> ${newId}`);
                await supabase.from('messages').update({ sender_id: newId }).eq('sender_id', oldId);
            }
        }

        // 3. Profiles Sync
        console.log("👤 Syncing profiles...");
        const { data: profiles } = await supabase.from('profiles').select('*');
        for (const p of profiles) {
            const newId = (p.id.startsWith('p:') ? p.id : 'p:' + p.id).toLowerCase().replace(/\s+/g, '');
            if (p.id !== newId) {
                console.log(`   - Normalizing profile ${p.id} -> ${newId}`);
                await supabase.from('profiles').upsert({ ...p, id: newId });
                await supabase.from('profiles').delete().eq('id', p.id);
            }
        }

        console.log("✅ Aggressive migration completed.");
    } catch (e) {
        console.error("❌ Fatal error:", e.message);
    }
}

runAggressiveMigration();
