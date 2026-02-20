const { createClient } = require('@supabase/supabase-js');

let _supabase = null;

function getSupabase() {
    if (_supabase) return _supabase;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        console.warn('⚠️ Supabase env vars missing');
        return null;
    }

    _supabase = createClient(url, key);
    return _supabase;
}

module.exports = { getSupabase };
