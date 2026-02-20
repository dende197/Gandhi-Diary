const { handleCors } = require('../lib/helpers');
const { getGroq } = require('../lib/groq');
const { getSupabase } = require('../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    const { action } = req.query;

    try {
        switch (action) {
            case 'chat':
                return await handleChat(req, res);
            case 'ai-advice':
                return await handleAdvice(req, res);
            default:
                return res.status(400).json({ error: 'Azione non valida' });
        }
    } catch (e) {
        console.error(`AI Hub Error [${action}]:`, e.message);
        res.status(500).json({ success: false, error: e.message });
    }
};

async function handleChat(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const groq = getGroq();
    if (!groq) throw new Error('GROQ_API_KEY non configurata.');
    const { messages } = req.body;
    const openAIMessages = (messages || []).map(m => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.parts?.[0]?.text || m.content || ''
    }));
    const completion = await groq.chat.completions.create({
        messages: openAIMessages, model: 'openai/gpt-oss-120b', temperature: 0.7, max_completion_tokens: 2048, top_p: 0.95, stream: false
    });
    const aiText = completion.choices?.[0]?.message?.content || '';
    res.json({ candidates: [{ content: { parts: [{ text: aiText }], role: 'model' } }] });
}

async function handleAdvice(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const groq = getGroq();
    if (!groq) throw new Error('AI key mancante');
    const { stress, fatigue, sleep, load, taskCount, upcomingExams, recentHistory, profileId } = req.body;
    const severity = (stress >= 4 || fatigue >= 4 || sleep < 5) ? 'high' : (stress >= 3 || fatigue >= 3 || sleep < 6) ? 'medium' : 'low';
    const historyContext = (recentHistory || []).slice(0, 7).map(h => `${h.date}: stress=${h.stress}, stanchezza=${h.fatigue}, sonno=${h.sleep}h, carico=${h.load}`).join('\n');
    const prompt = `Sei un consulente per il benessere e la produttività di uno studente liceale italiano.\n\nDATI DI OGGI (anonimi):\n- Stress: ${stress}/5\n- Stanchezza mentale: ${fatigue}/5\n- Ore di sonno la notte scorsa: ${sleep}\n- Carico percepito: ${load}\n- Compiti in programma oggi: ${taskCount || 0}\n- Verifiche/interrogazioni imminenti: ${upcomingExams || 0}\n\nSTORICO ULTIMI GIORNI:\n${historyContext || 'Nessun dato precedente.'}\n\nRispondi SOLO con JSON (senza markdown):\n{\n  "advice": "...",\n  "studyPlan": "...",\n  "quote": "...",\n  "severity": "${severity}"\n}`;
    const completion = await groq.chat.completions.create({ messages: [{ role: 'user', content: prompt }], model: 'openai/gpt-oss-120b', temperature: 0.6, max_completion_tokens: 512, top_p: 1, stream: false });
    const rawText = completion.choices?.[0]?.message?.content || '';
    let parsed;
    try {
        const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleaned);
    } catch {
        parsed = { advice: 'Prenditi un momento per valutare le tue priorità di oggi.', studyPlan: 'Inizia con una sessione breve di 20 minuti su un argomento che conosci bene.', quote: 'Ogni passo conta, anche il più piccolo.', severity };
    }
    if (profileId) {
        const supabase = getSupabase();
        if (supabase) {
            const todayDate = new Date().toISOString().slice(0, 10);
            await supabase.from('mental_health_logs').update({ ai_advice: parsed.advice + '\n\n' + parsed.studyPlan, motivational_quote: parsed.quote }).eq('profile_id', profileId).eq('log_date', todayDate).catch(e => console.error('MH AI Save Error:', e.message));
        }
    }
    res.json({ success: true, ...parsed });
}
