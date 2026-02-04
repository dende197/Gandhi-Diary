import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// CONFIGURA QUI: URL del progetto e ANON KEY
const SUPABASE_URL = 'https://mlcutgkfunbpmrnbeznd.supabase.co';
const SUPABASE_ANON_KEY = '<eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sY3V0Z2tmdW5icG1ybmJlem5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTg2NDgsImV4cCI6MjA4NDc3NDY0OH0.eWR7PxNsJjSGAM1WoaNseVkeQDpEqaUvO8xvXoDKLQg>'; // <-- incolla la tua anon key

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
