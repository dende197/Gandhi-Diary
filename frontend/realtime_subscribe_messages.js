import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// CONFIGURA QUI: URL del progetto e ANON KEY
const SUPABASE_URL = 'https://mlcutgkfunbpmrnbeznd.supabase.co';
const SUPABASE_ANON_KEY = '<INSERISCI_LA_TUA_ANON_KEY>'; // <-- incolla la tua anon key

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sottoscrizione agli eventi su public.messages
export function subscribeMessages(onEvent) {
    const channel = supabase
        .channel('realtime:messages')
        .on('postgres_changes', {
            event: '*',          // INSERT | UPDATE | DELETE | *
            schema: 'public',
            table: 'messages',
        }, payload => {
            onEvent?.(payload);
        })
        .subscribe();

    return channel;
}
