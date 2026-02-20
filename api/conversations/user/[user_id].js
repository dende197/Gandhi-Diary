const { handleCors, debugLog } = require('../../../lib/helpers');
const { getSupabase } = require('../../../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { user_id } = req.query;
    if (!user_id) {
        return res.status(400).json({ success: false, error: 'User ID mancante' });
    }

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(503).json({ success: false, error: 'Database non disponibile' });
    }

    try {
        debugLog(`Fetching conversations for user: ${user_id}`);

        // 1. Find all conversations where this user is a participant
        const { data: myParticipations, error: partError } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', user_id);

        if (partError) throw partError;
        if (!myParticipations || myParticipations.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const conversationIds = myParticipations.map(p => p.conversation_id);

        // 2. Fetch the conversations to get last_message_at
        const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('id, last_message_at')
            .in('id', conversationIds)
            .order('last_message_at', { ascending: false });

        if (convError) throw convError;

        // 3. For each conversation, find the *other* participant and latest message
        const threads = [];
        for (const conv of conversations) {
            // Get other participant
            const { data: otherPart, error: opError } = await supabase
                .from('conversation_participants')
                .select('user_id')
                .eq('conversation_id', conv.id)
                .neq('user_id', user_id)
                .limit(1)
                .maybeSingle();

            if (opError) console.error("Error fetching other participant:", opError.message);
            const otherId = otherPart ? otherPart.user_id : 'Sconosciuto';

            // Get other user's profile info
            let otherName = 'Utente';
            let otherAvatar = null;
            let otherClass = null;

            if (otherId !== 'Sconosciuto') {
                const { data: profile, error: profError } = await supabase
                    .from('profiles')
                    .select('name, avatar, class')
                    .eq('id', otherId)
                    .maybeSingle();

                if (!profError && profile) {
                    otherName = profile.name || otherName;
                    otherAvatar = profile.avatar || null;
                    otherClass = profile.class ? 'Classe ' + profile.class : null;
                }
            }

            // Get last message text
            const { data: lastMsg, error: msgError } = await supabase
                .from('messages')
                .select('content, sender_id')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (msgError) console.error("Error fetching last message:", msgError.message);

            threads.push({
                id: conv.id, // JS frontend expects threadId which maps to this
                otherId: otherId,
                otherName: otherName,
                otherAvatar: otherAvatar,
                otherClass: otherClass,
                lastMessage: lastMsg ? lastMsg.content : '',
                lastAt: conv.last_message_at,
                senderId: lastMsg ? lastMsg.sender_id : null
            });
        }

        return res.status(200).json({ success: true, data: threads });

    } catch (error) {
        console.error("Conversations Hub Error:", error.message);
        return res.status(500).json({ success: false, error: 'Database query failed' });
    }
};
