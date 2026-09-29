const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const context = new AsyncLocalStorage();
const httpError = (status, message) => Object.assign(new Error(message), { status });
function database() {
    const db = require('./supabase').getSupabase();
    if (!db) throw httpError(503, 'Database non disponibile');
    return db;
}
async function checked(query) {
    signal()?.throwIfAborted();
    if (signal() && query.abortSignal) query = query.abortSignal(signal());
    const { data, error } = await query;
    if (error) throw Object.assign(new Error(error.message), { code: error.code, status: 503 });
    return data;
}
function signal() {
    return context.getStore()?.signal;
}
async function deadline(fn, ms = 90000) {
    const parent = signal();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(httpError(504, 'Tempo massimo superato')), ms);
    try {
        return await context.run(
            { signal: parent ? AbortSignal.any([parent, controller.signal]) : controller.signal },
            fn,
        );
    } finally {
        clearTimeout(timer);
    }
}
async function withLease(key, fn, seconds = 120) {
    const db = database();
    const owner = crypto.randomUUID();
    if (
        !(await checked(db.rpc('acquire_backend_lease', { p_key: key, p_owner: owner, p_seconds: seconds })))
    ) {
        throw httpError(409, 'Operazione già in corso. Riprova tra pochi secondi.');
    }
    try {
        return await fn();
    } finally {
        // Release uses no aborted request signal. The owner check protects a newer lease.
        const { error } = await db.rpc('release_backend_lease', { p_key: key, p_owner: owner });
        if (error) console.error('Lease release failed', error.code);
    }
}
async function quota(key, limit, seconds = 60) {
    if (
        !(await checked(
            database().rpc('take_backend_quota', { p_key: key, p_limit: limit, p_seconds: seconds }),
        ))
    ) {
        throw httpError(429, 'Troppe richieste. Riprova più tardi.');
    }
}
function endpoint(handler) {
    return async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            if (Buffer.byteLength(JSON.stringify(req.body || {})) > 512 * 1024)
                throw httpError(413, 'Richiesta troppo grande');
            return await deadline(() => handler(req, res));
        } catch (e) {
            const status = e.status >= 400 && e.status <= 599 ? e.status : 500;
            console.error('Request failed', { status, code: e.code || 'BACKEND_ERROR' });
            return res
                .status(status)
                .json({ success: false, error: status === 500 ? 'Errore interno del servizio' : e.message });
        }
    };
}
function text(value, max = 1000) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function isoDate(value) {
    const s = text(value, 40).split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}
function todayRome(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}
module.exports = {
    database,
    checked,
    httpError,
    withLease,
    deadline,
    signal,
    quota,
    endpoint,
    text,
    isoDate,
    todayRome,
};
