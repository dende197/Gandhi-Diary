const { handleCors } = require('../../lib/helpers');
const { getGroq } = require('../../lib/groq');
const { getSupabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const groq = getGroq();
    if (!groq) return res.status(500).json({ success: false, error: 'AI key mancante' });

    const { stress, fatigue, sleep, load, taskCount, upcomingExams, recentHistory, profileId } = req.body;

    const severity = (stress >= 4 || fatigue >= 4 || sleep < 5) ? 'high' :
        (stress >= 3 || fatigue >= 3 || sleep < 6) ? 'medium' : 'low';

    const historyContext = (recentHistory || []).slice(0, 7).map(h =>
        `${h.date}: stress=${h.stress}, stanchezza=${h.fatigue}, sonno=${h.sleep}h, carico=${h.load}`
    ).join('\n');

    const prompt = `Sei un consulente per il benessere e la produttività di uno studente liceale italiano.

DATI DI OGGI (anonimi):
- Stress: ${stress}/5
- Stanchezza mentale: ${fatigue}/5
- Ore di sonno la notte scorsa: ${sleep}
- Carico percepito: ${load}
- Compiti in programma oggi: ${taskCount || 0}
- Verifiche/interrogazioni imminenti: ${upcomingExams || 0}

STORICO ULTIMI GIORNI:
${historyContext || 'Nessun dato precedente.'}

Rispondi SOLO con JSON (senza markdown):
{
  "advice": "...",
  "studyPlan": "...",
  "quote": "...",
  "severity": "${severity}"
}`;

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'openai/gpt-oss-120b',
            temperature: 0.6,
            max_completion_tokens: 512,
            top_p: 1,
            stream: false
        });

        const rawText = completion.choices?.[0]?.message?.content || '';
        let parsed;
        try {
            const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            parsed = JSON.parse(cleaned);
        } catch {
            parsed = {
                advice: 'Prenditi un momento per valutare le tue priorità di oggi.',
                studyPlan: 'Inizia con una sessione breve di 20 minuti su un argomento che conosci bene.',
                quote: 'Ogni passo conta, anche il più piccolo.',
                severity
            };
        }

        // Save to Supabase if profileId provided
        if (profileId) {
            const supabase = getSupabase();
            if (supabase) {
                const todayDate = new Date().toISOString().slice(0, 10);
                await supabase.from('mental_health_logs')
                    .update({
                        ai_advice: parsed.advice + '\n\n' + parsed.studyPlan,
                        motivational_quote: parsed.quote
                    })
                    .eq('profile_id', profileId)
                    .eq('log_date', todayDate)
                    .catch(e => console.error('MH AI Save Error:', e.message));
            }
        }

        res.json({ success: true, ...parsed });
    } catch (error) {
        console.error('MH AI Error:', error.message);
        res.status(error.status || 500).json({
            success: false,
            advice: 'Concentrati su ciò che puoi controllare oggi.',
            studyPlan: 'Fai una sessione breve di ripasso e valuta come ti senti dopo.',
            quote: 'La gentilezza verso te stesso è la prima forma di disciplina.',
            severity: 'medium'
        });
    }
}
