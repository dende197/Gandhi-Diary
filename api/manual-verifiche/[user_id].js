const { getSupabase } = require('../../lib/supabase');
const { handleCors } = require('../../lib/helpers');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ success: false, error: 'user_id mancante' });

    const userId = decodeURIComponent(user_id).toLowerCase().replace(/\s+/g, '');
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase not configured' });

    // GET: Fetch all manual verifiche
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('manual_verifiche')
                .select('*')
                .eq('user_id', userId)
                .order('date', { ascending: true });

            if (error) throw error;
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // POST: Create a new manual verifica
    if (req.method === 'POST') {
        const { subject, date, type, args } = req.body;
        if (!subject || !date || !type) {
            return res.status(400).json({ success: false, error: 'Mancano campi obbligatori' });
        }

        try {
            const { data, error } = await supabase
                .from('manual_verifiche')
                .insert([{ user_id: userId, subject, date, type, args, done: false }])
                .select()
                .single();

            if (error) throw error;
            return res.status(201).json({ success: true, data });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // PUT: Update done status or date
    if (req.method === 'PUT') {
        const { id, done, date, subject, type, args } = req.body;
        if (!id) return res.status(400).json({ success: false, error: 'ID verifica mancante' });

        const updates = {};
        if (done !== undefined) updates.done = done;
        if (date) updates.date = date;
        if (subject) updates.subject = subject;
        if (type) updates.type = type;
        if (args !== undefined) updates.args = args;

        try {
            const { data, error } = await supabase
                .from('manual_verifiche')
                .update(updates)
                .eq('id', id)
                .eq('user_id', userId) // Security check
                .select()
                .single();

            if (error) throw error;
            return res.json({ success: true, data });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // DELETE: Remove a manual verifica
    if (req.method === 'DELETE') {
        const { id } = req.body || req.query;
        if (!id) return res.status(400).json({ success: false, error: 'ID verifica mancante' });

        try {
            const { error } = await supabase
                .from('manual_verifiche')
                .delete()
                .eq('id', id)
                .eq('user_id', userId);

            if (error) throw error;
            return res.json({ success: true, message: 'Verifica eliminata' });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    res.status(405).json({ error: 'Method not allowed' });
};
