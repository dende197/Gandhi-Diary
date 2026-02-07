require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function masterMerge() {
    console.log("🌟 DEFINITIVE MASTER MERGE STARTING 🌟");

    try {
        // 1. Fetch all profiles
        const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
        if (pErr) throw pErr;

        // 2. Identify Logical Groups (by Name, Case-Insensitive)
        const groups = {};
        profiles.forEach(p => {
            const normName = (p.name || '').trim().toUpperCase();
            if (!normName) return;
            if (!groups[normName]) groups[normName] = [];
            groups[normName].push(p);
        });

        for (const [name, list] of Object.entries(groups)) {
            if (list.length < 1) continue;
            console.log(`\n📦 Processing group: ${name} (${list.length} profiles)`);

            // Pick the "Standard ID" as the winner if it exists, otherwise reconstruct it
            // Standardization: p:school:user:index (lowercase)
            // We'll reconstruct the winner ID based on the best available info in the group
            let winnerId = null;
            const standardIdMatch = list.find(p => p.id.startsWith('p:') && p.id === p.id.toLowerCase());

            if (standardIdMatch) {
                winnerId = standardIdMatch.id;
            } else {
                // Reconstruct from the most active ID
                const mostActive = list.sort((a, b) => new Date(b.last_active) - new Date(a.last_active))[0];
                winnerId = ('p:' + mostActive.id.replace(/^p:/i, '')).toLowerCase().replace(/\s+/g, '');
            }

            console.log(`   🏆 Winner ID: ${winnerId}`);

            // Pick best data for Name, Class, Avatar, Spec
            const bestClass = list.find(p => p.class && p.class !== 'N/D')?.class || list[0].class;
            const bestAvatar = list.find(p => p.avatar && p.avatar.startsWith('http'))?.avatar || null;
            const bestSpec = list.find(p => p.specialization && p.specialization.length > 0)?.specialization || null;
            const latestActive = list.sort((a, b) => new Date(b.last_active) - new Date(a.last_active))[0].last_active;

            // 3. Update/Upsert the Winner Profile
            const { error: upsertErr } = await supabase.from('profiles').upsert({
                id: winnerId,
                name: name,
                class: bestClass,
                avatar: bestAvatar,
                specialization: bestSpec,
                last_active: latestActive
            });
            if (upsertErr) console.warn(`   ❌ Profile Upsert Error: ${upsertErr.message}`);

            // 4. Migrate References
            const otherIds = list.map(p => p.id).filter(id => id !== winnerId);
            for (const oldId of otherIds) {
                console.log(`   🔗 Migrating: ${oldId} -> ${winnerId}`);

                await supabase.from('messages').update({ sender_id: winnerId }).eq('sender_id', oldId);
                await supabase.from('messages').update({ receiver_id: winnerId }).eq('receiver_id', oldId);
                await supabase.from('conversation_participants').update({ user_id: winnerId }).eq('user_id', oldId);
                await supabase.from('posts').update({ authorId: winnerId }).eq('authorId', oldId);
                await supabase.from('market_items').update({ sellerId: winnerId }).eq('sellerId', oldId);
                await supabase.from('market_orders').update({ seller_id: winnerId }).eq('seller_id', oldId);
                await supabase.from('market_orders').update({ buyer_id: winnerId }).eq('buyer_id', oldId);
            }

            // 5. Handle PLANNER Merge (The tricky part)
            const allPossibleIds = [...otherIds, winnerId];
            const { data: planners } = await supabase.from('planners').select('*').in('user_id', allPossibleIds);

            if (planners && planners.length > 0) {
                console.log(`   📅 Merging ${planners.length} planners...`);
                let mergedTasks = {};
                let mergedStress = {};
                let latestUpdate = null;

                planners.forEach(pl => {
                    const tasks = (typeof pl.planned_tasks === 'string') ? JSON.parse(pl.planned_tasks) : (pl.planned_tasks || {});
                    const stress = (typeof pl.stress_levels === 'string') ? JSON.parse(pl.stress_levels) : (pl.stress_levels || {});

                    mergedTasks = { ...mergedTasks, ...tasks };
                    mergedStress = { ...mergedStress, ...stress };
                    if (!latestUpdate || new Date(pl.updated_at) > new Date(latestUpdate)) {
                        latestUpdate = pl.updated_at;
                    }
                });

                // Upsert merged planner to winner and delete others
                await supabase.from('planners').upsert({
                    user_id: winnerId,
                    planned_tasks: mergedTasks,
                    stress_levels: mergedStress,
                    updated_at: latestUpdate || new Date().toISOString()
                });

                const plannerIdsToDelete = planners.map(pl => pl.user_id).filter(id => id !== winnerId);
                if (plannerIdsToDelete.length > 0) {
                    await supabase.from('planners').delete().in('user_id', plannerIdsToDelete);
                }
            }

            // 6. Delete redundant profiles
            if (otherIds.length > 0) {
                console.log(`   🗑️ Deleting duplicates: ${otherIds.join(', ')}`);
                await supabase.from('profiles').delete().in('id', otherIds);
            }
        }

        console.log("\n✅ MASTER MERGE COMPLETED SUCCESSFULLY.");

    } catch (e) {
        console.error("\n❌ MASTER MERGE FATAL ERROR:", e.message);
    }
}

masterMerge();
