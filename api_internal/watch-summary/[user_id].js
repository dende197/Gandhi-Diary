const { database, checked, todayRome, endpoint } = require('../../lib/backend');
const {loadArgoDashboard} = require('../../lib/argo-session');
const {
    handleCors, verifySessionToken, normalizeUserIdParam, createHeaders,
    decryptArgoPassword, debugLog, generatePid
} = require('../../lib/helpers');
const { getSupabase } = require('../../lib/supabase');
const {
    AdvancedArgo, getDashboard,
    extractGradesFromDashboard, extractAssenzeFromDashboard
} = require('../../lib/argo');

const ARGO_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h — same conservative TTL as cron-sync.js

const configuredAnnualHours = Number(process.env.SCHOOL_ANNUAL_HOURS);
const ORE_ANNO_SCOLASTICO = Number.isFinite(configuredAnnualHours) && configuredAnnualHours > 0 ? configuredAnnualHours : null;

// Mirrors ui.js:calcolaMedia() exactly — simple arithmetic mean of numeric grades.
function calcolaMedia(voti) {
    if (!voti || voti.length === 0) return null;
    const validi = voti
        .map(v => parseFloat((v.valore ?? v.value ?? '').toString().replace(',', '.')))
        .filter(n => !isNaN(n));
    if (validi.length === 0) return null;
    return validi.reduce((a, b) => a + b, 0) / validi.length;
}

/**
 * Picks the single soonest upcoming verifica from manual_verifiche (the user-
 * created entries stored in Supabase, same source the phone app uses).
 *
 * We intentionally do NOT use extractVerificheFromDashboard() because its
 * parseDateFromText() heuristic pushes past dates into the next year, which
 * generates phantom tests 200+ days in the future when no real test exists.
 */
function pickNextVerifica(manualVerifiche) {
    const todayMidnight = new Date(`${todayRome()}T00:00:00Z`);

    const upcoming = (manualVerifiche || [])
        .filter(v => !v.done) // skip completed entries
        .map(v => {
            // manual_verifiche table uses `date` (not `data`) and `subject` (not `materia`)
            const dateStr = v.date || v.data || '';
            const d = new Date(dateStr);
            return { ...v, _d: d, _dateStr: dateStr };
        })
        .filter(v => !isNaN(v._d.getTime()) && v._d >= todayMidnight)
        .sort((a, b) => a._d - b._d);

    if (upcoming.length === 0) return null;

    const next = upcoming[0];
    const giorniMancanti = Math.round((next._d - todayMidnight) / 86400000);

    return {
        materia: next.subject || next.materia || '',
        descrizione: next.args || next.text || '',
        tipo: next.type || next.tipo || 'unknown',
        data: next._dateStr,
        giorniMancanti
    };
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const { user_id } = req.query;
    const userId = normalizeUserIdParam(user_id);

    if (!(await verifySessionToken(req, userId))) {
        return res.status(403).json({ success: false, error: 'Non autorizzato' });
    }

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase non configurato' });

    try {
        const {row:user,dashboard:dashboardData,usedCache} = await loadArgoDashboard(userId);

        // ── Extract grades & absences from Argo dashboard ──
        const grades = extractGradesFromDashboard(dashboardData);
        const assenze = extractAssenzeFromDashboard(dashboardData,{schedule:user.class_schedule});

        const media = calcolaMedia(grades);

        // ── Compute composite absence hours ──
        // The raw oreAssenzaTotali already includes full-day absences, ritardi, and uscite
        // (computed by extractAssenzeFromDashboard with assembly-day modifiers).
        // We add the percentage against the total yearly hours so the watch can display it.
        const oreAssenzaTotali = typeof assenze.oreAssenzaTotali === 'number' ? assenze.oreAssenzaTotali : 0;
        const percentualeAssenze = ORE_ANNO_SCOLASTICO ? Math.round((oreAssenzaTotali / ORE_ANNO_SCOLASTICO) * 1000) / 10 : null; // one decimal

        // ── Fetch manual verifiche from Supabase (same source as the phone) ──
        const manualVerifiche = await checked(database().from('manual_verifiche').select('*').eq('user_id',userId));

        const prossimaVerifica = pickNextVerifica(manualVerifiche);

        // Build listAssenze array for detailed watch screens ({ data, tipo, ore, giustificata })
        const listAssenze = [
            ...(assenze.assenze || []),
            ...(assenze.ritardi || []),
            ...(assenze.uscite || [])
        ].map(item => ({
            data: item.data || '',
            tipo: item.tipo || 'assenza',
            ore: typeof item.oreEffettive === 'number' ? item.oreEffettive : 0,
            giustificata: Boolean(item.giustificata)
        })).sort((a, b) => new Date(b.data) - new Date(a.data));

        // Build allVerifiche array for detailed watch screens ({ materia, descrizione, data, giorniMancanti })
        const todayMidnight = new Date(`${todayRome()}T00:00:00Z`);
        const allVerifiche = (manualVerifiche || [])
            .filter(v => !v.done)
            .map(v => {
                const dateStr = v.date || v.data || '';
                const d = new Date(dateStr);
                const giorniMancanti = !isNaN(d.getTime()) ? Math.round((d - todayMidnight) / 86400000) : 0;
                return {
                    materia: v.subject || v.materia || '',
                    descrizione: v.args || v.text || '',
                    tipo: v.type || v.tipo || 'unknown',
                    data: dateStr,
                    giorniMancanti
                };
            })
            .filter(v => v.giorniMancanti >= 0)
            .sort((a, b) => new Date(a.data) - new Date(b.data));

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.json({
            success: true,
            data: {
                media: media !== null ? Math.round(media * 100) / 100 : null,
                gradesCount: grades.length,
                grades: grades,
                voti: grades,
                assenze: {
                    oreTotali: Math.round(oreAssenzaTotali * 10) / 10,
                    percentuale: percentualeAssenze,
                    oreAnnoScolastico: ORE_ANNO_SCOLASTICO,
                    giorni: assenze.totaleAssenze || 0,
                    ritardi: assenze.totaleRitardi || 0,
                    uscite: assenze.totaleUscite || 0,
                    daGiustificare: assenze.daGiustificare || 0
                },
                listAssenze,
                prossimaVerifica,
                allVerifiche,
                verificheProgrammate: manualVerifiche.filter(v => !v.done).length,
                lastSync: new Date().toISOString(),
                usedCache
            }
        });
    } catch (e) {
        console.error('[Watch Summary] failed:', e.message);
        throw e;
    }
};

module.exports = endpoint(module.exports);
