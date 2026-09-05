const axios = require('axios');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const { handleCors, USER_AGENT, getRequestBody, verifySessionToken, normalizeUserId, isSessionSecurityConfigured } = require('../../lib/helpers');
const { hasGeminiKey, generateWithGemini } = require('../../lib/gemini');
const { getGroq } = require('../../lib/groq');
const { getSintesiFromCache, setSintesiInCache } = require('../../lib/sintesiCache');

// In-memory rate limiting map: IP -> array of request timestamps
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15;
const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 MB

function checkRateLimit(clientIp) {
    const now = Date.now();
    const timestamps = rateLimitMap.get(clientIp) || [];
    const recent = timestamps.filter(t => (now - t) < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
        return false;
    }
    recent.push(now);
    rateLimitMap.set(clientIp, recent);
    // Cleanup stale entries
    if (rateLimitMap.size > 1000) {
        for (const [ip, ts] of rateLimitMap.entries()) {
            if (!ts.some(t => (now - t) < RATE_LIMIT_WINDOW_MS)) rateLimitMap.delete(ip);
        }
    }
    return true;
}

// Returns the allowed hostname for circolari links (derived from SCHOOL_CIRCOLARI_URL).
function _getAllowedHostname() {
    try {
        const base = process.env.SCHOOL_CIRCOLARI_URL || 'https://www.liceogandhi.edu.it/';
        return new URL(base).hostname.toLowerCase();
    } catch {
        return 'www.liceogandhi.edu.it';
    }
}

