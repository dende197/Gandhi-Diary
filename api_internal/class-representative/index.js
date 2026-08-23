const { getSupabase } = require('../../lib/supabase');
const { handleCors, getRequestBody, normalizeUserIdParam } = require('../../lib/helpers');

// Fallback in-memory cache if database is temporarily unavailable
const memoryStore = {
    representativesByClass: {}, // { "5A": [ { userId, name, class, updatedAt } ] }
    proposalsByClass: {}        // { "5A": [ { id, type, class_id, target_date, reason, ... } ] }
};

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const supabase = getSupabase();
    const body = getRequestBody(req);
    const action = req.query.action || body.action || (req.method === 'POST' ? 'get' : 'get');
    const rawClass = req.query.class || body.class || '';
    const className = String(rawClass).trim().toUpperCase();

    // ── 1. GET REPRESENTATIVES & PROPOSALS ───────────────────────────────────
    if (req.method === 'GET') {
        if (!className) {
            return res.status(200).json({
                success: true,
                representatives: memoryStore.representativesByClass,
                proposals: memoryStore.proposalsByClass
            });
        }

        let reps = memoryStore.representativesByClass[className] || [];
        let props = memoryStore.proposalsByClass[className] || [];

        if (supabase) {
            try {
                // Fetch representatives for this class
                const { data: dbReps, error: repsError } = await supabase
                    .from('class_representatives')
                    .select('*')
                    .eq('class', className);

                if (!repsError && dbReps) {
                    reps = dbReps.map(r => ({
                        id: r.id,
                        userId: r.user_id,
                        user_id: r.user_id,
                        name: r.name,
                        class: r.class,
                        updatedAt: r.updated_at || r.created_at
                    }));
                }

                // Fetch proposals for this class
                const { data: dbProps, error: propsError } = await supabase
                    .from('proposals')
                    .select('*')
                    .eq('class_id', className)
                    .order('created_at', { ascending: false });

                if (!propsError && dbProps) {
                    const propIds = dbProps.map(p => p.id);
                    let allVotes = [];

                    if (propIds.length > 0) {
                        const { data: dbVotes } = await supabase
                            .from('proposal_votes')
                            .select('*')
                            .in('proposal_id', propIds);
                        if (dbVotes) allVotes = dbVotes;
                    }

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
            } catch (err) {
                console.warn('[ClassRep API] Supabase fetch error, fallback to memory:', err.message);
            }
        }

        return res.status(200).json({
            success: true,
            class: className,
            representatives: reps,
            proposals: props
        });
    }

    // ── 2. TOGGLE / SET CLASS REPRESENTATIVE (MAX 2 PER CLASS) ───────────────
    if (req.method === 'POST' && action === 'set_representative') {
        const body = getRequestBody(req);
        const targetClass = (body.class || className || '').trim().toUpperCase();
        const userId = normalizeUserIdParam(body.userId || body.user_id);
        const userName = (body.userName || body.name || 'Studente').trim();
        const enable = !!body.enable;

        if (!targetClass || !userId) {
            return res.status(400).json({ success: false, error: 'Classe e ID utente mancanti' });
        }

        if (!memoryStore.representativesByClass[targetClass]) {
            memoryStore.representativesByClass[targetClass] = [];
        }

        let currentReps = memoryStore.representativesByClass[targetClass];

        if (supabase) {
            try {
                const { data: dbReps } = await supabase
                    .from('class_representatives')
                    .select('*')
                    .eq('class', targetClass);
                if (dbReps) {
                    currentReps = dbReps.map(r => ({
                        id: r.id,
                        userId: r.user_id,
                        user_id: r.user_id,
                        name: r.name,
                        class: r.class,
                        updatedAt: r.updated_at
                    }));
                }
            } catch (err) {
                console.warn('[ClassRep API] DB fetch reps failed:', err.message);
            }
        }

        if (enable) {
            const isAlreadyRep = currentReps.some(r => String(r.userId || r.user_id) === String(userId));
            if (!isAlreadyRep) {
                // Enforce limit: Max 2 Representatives per class
                if (currentReps.length >= 2) {
                    return res.status(403).json({
                        success: false,
                        limitReached: true,
                        error: 'Limite massimo raggiunto (2/2 Rappresentanti attivi per questa classe). Uno dei rappresentanti attuali deve prima disattivare il proprio ruolo.'
                    });
                }

                const newRep = {
                    class: targetClass,
                    user_id: userId,
                    name: userName,
                    updated_at: new Date().toISOString()
                };

                if (supabase) {
                    try {
                        await supabase.from('class_representatives').upsert(newRep, { onConflict: 'user_id' });
                    } catch (e) {
                        console.warn('[ClassRep API] DB rep insert error:', e.message);
                    }
                }
                currentReps.push({ ...newRep, userId });
            }
        } else {
            // Disable representative role
            currentReps = currentReps.filter(r => String(r.userId || r.user_id) !== String(userId));
            if (supabase) {
                try {
                    await supabase.from('class_representatives').delete().eq('user_id', userId).eq('class', targetClass);
                } catch (e) {
                    console.warn('[ClassRep API] DB rep delete error:', e.message);
                }
            }
        }

        memoryStore.representativesByClass[targetClass] = currentReps;

        return res.status(200).json({
            success: true,
            class: targetClass,
            representatives: currentReps,
            isRepresentative: enable
        });
    }

    // ── 3. CREATE PROPOSAL (ASSEMBLEA O SPOSTAMENTO VERIFICA) ─────────────────
    if (req.method === 'POST' && action === 'create_proposal') {
        const body = getRequestBody(req);
        const targetClass = (body.class || className || '').trim().toUpperCase();
        const { type, targetDate, reason, originalDate, subject, duration, authorId, authorName } = body;

        if (!targetClass || !type || !targetDate || !reason) {
            return res.status(400).json({ success: false, error: 'Dati proposta incompleti' });
        }

        const dbType = (type === 'assembly' || type === 'ASSEMBLY') ? 'ASSEMBLY' : 'EXAM_MOVE';
        const targetIso = new Date(targetDate + (targetDate.includes('T') ? '' : 'T08:00:00Z')).toISOString();
        const origIso = originalDate ? new Date(originalDate + (originalDate.includes('T') ? '' : 'T08:00:00Z')).toISOString() : null;

        let createdId = null;

        if (supabase) {
            try {
                const { data: inserted, error: insErr } = await supabase
                    .from('proposals')
                    .insert([{
                        class_id: targetClass,
                        creator_user_id: String(authorId || 'utente'),
                        creator_name: String(authorName || 'Studente'),
                        type: dbType,
                        target_date: targetIso,
                        original_date: origIso,
                        subject: subject || null,
                        duration: duration || '2 ore',
                        reason: reason.trim(),
                        status: 'PENDING'
                    }])
                    .select()
                    .single();

                if (inserted && !insErr) {
                    createdId = inserted.id;
                    // Automatically add creator's ACCEPT vote
                    await supabase.from('proposal_votes').upsert({
                        proposal_id: createdId,
                        user_id: String(authorId || 'utente'),
                        user_name: String(authorName || 'Studente'),
                        vote: 'ACCEPT',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'proposal_id,user_id' });
                }
            } catch (e) {
                console.warn('[ClassRep API] DB insert proposal error:', e.message);
            }
        }

        const fallbackProp = {
            id: createdId || ('prop_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
            type: dbType === 'ASSEMBLY' ? 'assembly' : 'exam_reschedule',
            class: targetClass,
            class_id: targetClass,
            targetDate: targetDate.split('T')[0],
            target_date: targetIso,
            originalDate: originalDate ? originalDate.split('T')[0] : null,
            original_date: origIso,
            subject: subject || null,
            duration: duration || '2 ore',
            reason: reason.trim(),
            authorId: authorId || 'utente',
            author_id: authorId || 'utente',
            authorName: authorName || 'Studente',
            status: 'pending',
            votes: {
                accept: [String(authorId || 'utente')],
                decline: [],
                alternatives: []
            },
            created_at: new Date().toISOString()
        };

        if (!memoryStore.proposalsByClass[targetClass]) {
            memoryStore.proposalsByClass[targetClass] = [];
        }
        memoryStore.proposalsByClass[targetClass].unshift(fallbackProp);

        return res.status(201).json({
            success: true,
            proposal: fallbackProp
        });
    }

    // ── 4. VOTE ON PROPOSAL ──────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'vote') {
        const body = getRequestBody(req);
        const targetClass = (body.class || className || '').trim().toUpperCase();
        const { proposalId, userId, userName, voteType, alternativeDate, note } = body;

        if (!proposalId || !userId || !voteType) {
            return res.status(400).json({ success: false, error: 'Parametri di voto mancanti' });
        }

        let dbVote = 'ACCEPT';
        if (voteType === 'decline') dbVote = 'DECLINE';
        if (voteType === 'alternative') dbVote = 'COUNTER_PROPOSE';

        const counterIso = alternativeDate 
            ? new Date(alternativeDate + (alternativeDate.includes('T') ? '' : 'T08:00:00Z')).toISOString() 
            : null;

        if (supabase) {
            try {
                await supabase.from('proposal_votes').upsert({
                    proposal_id: proposalId,
                    user_id: String(userId),
                    user_name: String(userName || 'Studente'),
                    vote: dbVote,
                    counter_proposed_date: counterIso,
                    note: note || '',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'proposal_id,user_id' });
            } catch (e) {
                console.warn('[ClassRep API] DB upsert vote error:', e.message);
            }
        }

        return res.status(200).json({
            success: true,
            proposalId,
            vote: dbVote
        });
    }

    // ── 5. REPRESENTATIVE MANAGEMENT ACTION (APPROVE / REJECT) ───────────────
    if (req.method === 'POST' && action === 'manage_proposal') {
        const body = getRequestBody(req);
        const { proposalId, status } = body;

        if (!proposalId || !status) {
            return res.status(400).json({ success: false, error: 'ID proposta o status mancante' });
        }

        const dbStatus = status === 'approved' ? 'APPROVED' : 'REJECTED';

        if (supabase) {
            try {
                await supabase.from('proposals').update({
                    status: dbStatus
                }).eq('id', proposalId);
            } catch (e) {
                console.warn('[ClassRep API] DB update proposal status error:', e.message);
            }
        }

        return res.status(200).json({
            success: true,
            proposalId,
            status: dbStatus
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
