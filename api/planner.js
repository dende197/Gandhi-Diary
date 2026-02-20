const axios = require('axios');
const { handleCors, debugLog, createHeaders } = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ success: false, error: 'user_id obbligatorio' });

    try {
        if (req.method === 'GET') {
            return await handleGet(req, res, user_id);
        } else if (req.method === 'PUT') {
            return await handlePut(req, res, user_id);
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (e) {
        console.error(`Planner Hub Error:`, e.message);
        res.status(500).json({ success: false, error: e.message });
    }
};

async function handleGet(req, res, user_id) {
    const supabase = getSupabase();
    if (supabase) {
        const { data, error } = await supabase.from('profiles').select('planner_data').eq('id', user_id).single();
        if (!error && data?.planner_data) return res.json({ success: true, data: data.planner_data });
    }
    res.json({ success: true, data: null });
}

async function handlePut(req, res, user_id) {
    const { data: plannerData, session } = req.body;
    if (!plannerData) return res.status(400).json({ success: false, error: 'Dati planner mancanti' });

    const supabase = getSupabase();
    if (supabase) {
        const { error } = await supabase.from('profiles').update({ planner_data: plannerData, last_active: new Date().toISOString() }).eq('id', user_id);
        if (!error) return res.json({ success: true });
    }

    if (session) {
        const headers = createHeaders(session.schoolCode, session.accessToken, session.authToken);
        await axios.post('https://didup.portaleargo.it/api/v1/planner', plannerData, { headers }).catch(() => { });
    }
    res.json({ success: true, note: 'Saved with fallback' });
}
