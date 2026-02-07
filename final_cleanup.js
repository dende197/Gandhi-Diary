require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function finalCleanup() {
    console.log("🔥 STARTING DEFINITIVE CLEANUP 🔥");

    try {
        // 1. Get ALL profiles
        const { data: profiles } = await supabase.from('profiles').select('*');

        // 2. Group by "Logical Entity" (Case-Insensitive Name or Reconstructed ID)
        // Since names might be identical for different people (rare in schools but possible), 
        // we use the RECONSTRUCTED ID from school:user:idx as the grouping key.
        const groups = {};
        profiles.forEach(p => {
            // Identify the core ID (remove p: and lowercase)
            const coreId = p.id.replace(/^p:/i, '').toLowerCase().replace(/\s+/g, '');
            if (!groups[coreId]) groups[coreId] = [];
            groups[coreId].push(p);
        });

        for (const [coreId, list] of Object.entries(groups)) {
            console.log(`\n📦 Entity: ${coreId} (${list.length} profiles)`);

            const newId = 'p:' + coreId;

            // Pick the best data
            const best = list.sort((a, b) => {
                const scoreA = (a.specialization ? 2 : 0) + (a.avatar ? 1 : 0);
                const scoreB = (b.specialization ? 2 : 0) + (b.avatar ? 1 : 0);
                if (scoreA !== scoreB) return scoreB - scoreA;
                return new Date(b.last_active) - new Date(a.last_active);
            })[0];

            console.log(`   - Keeping: ${best.id} (Renaming to ${newId})`);

            // Update related tables for ALL IDs in the list to the NEW ID
            const allOldIds = list.map(p => p.id);
            for (const oldId of allOldIds) {
                if (oldId === newId) continue;
                console.log(`     - Migrating refs: ${oldId} -> ${newId}`);
                await supabase.from('messages').update({ sender_id: newId }).eq('sender_id', oldId);
                await supabase.from('messages').update({ receiver_id: newId }).eq('receiver_id', oldId);
                await supabase.from('conversation_participants').update({ user_id: newId }).eq('user_id', oldId);
                await supabase.from('posts').update({ authorId: newId }).eq('authorId', oldId);
                await supabase.from('market_items').update({ sellerId: newId }).eq('sellerId', oldId);
            }

            // Force create the "perfect" record
            const { error: insErr } = await supabase.from('profiles').upsert({
                ...best,
                id: newId
            });
            if (insErr) console.error(`   ❌ Insert error: ${insErr.message}`);

            // Delete all records EXCEPT the newId
            const toDelete = allOldIds.filter(id => id !== newId);
            if (toDelete.length > 0) {
                console.log(`   - Deleting orphans: ${toDelete.join(', ')}`);
                await supabase.from('profiles').delete().in('id', toDelete);
            }
        }

        console.log("\n✅ CLEANUP COMPLETED SUCCESSFULLY.");

    } catch (e) {
        console.error("\n❌ FATAL CLEANUP ERROR:", e.message);
    }
}

finalCleanup();
