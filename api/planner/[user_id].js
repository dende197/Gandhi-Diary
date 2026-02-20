const axios = require('axios');
const { handleCors, debugLog } = require('../../lib/helpers');
const { getSupabase } = require('../../lib/supabase');

function sbHeaders() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing Supabase env vars');
    }
    return {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
    };
}

function sbTableUrl(table) {
    return `${process.env.SUPABASE_URL}/rest/v1/${table}`;
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const { user_id } = req.query;
    const userId = decodeURIComponent(user_id).toLowerCase().replace(/\s+/g, '');

    // GET
    if (req.method === 'GET') {
        const supabase = getSupabase();
        if (!supabase) return res.status(500).json({ success: false, error: 'Supabase not configured' });

        try {
            const { data, error } = await supabase.from('planners').select('*').eq('user_id', userId).limit(1);
            if (error) throw error;

            if (!data || data.length === 0) {
                return res.status(200).json({
                    success: true,
                    data: {
                        user_id: userId,
                        planned_tasks: {},
                        stress_levels: {},
                        planned_details: {},
                        tasks: [],
                        prep_levels: {},
                        updated_at: null
                    }
                });
            }

            res.json({ success: true, data: data[0] });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
        return;
    }

    // PUT
    if (req.method === 'PUT') {
        const body = req.body || {};
        const payload = {
            user_id: userId,
            planned_tasks: body.plannedTasks || body.planned_tasks || {},
            stress_levels: body.stressLevels || body.stress_levels || {},
            planned_details: body.plannedDetails || body.planned_details || {},
            tasks: body.tasks || [],
            prep_levels: body.prepLevels || body.prep_levels || {},
            updated_at: new Date().toISOString()
        };

        const supabase = getSupabase();
        if (supabase) {
            try {
                const { data, error } = await supabase
                    .from('planners')
                    .upsert(payload, { onConflict: 'user_id' })
                    .select()
                    .single();

                if (!error && data) {
                    return res.json({
                        success: true,
                        data: {
                            userId: data.user_id,
                            plannedTasks: data.planned_tasks,
                            stressLevels: data.stress_levels,
                            plannedDetails: data.planned_details,
                            tasks: data.tasks || [],
                            prepLevels: data.prep_levels || {},
                            updatedAt: data.updated_at
                        }
                    });
                }
            } catch (e) {
                console.error('planner upsert supabase-js exception:', e.message);
            }
        }

        // Fallback REST
        try {
            const url = `${sbTableUrl('planners')}?on_conflict=user_id`;
            const headers = sbHeaders();
            headers.Prefer = 'resolution=merge-duplicates,return=representation';
            const r = await axios.post(url, payload, { headers, timeout: 15000 });
            const rows = Array.isArray(r.data) ? r.data : [r.data];
            const row = rows[0] || payload;

            return res.json({
                success: true,
                data: {
                    userId: row.user_id,
                    plannedTasks: row.planned_tasks,
                    stressLevels: row.stress_levels,
                    plannedDetails: row.planned_details,
                    tasks: row.tasks || [],
                    prepLevels: row.prep_levels || {},
                    updatedAt: row.updated_at
                }
            });
        } catch (e) {
            return res.status(e.response?.status || 500).json({ success: false, error: e.response?.data || e.message });
        }
    }

    res.status(405).json({ error: 'Method not allowed' });
}
