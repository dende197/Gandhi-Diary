const { tokenStorageEnabled, readConnection, changeConnection } = require('./argo-token-store');
const { refreshArgoToken } = require('./argo-credentials');
const { assertLegacyAuthEnabled } = require('./argo-auth-policy');
const { loadProfilesWithAccessToken, getDashboard } = require('./argo');
const { createHeaders } = require('./helpers');
const { httpError } = require('./backend');

const reauth = () => Object.assign(httpError(401, 'Sessione Argo scaduta. Collega nuovamente il registro.'),
    { code: 'ARGO_REAUTH_REQUIRED' });
const unauthorized = e => [401, 403].includes(e.status || e.response?.status);
function safeUpstreamError(e) {
    if (e.code === 'ARGO_CONNECTION_CHANGED' || e.code === 'ARGO_TOKEN_STORAGE_FAILED') return e;
    const status = e.status || e.response?.status;
    return httpError(status === 429 ? 429 : 503, 'Registro Argo temporaneamente non disponibile. Riprova più tardi.');
}
function passwordFallback(connection) {
    if (connection.source !== 'credentials') throw reauth();
    assertLegacyAuthEnabled();
    return null;
}

// Invoked only under the existing argo:<user> lease. Versioned writes also
// protect against a fresh interactive login or a worker whose lease expired.
async function loadTokenDashboard(userId, row) {
    if (!tokenStorageEnabled()) return null;
    let connection = await readConnection(userId);
    if (!connection) return null;
    if (connection.user_id !== userId ||
        String(connection.school_code).toUpperCase() !== String(row.argo_school_code).toUpperCase() ||
        row.argo_id_soggetto == null || connection.profile_id !== String(row.argo_id_soggetto)) {
        throw httpError(409, 'Il profilo Argo è cambiato. Ricollega il registro e seleziona lo studente.');
    }
    if (connection.state === 'refreshing') {
        connection = await changeConnection(connection,
            { state: 'reauth_required', last_error: 'ARGO_REFRESH_INTERRUPTED' });
    }
    if (connection.state === 'reauth_required') return passwordFallback(connection);
    if (connection.state !== 'active') throw reauth();

    const invalidate = async code => {
        connection = await changeConnection(connection, { state: 'reauth_required', last_error: code });
    };
    const renew = async () => {
        if (!connection.refresh_token) {
            await invalidate('ARGO_REAUTH_REQUIRED');
            return false;
        }
        connection = await changeConnection(connection, { state: 'refreshing', last_error: null });
        let next;
        try {
            next = await refreshArgoToken(connection.refresh_token, connection.client_id);
        } catch (e) {
            // A timeout can occur AFTER upstream rotation. Never blindly reuse
            // a possibly consumed refresh token; require a new grant instead.
            const code = e.code === 'ARGO_REAUTH_REQUIRED' ? e.code : 'ARGO_REFRESH_FAILED';
            await invalidate(code);
            if (code === 'ARGO_REAUTH_REQUIRED') return false;
            throw safeUpstreamError(e);
        }
        // Save rotating tokens BEFORE profile bootstrap, which can fail alone.
        connection = await changeConnection(connection, {
            access_token: next.access_token,
            refresh_token: next.refresh_token || connection.refresh_token,
            expires_at: next.expires_at,
            auth_token: null,
            state: 'active', last_error: null,
        });
        return true;
    };
    const dashboard = async () => {
        if (!connection.auth_token) {
            const profiles = await loadProfilesWithAccessToken(connection.access_token,
                { school: connection.school_code, username: row.argo_username });
            const profile = profiles.find(p => p.idSoggetto != null && String(p.idSoggetto) === connection.profile_id);
            if (!profile?.token) throw reauth();
            connection = await changeConnection(connection, { auth_token: profile.token });
        }
        const payload = await getDashboard(createHeaders(connection.school_code,
            connection.access_token, connection.auth_token, connection.profile_id), { enableBackfill: false });
        return { dashboard: payload, row: { ...row,
            argo_access_token: connection.access_token, argo_auth_token: connection.auth_token,
            argo_tokens_expiry: connection.expires_at } };
    };

    let renewed = false;
    if (!(Date.parse(connection.expires_at) > Date.now() + 30000)) {
        if (!await renew()) return passwordFallback(connection);
        renewed = true;
    }
    try { return await dashboard(); }
    catch (e) {
        if (!unauthorized(e)) throw safeUpstreamError(e);
        if (!renewed) {
            if (!await renew()) return passwordFallback(connection);
            try { return await dashboard(); }
            catch (retryError) {
                if (!unauthorized(retryError)) throw safeUpstreamError(retryError);
            }
        }
        await invalidate('ARGO_REAUTH_REQUIRED');
        return passwordFallback(connection);
    }
}
module.exports = { loadTokenDashboard };
