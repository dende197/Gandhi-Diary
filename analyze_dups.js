require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyze() {
    const { data: dups } = await supabase.rpc('get_duplicates_analysis');
    // Se l'RPC non esiste, facciamo una query manuale
    if (!dups) {
        const { data: profiles } = await supabase.from('profiles').select('*');
        const groups = {};
        profiles.forEach(p => {
            const name = p.name ? p.name.trim().toUpperCase() : 'N/A';
            if (!groups[name]) groups[name] = [];
            groups[name].push(p);
        });

        const duplicateGroups = Object.entries(groups).filter(([name, list]) => list.length > 1);
        console.log("Duplicate Groups by Name:");
        duplicateGroups.forEach(([name, list]) => {
            console.log(`\nName: ${name}`);
            list.forEach(p => {
                console.log(` - ID: ${p.id} | Class: ${p.class} | Active: ${p.last_active}`);
            });
        });
    }
}

analyze();
