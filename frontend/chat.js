import { supabase } from './realtime_subscribe_messages.js';
import { getCurrentUserId } from './identity.js';

export async function sendChatMessage(conversationId, message, type = 'text') {
    const senderId = getCurrentUserId();
    if (!senderId) throw new Error('Nessun profilo selezionato');

    const { data, error } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content: message,
            type
        })
        .select('*');

    if (error) throw error;
    return data;
}

export function isMyMessage(msg) {
    const me = getCurrentUserId();
    return msg?.sender_id === me;
}
