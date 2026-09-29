const {
    handleCors,
    getRequestBody,
    generatePid,
    normalizeUserId,
    verifySessionToken,
    parseJsonb,
} = require('../lib/helpers');
const { database, checked, httpError, text } = require('../lib/backend');
const { loadArgoDashboard, assertIdentity } = require('../lib/argo-session');
const argo = require('../lib/argo');
module.exports = async function (req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const body = getRequestBody(req),
        school = text(body.schoolCode, 30).toUpperCase(),
        username = text(body.username, 200).toLowerCase();
    const index = Number(body.profileIndex ?? 0);
    if (!school || !username || !Number.isInteger(index) || index < 0)
        throw httpError(400, 'Credenziali mancanti o profilo non valido');
    const userId = normalizeUserId(body.userId || body.studentId || generatePid(school, username, index));
    assertIdentity(userId, school, username, index);
    if (!(await verifySessionToken(req, userId)))
        return res.status(403).json({ success: false, error: 'Non autorizzato' });
    const { row, dashboard } = await loadArgoDashboard(userId);
    const db = database();
    const [student, planner, mv] = await Promise.all([
        checked(db.from('profiles').select('*').eq('id', userId).maybeSingle()),
        checked(db.from('planners').select('*').eq('user_id', userId).maybeSingle()),
        checked(
            db.from('manual_verifiche').select('*').eq('user_id', userId).order('date', { ascending: true }),
        ),
    ]);
    const activities = argo.extractClassActivitiesFromDashboard(dashboard, {
        subjectId: row.argo_id_soggetto,
    });
    const stress = parseJsonb(planner?.stress_levels, {});
    return res.json({
        success: true,
        tasks: argo.extractHomeworkFromDashboard(dashboard),
        voti: argo.extractGradesFromDashboard(dashboard),
        promemoria: argo.extractPromemoriaFromDashboard(dashboard),
        activities: activities.svolte,
        plannedActivities: activities.pianificate,
        assenzeData: argo.extractAssenzeFromDashboard(dashboard, { schedule: row.class_schedule }),
        verifiche: argo.extractVerificheFromDashboard(dashboard),
        new_tokens: { authToken: row.argo_auth_token, accessToken: row.argo_access_token },
        student: student || { id: userId },
        planner: {
            plannedTasks: parseJsonb(planner?.planned_tasks, {}),
            plannedDetails: parseJsonb(planner?.planned_details, {}),
            tasks: parseJsonb(planner?.tasks, []),
            stressLevels: stress,
            stressVents: stress.__vents || {},
            prepLevels: parseJsonb(planner?.prep_levels, {}),
            manualVerifiche: mv || [],
            version: planner?.version || 0,
            updatedAt: planner?.updated_at || null,
        },
        lastArgoSync: row.last_argo_sync || null,
    });
};

module.exports = require('../lib/backend').endpoint(module.exports);