// Validates that `link` is a safe HTTPS URL pointing to the school's own domain.
function isAllowedCircolariLink(link) {
    try {
        const parsed = new URL(link);
        if (parsed.protocol !== 'https:') return false;
        const allowed = _getAllowedHostname();
        const baseAllowed = allowed.replace(/^www\./, '');
        const host = parsed.hostname.toLowerCase();
        return host === allowed || host === baseAllowed || host === 'www.' + baseAllowed;
    } catch {
        return false;
    }
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Client IP rate limiting
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1').split(',')[0].trim();
    if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
            success: false,
            error: 'Troppe richieste di sintesi. Attendi un minuto prima di riprovare.',
            errorType: 'rateLimit'
        });
    }

    const body = getRequestBody(req);

    // Session verification: log warning but do not block if token is missing/invalid.
    // IP-level rate limiting and SSRF domain whitelisting protect against abuse.
    // This avoids blocking valid users after security updates.
    if (isSessionSecurityConfigured()) {
        const sessionUserId = normalizeUserId(req.headers['x-user-id'] || body.userId || '');
        if (!sessionUserId || !verifySessionToken(req, sessionUserId)) {
            console.warn(`[Sintesi] Session verification check failed for userId="${sessionUserId}" from IP=${clientIp}. Allowing request (rate-limited).`);
        }
    }

    const { link, id } = body;
    if (!link) return res.status(400).json({ success: false, error: 'Link mancante', errorType: 'badRequest' });

    // SSRF protection: only allow links from the configured school domain over HTTPS.
    if (!isAllowedCircolariLink(link)) {
        return res.status(400).json({ success: false, error: 'Link non consentito', errorType: 'badRequest' });
    }

    // Cache check
    if (id) {
        const cached = getSintesiFromCache(id);
        if (cached) return res.json({ success: true, sintesi: cached, id, cached: true });
    }

    try {
        let textContent = '';
        let finalPdfUrl = link;

        const safeAxiosOptions = {
            timeout: 12000,
            maxRedirects: 3,
            maxContentLength: MAX_PDF_BYTES,
            beforeRedirect: (options) => {
                const redirectUrl = options.href || `${options.protocol}//${options.hostname}${options.path}`;
                if (!isAllowedCircolariLink(redirectUrl)) {
                    throw new Error(`SSRF Blocked: redirect to non-whitelisted host ${redirectUrl}`);
                }
            }
        };

        if (!link.toLowerCase().endsWith('.pdf')) {
            const htmlRes = await axios.get(link, safeAxiosOptions);
            const $ = cheerio.load(htmlRes.data);
            const pdfLinks = [];
            $('#attachmentsList a[href*=".pdf"]').each((i, el) => {
                pdfLinks.push($(el).attr('href'));
            });
            if (pdfLinks.length > 0) {
                const bestLink = pdfLinks.find(url => url.toLowerCase().includes('circolare') || url.toLowerCase().includes('comunicato')) || pdfLinks[0];
                const schoolBase = `https://${_getAllowedHostname()}`;
                const resolvedUrl = (bestLink.startsWith('http') ? bestLink : `${schoolBase}${bestLink.startsWith('/') ? bestLink : '/' + bestLink}`).trim();
                // Only follow PDF links that stay within the school's own domain.
                if (isAllowedCircolariLink(resolvedUrl)) {
                    finalPdfUrl = resolvedUrl;
                } else {
                    textContent = $('article, .entry-content, .content').text().trim() || $('body').text().trim();
                }
            } else {
                textContent = $('article, .entry-content, .content').text().trim() || $('body').text().trim();
            }
        }

        if (finalPdfUrl.toLowerCase().endsWith('.pdf') && !textContent) {
            try {
                const pdfRes = await axios.get(finalPdfUrl, {
                    ...safeAxiosOptions,
                    headers: { 'User-Agent': USER_AGENT, 'Referer': 'https://www.liceogandhi.edu.it/' },
                    responseType: 'arraybuffer',
                    timeout: 15000
                });
                const data = await pdfParse(pdfRes.data);
                textContent = data.text;
            } catch (pdfErr) {
                console.error('PDF Error:', pdfErr.message);
                return res.status(500).json({ success: false, error: 'Impossibile scaricare il documento PDF.', errorType: 'pdfError' });
            }
        }

        if (!textContent || textContent.trim().length < 20) {
            return res.status(400).json({ success: false, error: 'Nessun contenuto testuale trovato nella circolare.', errorType: 'noContent' });
        }

        const prompt = `Sei un assistente per studenti del Liceo Gandhi. Riassumi questa circolare scolastica in massimo 4 punti elenco brevi, molto chiari e pratici. 
REGOLE DI FORMATTAZIONE:
- Usa il formato **Markdown**.
- Usa **grassetto** per date, scadenze, classi o orari importanti.
- Usa punti elenco standard (es. - o *).
- Non aggiungere introduzioni come "Ecco il riassunto".

Circolare: "${textContent.substring(0, 7000)}"`;

        let sintesi = null;
        let lastError = null;

        // 1. PRIMARY AI: Google Gemini (the original circular synthesis engine)
        if (hasGeminiKey()) {
            console.log('[Sintesi] Generating summary with Google Gemini...');
            const geminiRes = await generateWithGemini({
                prompt,
                temperature: 0.4,
                maxTokens: 1024
            });

            if (geminiRes.success && geminiRes.text) {
                sintesi = geminiRes.text;
                console.log(`[Sintesi] Google Gemini (${geminiRes.model}) summary generated successfully.`);
            } else {
                console.warn('[Sintesi] Google Gemini failed, attempting fallback...', geminiRes.error);
                lastError = new Error(geminiRes.error || 'Gemini error');
                lastError.status = geminiRes.status;
            }
        }

        // 2. FALLBACK AI: Groq (if Gemini is not configured or failed)
        if (!sintesi) {
            const groq = getGroq();
            if (groq) {
                console.log('[Sintesi] Generating summary with Groq fallback...');
                const groqModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'];

                for (const gModel of groqModels) {
                    try {
                        const completion = await groq.chat.completions.create({
                            messages: [{ role: 'user', content: prompt }],
                            model: gModel,
                            temperature: 0.5,
                            max_completion_tokens: 1024,
                            top_p: 1,
                            stream: false
                        });

                        const text = completion.choices?.[0]?.message?.content;
                        if (text && text.trim().length > 0) {
                            sintesi = text.trim();
                            console.log(`[Sintesi] Groq (${gModel}) summary generated successfully.`);
                            break;
                        }
                    } catch (gErr) {
                        lastError = gErr;
                        const status = gErr.status || gErr.response?.status;
                        console.warn(`[Sintesi] Groq model ${gModel} failed (status: ${status}):`, gErr.message);
                        if (status === 404) continue;
                        break;
                    }
                }
            }
        }

        // 3. Neither AI succeeded
        if (!sintesi) {
            if (!hasGeminiKey() && !process.env.GROQ_API_KEY) {
                return res.status(500).json({
                    success: false,
                    error: 'Nessuna chiave AI configurata sul server (configura GEMINI_API_KEY_SINTESI o GROQ_API_KEY su Vercel).',
                    errorType: 'missingAiKey'
                });
            }

            const status = lastError?.status || lastError?.response?.status;
            if (status === 429) {
                return res.status(429).json({
                    success: false,
                    error: 'Quota AI temporaneamente esaurita. Riprova tra qualche minuto.',
                    errorType: 'quotaExceeded'
                });
            }

            return res.status(500).json({
                success: false,
                error: lastError?.message || 'Errore durante la generazione della sintesi con AI.',
                errorType: 'aiError'
            });
        }

        // Save in cache
        if (id && sintesi && !sintesi.includes('Impossibile')) {
            setSintesiInCache(id, sintesi);
        }

        return res.json({ success: true, sintesi, id });

    } catch (error) {
        console.error('Synthesis Error:', error.message);
        res.status(500).json({ success: false, error: error.message, errorType: 'serverError' });
    }
};
