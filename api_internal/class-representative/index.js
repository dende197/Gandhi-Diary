const {
    handleCors,
    getRequestBody,
    normalizeUserId,
    normalizeClass,
    verifySessionToken,
    getCurrentSchoolYearKey,
} = require('../../lib/helpers');
const { database, checked, endpoint, httpError, text, isoDate, quota } = require('../../lib/backend');
function choice(map, key) { return typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null; }
function proposalView(p, votes = []) {
    const own = votes.filter((v) => v.proposal_id === p.id);
    return {
        id: p.id,
        type: p.type === 'ASSEMBLY' ? 'assembly' : 'exam_reschedule',
        class: p.class_id,
        class_id: p.class_id,
        targetDate: isoDate(p.target_date),
        target_date: p.target_date,
        originalDate: isoDate(p.original_date),
        original_date: p.original_date,
        subject: p.subject,
        duration: p.duration,
        reason: p.reason,
        authorId: p.creator_user_id,
        author_id: p.creator_user_id,
        authorName: p.creator_name,
        status: p.status.toLowerCase(),
        created_at: p.created_at,
        votes: {
            accept: own.filter((v) => v.vote === 'ACCEPT').map((v) => v.user_id),
            decline: own.filter((v) => v.vote === 'DECLINE').map((v) => v.user_id),
            alternatives: own
                .filter((v) => v.vote === 'COUNTER_PROPOSE')
                .map((v) => ({
                    userId: v.user_id,
                    userName: v.user_name,
                    date: isoDate(v.counter_proposed_date),
                    note: v.note,
                })),
        },
    };
}
module.exports = endpoint(async (req, res) => {
    if (handleCors(req, res)) return;
    if (!['GET', 'POST'].includes(req.method)) throw httpError(405, 'Metodo non consentito');
    const body = getRequestBody(req);
    const user = normalizeUserId(
        text(req.headers['x-user-id'] || body.userId || body.user_id || body.authorId || body.author_id, 200),
    );
    if (!user || !(await verifySessionToken(req, user))) throw httpError(403, 'Sessione non valida');
    const db = database();
    const membership = await checked(
        db.from('verified_memberships').select('*').eq('user_id', user).maybeSingle(),
    );
    if (
        !membership ||
        !membership.class_key.includes(`:${getCurrentSchoolYearKey()}:`) ||
        Date.now() - new Date(membership.verified_at).getTime() > 7 * 86400000
    )
        throw httpError(403, 'Classe non verificata: effettua nuovamente il login Argo');
    const requested = text(req.query.class || body.class, 100);
    if (requested && normalizeClass(requested) !== membership.class_name)
        throw httpError(403, 'Classe non autorizzata');
    const cls = membership.class_key;
    const nameRow = await checked(db.from('profiles').select('name').eq('id', user).maybeSingle());
    const name = text(nameRow?.name, 200) || 'Studente';
    async function representatives() {
        return ((await checked(db.from('class_representatives').select('*').eq('class', cls))) || []).map(
            (r) => ({ ...r, userId: r.user_id, class: membership.class_name, updatedAt: r.updated_at }),
        );
    }
    if (req.method === 'GET') {
        // Bound returned history, not the authorization scope. Votes fetched in
        // pages so a large class/history cannot silently lose its later votes.
        const props = await checked(
            db
                .from('proposals')
                .select('*')
                .eq('class_id', cls)
                .order('created_at', { ascending: false })
                .limit(100),
        );
        const votes = [];
        if (props?.length)
            for (let offset = 0; ; offset += 1000) {
                const page = await checked(
                    db
                        .from('proposal_votes')
                        .select('*')
                        .in(
                            'proposal_id',
                            props.map((p) => p.id),
                        )
                        .order('id')
                        .range(offset, offset + 999),
                );
                votes.push(...page);
                if (page.length < 1000) break;
            }
        return res.json({
            success: true,
            class: membership.class_name,
            representatives: await representatives(),
            proposals: (props || []).map((p) => proposalView(p, votes)),
        });
    }
    await quota(`class:${user}`, 30);
    const action = body.action || req.query.action;
    if (action === 'set_representative') {
        if (typeof body.enable !== 'boolean') throw httpError(400, 'enable deve essere booleano');
        const ok = await checked(
            db.rpc('set_class_representative', {
                p_user: user,
                p_class: cls,
                p_name: name,
                p_enable: body.enable,
            }),
        );
        if (!ok) throw httpError(403, 'Nomina non autorizzata o limite di due rappresentanti raggiunto');
        return res.json({
            success: true,
            class: membership.class_name,
            representatives: await representatives(),
            isRepresentative: body.enable,
        });
    }
    if (action === 'create_proposal') {
        const type = choice({
            assembly: 'ASSEMBLY',
            ASSEMBLY: 'ASSEMBLY',
            exam_reschedule: 'EXAM_MOVE',
            EXAM_MOVE: 'EXAM_MOVE',
        },body.type);
        const target = isoDate(body.targetDate),
            original = body.originalDate ? isoDate(body.originalDate) : null;
        if (!type || !target || !text(body.reason) || (body.originalDate && !original))
            throw httpError(400, 'Dati proposta non validi');
        const p = await checked(
            db.rpc('create_class_proposal', {
                p_user: user,
                p_class: cls,
                p_name: name,
                p_type: type,
                p_target: target,
                p_original: original,
                p_subject: text(body.subject, 200),
                p_duration: text(body.duration, 100) || '2 ore',
                p_reason: text(body.reason, 1000),
            }),
        );
        if (!p?.length) throw httpError(403, 'Classe non autorizzata');
        return res
            .status(201)
            .json({
                success: true,
                proposal: proposalView(p[0], [{ proposal_id: p[0].id, user_id: user, vote: 'ACCEPT' }]),
            });
    }
    const id = text(body.proposalId, 100);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw httpError(400, 'ID proposta non valido');
    if (action === 'vote') {
        const vote = choice({ accept: 'ACCEPT', decline: 'DECLINE', alternative: 'COUNTER_PROPOSE' },body.voteType);
        const date = vote === 'COUNTER_PROPOSE' ? isoDate(body.alternativeDate) : null;
        if (!vote || (vote === 'COUNTER_PROPOSE' && !date)) throw httpError(400, 'Voto non valido');
        const ok = await checked(
            db.rpc('vote_class_proposal', {
                p_user: user,
                p_proposal: id,
                p_vote: vote,
                p_date: date,
                p_note: text(body.note, 500),
                p_name: name,
            }),
        );
        if (!ok) throw httpError(409, 'Proposta chiusa o non appartenente alla classe');
        return res.json({ success: true, proposalId: id, vote });
    }
    if (action === 'manage_proposal') {
        const status = choice({ approved: 'APPROVED', rejected: 'REJECTED' },body.status);
        if (!status) throw httpError(400, 'Stato non valido');
        const rep = await checked(
            db
                .from('class_representatives')
                .select('user_id')
                .eq('user_id', user)
                .eq('class', cls)
                .maybeSingle(),
        );
        const grant = await checked(
            db
                .from('class_rep_grants')
                .select('user_id')
                .eq('user_id', user)
                .eq('class_key', cls)
                .maybeSingle(),
        );
        if (!rep || !grant) throw httpError(403, 'Rappresentante non autorizzato');
        const changed = await checked(
            db
                .from('proposals')
                .update({ status })
                .eq('id', id)
                .eq('class_id', cls)
                .eq('status', 'PENDING')
                .select('id'),
        );
        if (!changed?.length) throw httpError(409, 'Proposta già chiusa o non appartenente alla classe');
        return res.json({ success: true, proposalId: id, status });
    }
    throw httpError(400, 'Azione non valida');
});
