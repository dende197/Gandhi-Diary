const { createClient } = require('@supabase/supabase-js');

let _supabase = null;

const DEFAULT_SUPABASE_URL = 'https://mlcutgkfunbpmrnbeznd.supabase.co';
const DEFAULT_SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sY3V0Z2tmdW5icG1ybmJlem5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTE5ODY0OCwiZXhwIjoyMDg0Nzc0NjQ4fQ.Wn08oLxIJAaiVPsOZ6OWA9h6217AoOwuSOu9_3HO_Iw';

function getSupabase() {
    if (_supabase) return _supabase;

    const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_SERVICE_KEY;

    if (!url || !key) {
        console.warn('⚠️ Supabase env vars missing');
        return null;
    }

    _supabase = createClient(url, key);
    return _supabase;
}

module.exports = { getSupabase };
