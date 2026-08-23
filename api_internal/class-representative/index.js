const { getSupabase } = require('../../lib/supabase');
const { handleCors, getRequestBody, normalizeUserIdParam } = require('../../lib/helpers');

// Fallback in-memory cache if database table is not yet migrated
const memoryStore = {
    representativesByClass: {}, // { "5A": [ { userId, name, class, updatedAt } ] }
    proposalsByClass: {}        // { "5A": [ { id, type, class, targetDate, reason, ... } ] }
};

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const supabase = getSupabase();
    const action = req.query.action || (req.body && req.body.action) || 'get';
    const className = (req.query.class || (req.body && req.body.class) || '').trim().toUpperCase();

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
                const { data: dbReps } = await supabase
                    .from('class_representatives')
                    .select('*')
                    .eq('class', className);
                if (dbReps && dbReps.length > 0) reps = dbReps;

                const { data: dbProps } = await supabase
                    .from('class_proposals')
                    .select('*')
                    .eq('class', className)
                    .order('created_at', { ascending: false });
                if (dbProps && dbProps.length > 0) props = dbProps;
            } catch (err) {
                console.warn('[ClassRep API] Supabase fallback to memory:', err.message);
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
                if (dbReps) currentReps = dbReps;
            } catch (err) {
                console.warn('[ClassRep API] DB fetch failed:', err.message);
            }
        }

        if (enable) {
            // Check if already active
            const isAlreadyRep = currentReps.some(r => String(r.userId || r.user_id) === String(userId));
            if (!isAlreadyRep) {
                // Rule: Max 2 Representatives per class
                if (currentReps.length >= 2) {
                    return res.status(403).json({
                        success: false,
                        limitReached: true,
                        error: 'Limite massimo raggiunto (2/2 Rappresentanti attivi per questa classe). Uno dei rappresentanti attuali deve prima disattivare il proprio ruolo.'
                    });
                }

                const newRep = {
                    userId,
                    user_id: userId,
                    name: userName,
                    class: targetClass,
                    updatedAt: new Date().toISOString(),
                    created_at: new Date().toISOString()
                };
                currentReps.push(newRep);

                if (supabase) {
                    try {
                        await supabase.from('class_representatives').upsert(newRep, { onConflict: 'user_id' });
                    } catch (e) {
                        console.warn('[ClassRep API] DB rep insert error:', e.message);
                    }
                }
            }
        } else {
            // Disable role
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

        const newProposal = {
            id: 'prop_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            type, // 'assembly' | 'exam_reschedule'
            class: targetClass,
            targetDate,
            target_date: targetDate,
            originalDate: originalDate || null,
            original_date: originalDate || null,
            subject: subject || null,
            duration: duration || '2 ore',
            reason: reason.trim(),
            authorId: authorId || 'utente',
            author_id: authorId || 'utente',
            authorName: authorName || 'Studente',
            author_name: authorName || 'Studente',
            status: 'pending', // 'pending' | 'approved' | 'rejected'
            votes: {
                accept: [authorId || 'utente'],
                decline: [],
                alternatives: []
            },
            created_at: new Date().toISOString()
        };

        if (!memoryStore.proposalsByClass[targetClass]) {
            memoryStore.proposalsByClass[targetClass] = [];
        }
        memoryStore.proposalsByClass[targetClass].unshift(newProposal);

        if (supabase) {
            try {
                await supabase.from('class_proposals').insert([newProposal]);
            } catch (e) {
                console.warn('[ClassRep API] DB proposal insert error:', e.message);
            }
        }

        return res.status(201).json({
            success: true,
            proposal: newProposal
        });
    }

    // ── 4. VOTE ON PROPOSAL ──────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'vote') {
        const body = getRequestBody(req);
        const targetClass = (body.class || className || '').trim().toUpperCase();
        const { proposalId, userId, voteType, alternativeDate, note } = body;

        if (!targetClass || !proposalId || !userId || !voteType) {
            return res.status(400).json({ success: false, error: 'Parametri di voto mancanti' });
        }

        const props = memoryStore.proposalsByClass[targetClass] || [];
        const prop = props.find(p => p.id === proposalId);

        if (!prop) {
            return res.status(404).json({ success: false, error: 'Proposta non trovata' });
        }

        if (!prop.votes) prop.votes = { accept: [], decline: [], alternatives: [] };
        if (!Array.isArray(prop.votes.accept)) prop.votes.accept = [];
        if (!Array.isArray(prop.votes.decline)) prop.votes.decline = [];
        if (!Array.isArray(prop.votes.alternatives)) prop.votes.alternatives = [];

        // Remove previous vote
        prop.votes.accept = prop.votes.accept.filter(id => id !== userId);
        prop.votes.decline = prop.votes.decline.filter(id => id !== userId);
        prop.votes.alternatives = prop.votes.alternatives.filter(a => a.userId !== userId);

        if (voteType === 'accept') {
            prop.votes.accept.push(userId);
        } else if (voteType === 'decline') {
            prop.votes.decline.push(userId);
        } else if (voteType === 'alternative') {
            prop.votes.alternatives.push({
                userId,
                date: alternativeDate || prop.targetDate,
                note: note || ''
            });
        }

        if (supabase) {
            try {
                await supabase.from('class_proposals').update({ votes: prop.votes }).eq('id', proposalId);
            } catch (e) {
                console.warn('[ClassRep API] DB vote update error:', e.message);
            }
        }

        return res.status(200).json({
            success: true,
            proposal: prop
        });
    }

    // ── 5. REPRESENTATIVE MANAGEMENT ACTION (APPROVE / REJECT) ───────────────
    if (req.method === 'POST' && action === 'manage_proposal') {
        const body = getRequestBody(req);
        const targetClass = (body.class || className || '').trim().toUpperCase();
        const { proposalId, status } = body;

        const props = memoryStore.proposalsByClass[targetClass] || [];
        const prop = props.find(p => p.id === proposalId);

        if (!prop) {
            return res.status(404).json({ success: false, error: 'Proposta non trovata' });
        }

        prop.status = status === 'approved' ? 'approved' : 'rejected';
        prop.managed_at = new Date().toISOString();

        if (supabase) {
            try {
                await supabase.from('class_proposals').update({
                    status: prop.status,
                    managed_at: prop.managed_at
                }).eq('id', proposalId);
            } catch (e) {
                console.warn('[ClassRep API] DB manage update error:', e.message);
            }
        }

        return res.status(200).json({
            success: true,
            proposal: prop
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
