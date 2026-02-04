import { supabase } from './realtime_subscribe_messages.js';

export async function searchPeople(term, limit = 20) {
    const q = (term || '').trim();
    if (!q) return [];
    const { data, error } = await supabase
        .from('profiles')
        .select('id, name, class, avatar_url')
        .or(`name.ilike.%${q}%,class.ilike.%${q}%`)
        .limit(limit);
    if (error) throw error;
    return data;
}
