require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: profiles, count: profileCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { data: convs, count: convCount } = await supabase.from('conversations').select('*', { count: 'exact', head: true });
    const { data: msgs, count: msgCount } = await supabase.from('messages').select('*', { count: 'exact', head: true });
    const { data: parts, count: partCount } = await supabase.from('conversation_participants').select('*', { count: 'exact', head: true });

    console.log(`Profiles: ${profileCount}`);
    console.log(`Conversations: ${convCount}`);
    console.log(`Messages: ${msgCount}`);
    console.log(`Participants: ${partCount}`);

    if (partCount > 0) {
        const { data: latestParts } = await supabase.from('conversation_participants').select('user_id').limit(10);
        console.log("Recent participant IDs:", latestParts.map(p => p.user_id));
        const { data: latestProfs } = await supabase.from('profiles').select('id').limit(10);
        console.log("Recent profile IDs:", latestProfs.map(p => p.id));

        const mismatch = latestParts.filter(p => !latestProfs.some(prof => prof.id === p.user_id));
        console.log("Potential mismatches in sample:", mismatch.map(m => m.user_id));
    }

    if (convCount > 0) {
        const { data: latestConvs } = await supabase.from('conversations').select('*').order('last_message_at', { ascending: false }).limit(5);
        console.log("Latest Conversations:", JSON.stringify(latestConvs, null, 2));
    }
}

check();
