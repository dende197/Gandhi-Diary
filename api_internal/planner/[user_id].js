const {
    handleCors,
    verifySessionToken,
    normalizeUserIdParam,
    getRequestBody,
    parseJsonb,
} = require('../../lib/helpers');
const { database, checked, httpError } = require('../../lib/backend');
module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    const id = normalizeUserIdParam(req.query.user_id);
    if (!(await verifySessionToken(req, id)))
        return res.status(403).json({ success: false, error: 'Non autorizzato' });
    const db = database();
    if (req.method === 'GET') {
        const row = await checked(db.from('planners').select('*').eq('user_id', id).maybeSingle());
        return res.json({
            success: true,
            data: row || {
                user_id: id,
                planned_tasks: {},
                stress_levels: {},
                planned_details: {},
                tasks: [],
                prep_levels: {},
                version: 0,
                updated_at: null,
            },
        });
    }
    if (req.method !== 'PUT') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const body = getRequestBody(req);
    if (!Number.isSafeInteger(body.version) || body.version < 0)
        throw httpError(428, 'Leggi il planner prima di salvarlo: versione mancante');
    const payload = {};
    for (const [camel, snake] of [
        ['plannedTasks', 'planned_tasks'],
        ['plannedDetails', 'planned_details'],
        ['stressLevels', 'stress_levels'],
        ['prepLevels', 'prep_levels'],
        ['tasks', 'tasks'],
    ]) {
        const value = body[camel] ?? body[snake];
        if (value === undefined) continue;
        if (
            !value ||
            typeof value !== 'object' ||
            (snake === 'tasks' ? !Array.isArray(value) : Array.isArray(value))
        )
            throw httpError(400, 'Formato planner non valido');
        payload[snake] = value;
    }
    if (body.stressVents !== undefined || body.stress_vents !== undefined) {
        const vents = body.stressVents ?? body.stress_vents;
        if (!vents || typeof vents !== 'object' || Array.isArray(vents))
            throw httpError(400, 'Formato stressVents non valido');
        if (!payload.stress_levels) throw httpError(400, 'Invia stressLevels insieme a stressVents');
        payload.stress_levels = { ...payload.stress_levels, __vents: vents };
    }
    const rows = await checked(
        db.rpc('save_planner', { p_user: id, p_version: body.version, p_payload: payload }),
    );
    if (!rows?.length)
        throw httpError(
            409,
            'Il planner è stato modificato da un altro dispositivo. Ricarica prima di salvare.',
        );
    const d = rows[0];
    return res.json({
        success: true,
        data: {
            userId: id,
            plannedTasks: parseJsonb(d.planned_tasks, {}),
            plannedDetails: parseJsonb(d.planned_details, {}),
            stressLevels: parseJsonb(d.stress_levels, {}),
            tasks: parseJsonb(d.tasks, []),
            prepLevels: parseJsonb(d.prep_levels, {}),
            stressVents: parseJsonb(d.stress_levels, {}).__vents || {},
            version: d.version,
            updatedAt: d.updated_at,
        },
    });
};

module.exports = require('../../lib/backend').endpoint(module.exports);
