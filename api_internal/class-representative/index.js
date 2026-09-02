const { getSupabase } = require('../../lib/supabase');
const { handleCors, getRequestBody, normalizeUserIdParam, verifySessionToken, normalizeUserId } = require('../../lib/helpers');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(503).json({ success: false, error: 'Database service non disponibile' });
    }

    const body = getRequestBody(req);
    const action = req.query.action || body.action || (req.method === 'POST' ? 'get' : 'get');
    const rawClass = req.query.class || body.class || '';
    const className = String(rawClass).trim().toUpperCase();

    // ── 1. GET REPRESENTATIVES & PROPOSALS ───────────────────────────────────
    if (req.method === 'GET') {
        if (!className) {
            return res.status(400).json({ success: false, error: 'Parametro classe mancante' });
        }

        try {
            // Fetch representatives for this class
            const { data: dbReps, error: repsError } = await supabase
                .from('class_representatives')
                .select('*')
                .eq('class', className);

            if (repsError) throw repsError;

            const reps = (dbReps || []).map(r => ({
                id: r.id,
                userId: r.user_id,
                user_id: r.user_id,
                name: r.name,
                class: r.class,
                updatedAt: r.updated_at || r.created_at
            }));

            // Fetch proposals for this class
            const { data: dbProps, error: propsError } = await supabase
                .from('proposals')
                .select('*')
                .eq('class_id', className)
                .order('created_at', { ascending: false });

            if (propsError) throw propsError;

            let props = [];
            if (dbProps && dbProps.length > 0) {
                const propIds = dbProps.map(p => p.id);
                let allVotes = [];

                const { data: dbVotes, error: votesError } = await supabase
                    .from('proposal_votes')
                    .select('*')
                    .in('proposal_id', propIds);

                if (!votesError && dbVotes) allVotes = dbVotes;

                props = dbProps.map(p => {
                    const pVotes = allVotes.filter(v => v.proposal_id === p.id);
                    const accept = pVotes.filter(v => v.vote === 'ACCEPT').map(v => v.user_id);
                    const decline = pVotes.filter(v => v.vote === 'DECLINE').map(v => v.user_id);
                    const alternatives = pVotes
                        .filter(v => v.vote === 'COUNTER_PROPOSE')
                        .map(v => ({
                            userId: v.user_id,
                            user_id: v.user_id,
                            userName: v.user_name,
                            date: v.counter_proposed_date ? new Date(v.counter_proposed_date).toISOString().split('T')[0] : '',
                            note: v.note || ''
                        }));

                    const normalizedType = p.type === 'ASSEMBLY' ? 'assembly' : (p.type === 'EXAM_MOVE' ? 'exam_reschedule' : p.type);
                    const normalizedStatus = (p.status || 'PENDING').toLowerCase();

                    return {
                        id: p.id,
                        type: normalizedType,
                        class: p.class_id,
                        class_id: p.class_id,
                        targetDate: p.target_date ? new Date(p.target_date).toISOString().split('T')[0] : '',
                        target_date: p.target_date,
                        originalDate: p.original_date ? new Date(p.original_date).toISOString().split('T')[0] : null,
                        original_date: p.original_date,
                        subject: p.subject || null,
                        duration: p.duration || '2 ore',
                        reason: p.reason,
                        authorId: p.creator_user_id,
                        author_id: p.creator_user_id,
                        authorName: p.creator_name || 'Studente',
                        status: normalizedStatus,
                        votes: {
                            accept,
                            decline,
                            alternatives
                        },
                        created_at: p.created_at
                    };
                });
            }

            return res.status(200).json({
                success: true,
                class: className,
                representatives: reps,
                proposals: props
            });
        } catch (err) {
            console.error('[ClassRep API] Fetch error:', err.message);
            return res.status(500).json({ success: false, error: 'Errore nel recupero dati classe' });
        }
    }

    // ── 2. TOGGLE / SET CLASS REPRESENTATIVE (MAX 2 PER CLASS) ───────────────
    if (req.method === 'POST' && action === 'set_representative') {
        const targetClass = (body.class || className || '').trim().toUpperCase();
        const userId = normalizeUserIdParam(body.userId || body.user_id);
        const userName = (body.userName || body.name || 'Studente').trim();
        const enable = !!body.enable;

        if (!targetClass || !userId) {
            return res.status(400).json({ success: false, error: 'Classe e ID utente mancanti' });
        }

        // Authentication & authorization: caller must prove they own this userId
        if (!verifySessionToken(req, normalizeUserId(userId))) {
            return res.status(403).json({ success: false, error: 'Non autorizzato: sessione non valida' });
        }

        try {
            const { data: dbReps, error: fetchErr } = await supabase
                .from('class_representatives')
                .select('*')
                .eq('class', targetClass);

            if (fetchErr) throw fetchErr;

            let currentReps = (dbReps || []).map(r => ({
                id: r.id,
                userId: r.user_id,
                user_id: r.user_id,
                name: r.name,
                class: r.class,
                updatedAt: r.updated_at
            }));

            if (enable) {
                const isAlreadyRep = currentReps.some(r => String(r.userId || r.user_id) === String(userId));
                if (!isAlreadyRep) {
                    if (currentReps.length >= 2) {
                        return res.status(403).json({
                            success: false,
                            limitReached: true,
                            error: 'Limite massimo raggiunto (2/2 Rappresentanti attivi per questa classe).'
                        });
                    }

                    const newRep = {
                        class: targetClass,
                        user_id: userId,
                        name: userName,
                        updated_at: new Date().toISOString()
                    };

                    const { error: upsertErr } = await supabase.from('class_representatives').upsert(newRep, { onConflict: 'user_id' });
                    if (upsertErr) throw upsertErr;
                    currentReps.push({ ...newRep, userId });
                }
            } else {
                const { error: delErr } = await supabase.from('class_representatives').delete().eq('user_id', userId).eq('class', targetClass);
                if (delErr) throw delErr;
                currentReps = currentReps.filter(r => String(r.userId || r.user_id) !== String(userId));
            }

            return res.status(200).json({
                success: true,
                class: targetClass,
                representatives: currentReps,
                isRepresentative: enable
            });
        } catch (e) {
            console.error('[ClassRep API] Set rep error:', e.message);
            return res.status(500).json({ success: false, error: 'Errore salvataggio rappresentante' });
        }
    }

    // ── 3. CREATE PROPOSAL (ASSEMBLEA O SPOSTAMENTO VERIFICA) ─────────────────
    if (req.method === 'POST' && action === 'create_proposal') {
        const targetClass = (body.class || className || '').trim().toUpperCase();
        const { type, targetDate, reason, originalDate, subject, duration, authorName } = body;
        const authorId = normalizeUserIdParam(body.authorId || body.author_id || body.userId || body.user_id);

        if (!targetClass || !type || !targetDate || !reason || !authorId) {
            return res.status(400).json({ success: false, error: 'Dati proposta incompleti' });
        }

        // Authentication: caller must own authorId
        if (!verifySessionToken(req, normalizeUserId(authorId))) {
            return res.status(403).json({ success: false, error: 'Non autorizzato: sessione non valida' });
        }

        const dbType = (type === 'assembly' || type === 'ASSEMBLY') ? 'ASSEMBLY' : 'EXAM_MOVE';
        const targetIso = new Date(targetDate + (targetDate.includes('T') ? '' : 'T08:00:00Z')).toISOString();
        const origIso = originalDate ? new Date(originalDate + (originalDate.includes('T') ? '' : 'T08:00:00Z')).toISOString() : null;

        try {
            const { data: inserted, error: insErr } = await supabase
                .from('proposals')
                .insert([{
                    class_id: targetClass,
                    creator_user_id: authorId,
                    creator_name: String(authorName || 'Studente'),
                    type: dbType,
                    target_date: targetIso,
                    original_date: origIso,
                    subject: subject || null,
                    duration: duration || '2 ore',
                    reason: String(reason).trim().substring(0, 1000),
                    status: 'PENDING'
                }])
                .select()
                .single();

            if (insErr || !inserted) throw insErr || new Error('Inserimento fallito');

            // Automatically add creator's ACCEPT vote
            await supabase.from('proposal_votes').upsert({
                proposal_id: inserted.id,
                user_id: authorId,
                user_name: String(authorName || 'Studente'),
                vote: 'ACCEPT',
                updated_at: new Date().toISOString()
            }, { onConflict: 'proposal_id,user_id' });

            const createdProp = {
                id: inserted.id,
                type: dbType === 'ASSEMBLY' ? 'assembly' : 'exam_reschedule',
                class: targetClass,
                class_id: targetClass,
                targetDate: targetDate.split('T')[0],
                target_date: targetIso,
                originalDate: originalDate ? originalDate.split('T')[0] : null,
                original_date: origIso,
                subject: subject || null,
                duration: duration || '2 ore',
                reason: String(reason).trim(),
                authorId,
                author_id: authorId,
                authorName: authorName || 'Studente',
                status: 'pending',
                votes: {
                    accept: [authorId],
                    decline: [],
                    alternatives: []
                },
                created_at: inserted.created_at
            };

            return res.status(201).json({
                success: true,
                proposal: createdProp
            });
        } catch (e) {
            console.error('[ClassRep API] Create proposal error:', e.message);
            return res.status(500).json({ success: false, error: 'Errore creazione proposta' });
        }
    }

    // ── 4. VOTE ON PROPOSAL ──────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'vote') {
        const { proposalId, userName, voteType, alternativeDate, note } = body;
        const userId = normalizeUserIdParam(body.userId || body.user_id);

        if (!proposalId || !userId || !voteType) {
            return res.status(400).json({ success: false, error: 'Parametri di voto mancanti' });
        }

        // Authentication: caller must own userId
        if (!verifySessionToken(req, normalizeUserId(userId))) {
            return res.status(403).json({ success: false, error: 'Non autorizzato: sessione non valida' });
        }

        let dbVote = 'ACCEPT';
        if (voteType === 'decline') dbVote = 'DECLINE';
        if (voteType === 'alternative') dbVote = 'COUNTER_PROPOSE';

        const counterIso = alternativeDate 
            ? new Date(alternativeDate + (alternativeDate.includes('T') ? '' : 'T08:00:00Z')).toISOString() 
            : null;

        try {
            const { error: voteErr } = await supabase.from('proposal_votes').upsert({
                proposal_id: proposalId,
                user_id: userId,
                user_name: String(userName || 'Studente'),
                vote: dbVote,
                counter_proposed_date: counterIso,
                note: note ? String(note).trim().substring(0, 500) : '',
                updated_at: new Date().toISOString()
            }, { onConflict: 'proposal_id,user_id' });

            if (voteErr) throw voteErr;

            return res.status(200).json({
                success: true,
                proposalId,
                vote: dbVote
            });
        } catch (e) {
            console.error('[ClassRep API] Vote error:', e.message);
            return res.status(500).json({ success: false, error: 'Errore registrazione voto' });
        }
    }

    // ── 5. REPRESENTATIVE MANAGEMENT ACTION (APPROVE / REJECT) ───────────────
    if (req.method === 'POST' && action === 'manage_proposal') {
        const { proposalId, status } = body;
        const managerUserId = normalizeUserIdParam(body.userId || body.user_id || req.query.userId);

        if (!proposalId || !status || !managerUserId) {
            return res.status(400).json({ success: false, error: 'ID proposta, status e ID rappresentante richiesti' });
        }

        // Authentication: caller must own managerUserId
        if (!verifySessionToken(req, normalizeUserId(managerUserId))) {
            return res.status(403).json({ success: false, error: 'Non autorizzato: sessione non valida' });
        }

        const dbStatus = status === 'approved' ? 'APPROVED' : 'REJECTED';

        try {
            // Find proposal to get class_id
            const { data: proposal, error: propErr } = await supabase
                .from('proposals')
                .select('id, class_id')
                .eq('id', proposalId)
                .single();

            if (propErr || !proposal) {
                return res.status(404).json({ success: false, error: 'Proposta non trovata' });
            }

            // Authorization: verify that managerUserId is an active representative of this class
            const { data: rep, error: repErr } = await supabase
                .from('class_representatives')
                .select('id')
                .eq('class', proposal.class_id)
                .eq('user_id', managerUserId)
                .maybeSingle();

            if (repErr || !rep) {
                return res.status(403).json({
                    success: false,
                    error: 'Accesso negato: solo i rappresentanti ufficiali della classe possono approvare o rifiutare le proposte'
                });
            }

            const { error: updateErr } = await supabase.from('proposals').update({
                status: dbStatus
            }).eq('id', proposalId);

            if (updateErr) throw updateErr;

            return res.status(200).json({
                success: true,
                proposalId,
                status: dbStatus
            });
        } catch (e) {
            console.error('[ClassRep API] Manage proposal error:', e.message);
            return res.status(500).json({ success: false, error: 'Errore aggiornamento stato proposta' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
