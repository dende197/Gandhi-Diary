/**
 * Google Calendar API — Handler Vercel Serverless
 * Gestisce: auth, callback, status, sync manuale, disconnect, events
 *
 * Nota: La sincronizzazione automatica (cron) è disponibile solo su Render (server.js).
 */

const gcal = require('../../lib/google-calendar');
const { getSupabase } = require('../../lib/supabase');
const { handleCors, createHeaders } = require('../../lib/helpers');

// Importa le funzioni di estrazione Argo da server.js (solo su Render)
// Su Vercel, l'utente deve fornire le task direttamente nel body della sync
let extractHomeworkSafe, extractPromemoria;
try {
    // Tentativo di import (funziona solo su Render o in ambienti Node tradizionali)
    const argoLib = require('../argo-extract');
    extractHomeworkSafe = argoLib.extractHomeworkSafe;
    extractPromemoria = argoLib.extractPromemoria;
} catch (e) {
    // Su Vercel, le funzioni Argo non sono disponibili come modulo standalone
    extractHomeworkSafe = null;
    extractPromemoria = null;
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const action = req.query.action || '';
    const supabase = getSupabase();

    // ============= GET /api/calendar/auth =============
    if (req.method === 'GET' && action === 'auth') {
        const { profile_id } = req.query;
        if (!profile_id) return res.status(400).json({ success: false, error: 'profile_id obbligatorio' });

        try {
            const state = Buffer.from(JSON.stringify({ profile_id })).toString('base64');
            const authUrl = gcal.getAuthUrl(state);
            return res.redirect(authUrl);
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // ============= GET /api/calendar/callback =============
    if (req.method === 'GET' && action === 'callback') {
        const { code, state, error } = req.query;

        if (error) {
            return res.status(400).send(`<h3>Accesso negato: ${error}</h3><p>Puoi chiudere questa pagina.</p>`);
        }

        if (!code || !state) {
            return res.status(400).send('<h3>Parametri mancanti</h3>');
        }

        let profileId;
        try {
            profileId = JSON.parse(Buffer.from(state, 'base64').toString('utf-8')).profile_id;
        } catch (e) {
            return res.status(400).send('<h3>Stato non valido</h3>');
        }

        try {
            const tokens = await gcal.exchangeCodeForTokens(code);

            if (!tokens.refresh_token) {
                return res.status(400).send(`
                    <h3>⚠️ Refresh token non ricevuto</h3>
                    <p>Revoca l'accesso all'app Google Calendar
                    (<a href="https://myaccount.google.com/permissions">qui</a>) e riprova.</p>
                `);
            }

            if (!supabase) return res.status(503).send('<h3>Database non disponibile</h3>');

            const { error: dbError } = await supabase
                .from('calendar_tokens')
                .upsert({
                    profile_id: profileId,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expiry_date: tokens.expiry_date || null,
                    calendar_id: 'primary',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'profile_id' });

            if (dbError) throw dbError;

            return res.send(`
                <!DOCTYPE html>
                <html lang="it">
                <head><meta charset="UTF-8"><title>G-Connect — Google Calendar</title>
                <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f0f15;color:#fff;}
                .card{text-align:center;padding:40px;background:#1a1a2e;border-radius:16px;max-width:400px;}
                h2{color:#4CAF50;}p{color:#ccc;}</style></head>
                <body><div class="card">
                    <h2>✅ Google Calendar collegato!</h2>
                    <p>I tuoi compiti verranno sincronizzati automaticamente alle 14:00 e alle 00:00.</p>
                    <p style="margin-top:24px;font-size:13px;color:#888;">Puoi chiudere questa pagina.</p>
                </div></body></html>
            `);

        } catch (e) {
            console.error('[Calendar] Callback error:', e.message);
            return res.status(500).send(`<h3>Errore: ${e.message}</h3>`);
        }
    }

    // ============= GET /api/calendar/status =============
    if (req.method === 'GET' && action === 'status') {
        const { profile_id } = req.query;
        if (!profile_id) return res.status(400).json({ success: false, error: 'profile_id obbligatorio' });
        if (!supabase) return res.status(503).json({ success: false, error: 'Database non disponibile' });

        try {
            const [{ data: tokenRow }, { data: syncRow }] = await Promise.all([
                supabase.from('calendar_tokens').select('calendar_id, updated_at').eq('profile_id', profile_id).maybeSingle(),
                supabase.from('calendar_sync_jobs').select('active, last_sync, last_sync_created, last_sync_errors, sync_errors_count').eq('profile_id', profile_id).maybeSingle()
            ]);

            return res.json({
                success: true,
                connected: !!tokenRow,
                calendar_id: tokenRow?.calendar_id || null,
                auto_sync: syncRow?.active || false,
                last_sync: syncRow?.last_sync || null,
                last_sync_stats: syncRow ? {
                    created: syncRow.last_sync_created,
                    errors: syncRow.last_sync_errors
                } : null,
                consecutive_errors: syncRow?.sync_errors_count || 0
            });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // ============= GET /api/calendar/events =============
    if (req.method === 'GET' && action === 'events') {
        const { profile_id } = req.query;
        if (!profile_id) return res.status(400).json({ success: false, error: 'profile_id obbligatorio' });
        if (!supabase) return res.status(503).json({ success: false, error: 'Database non disponibile' });

        const { data: tokenRow } = await supabase
            .from('calendar_tokens').select('*').eq('profile_id', profile_id).single();

        if (!tokenRow) return res.status(400).json({ success: false, error: 'Google Calendar non collegato.' });

        try {
            const storedTokens = {
                access_token: tokenRow.access_token,
                refresh_token: tokenRow.refresh_token,
                expiry_date: tokenRow.expiry_date
            };
            const events = await gcal.listCalendarEvents(storedTokens, tokenRow.calendar_id || 'primary');
            return res.json({ success: true, events });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // ============= POST /api/calendar/sync =============
    if (req.method === 'POST' && action === 'sync') {
        const { profile_id, tasks } = req.body;

        if (!profile_id) return res.status(400).json({ success: false, error: 'profile_id obbligatorio' });
        if (!supabase) return res.status(503).json({ success: false, error: 'Database non disponibile' });

        const { data: tokenRow } = await supabase
            .from('calendar_tokens').select('*').eq('profile_id', profile_id).single();

        if (!tokenRow) return res.status(400).json({ success: false, error: 'Google Calendar non collegato.' });

        const tasksToSync = tasks || [];
        if (tasksToSync.length === 0) {
            return res.json({ success: true, stats: { created: 0, skipped: 0, errors: 0 }, message: 'Nessuna task da sincronizzare.' });
        }

        try {
            const storedTokens = {
                access_token: tokenRow.access_token,
                refresh_token: tokenRow.refresh_token,
                expiry_date: tokenRow.expiry_date
            };
            const { stats, updatedTokens } = await gcal.syncTasksToCalendar(
                storedTokens, tokenRow.calendar_id || 'primary', tasksToSync
            );

            if (updatedTokens.access_token !== storedTokens.access_token) {
                await supabase.from('calendar_tokens').update({
                    access_token: updatedTokens.access_token,
                    expiry_date: updatedTokens.expiry_date || null,
                    updated_at: new Date().toISOString()
                }).eq('profile_id', profile_id);
            }

            return res.json({ success: true, stats });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // ============= POST /api/calendar/register-sync =============
    if (req.method === 'POST' && action === 'register-sync') {
        const { profile_id, school_code, username, password, profile_index } = req.body;

        if (!profile_id || !school_code || !username || !password) {
            return res.status(400).json({ success: false, error: 'Campi obbligatori: profile_id, school_code, username, password' });
        }
        if (!process.env.CALENDAR_ENCRYPTION_KEY) {
            return res.status(503).json({ success: false, error: 'CALENDAR_ENCRYPTION_KEY non configurata sul server' });
        }
        if (!supabase) return res.status(503).json({ success: false, error: 'Database non disponibile' });

        const { data: tokenRow } = await supabase
            .from('calendar_tokens').select('profile_id').eq('profile_id', profile_id).single();

        if (!tokenRow) {
            return res.status(400).json({ success: false, error: 'Google Calendar non ancora collegato.' });
        }

        try {
            const encryptedCreds = gcal.encryptCredentials(JSON.stringify({ username, password }));
            await supabase.from('calendar_sync_jobs').upsert({
                profile_id,
                argo_school_code: school_code.toUpperCase().trim(),
                argo_credentials: encryptedCreds,
                argo_profile_index: parseInt(profile_index) || 0,
                active: true,
                sync_errors_count: 0,
                updated_at: new Date().toISOString()
            }, { onConflict: 'profile_id' });

            return res.json({ success: true, message: 'Sincronizzazione automatica attivata.' });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // ============= DELETE /api/calendar/disconnect =============
    if (req.method === 'DELETE' && action === 'disconnect') {
        const { profile_id } = req.body;
        if (!profile_id) return res.status(400).json({ success: false, error: 'profile_id obbligatorio' });
        if (!supabase) return res.status(503).json({ success: false, error: 'Database non disponibile' });

        try {
            await Promise.all([
                supabase.from('calendar_tokens').delete().eq('profile_id', profile_id),
                supabase.from('calendar_sync_jobs').delete().eq('profile_id', profile_id)
            ]);
            return res.json({ success: true, message: 'Google Calendar disconnesso.' });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    res.status(404).json({ success: false, error: 'Azione non trovata' });
};
