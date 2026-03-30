const { handleCors, parseJsonb } = require('../../lib/helpers');
const { getSupabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ success: false, error: 'user_id mancante' });

    const userId = decodeURIComponent(user_id).toLowerCase().replace(/\s+/g, '');

    // GET
    if (req.method === 'GET') {
        const supabase = getSupabase();
        if (!supabase) return res.status(500).json({ success: false, error: 'Supabase not configured' });

        try {
            const { data, error } = await supabase
                .from('planners')
                .select('*')
                .eq('user_id', userId)
                .limit(1);

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

            const row = data[0];

            // Parsa campi jsonb nel caso arrivino come stringa
            row.tasks = parseJsonb(row.tasks, []);
            row.planned_tasks = parseJsonb(row.planned_tasks, {});
            row.stress_levels = parseJsonb(row.stress_levels, {});
            row.planned_details = parseJsonb(row.planned_details, {});
            row.prep_levels = parseJsonb(row.prep_levels, {});

            return res.json({ success: true, data: row });

        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // PUT
    if (req.method === 'PUT') {
        const body = req.body || {};

        // Embed stressVents into stress_levels as __vents key (no separate DB column needed)
        const stressLevels = body.stressLevels || body.stress_levels || {};
        const stressVents = body.stressVents || body.stress_vents || {};
        if (Object.keys(stressVents).length > 0) {
            stressLevels.__vents = stressVents;
        }

        const payload = {
            user_id: userId,
            planned_tasks: body.plannedTasks || body.planned_tasks || {},
            stress_levels: stressLevels,
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
                            plannedTasks: parseJsonb(data.planned_tasks, {}),
                            stressLevels: parseJsonb(data.stress_levels, {}),
                            plannedDetails: parseJsonb(data.planned_details, {}),
                            tasks: parseJsonb(data.tasks, []),
                            prepLevels: parseJsonb(data.prep_levels, {}),
                            stressVents: parseJsonb(data.stress_levels, {}).__vents || {},
                            updatedAt: data.updated_at
                        }
                    });
                }

                if (error) console.error('planner upsert error:', error.message);

            } catch (e) {
                console.error('planner upsert exception:', e.message);
            }
        }

        return res.status(503).json({ success: false, error: 'Supabase non configurato o upsert fallito' });
    }

    res.status(405).json({ error: 'Method not allowed' });
};
