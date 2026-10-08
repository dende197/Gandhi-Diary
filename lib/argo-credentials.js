// Existing password exchange, isolated for migration. This is NOT an SPID/CIE
// integration or an authorization to reuse the official client for a new flow.
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const crypto = require('crypto');
const cheerio = require('cheerio');
const { signal } = require('./backend');
const { debugLog } = require('./helpers');
const { assertLegacyAuthEnabled } = require('./argo-auth-policy');

const CHALLENGE_URL = 'https://auth.portaleargo.it/oauth2/auth';
const LOGIN_URL = 'https://www.portaleargo.it/auth/sso/login';
const TOKEN_URL = 'https://auth.portaleargo.it/oauth2/token';
const REDIRECT_URI = 'it.argosoft.didup.famiglia.new://login-callback';
const CLIENT_ID = '72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c';
const MAX_TOKEN_LENGTH = 16384;

function validToken(value) {
    return typeof value === 'string' && value.length > 0 &&
        value.length <= MAX_TOKEN_LENGTH && /^[\x21-\x7e]+$/.test(value);
}

function reauthenticationRequired() {
    return Object.assign(new Error('Sessione Argo scaduta. Collega nuovamente il registro.'), {
        status: 401, code: 'ARGO_REAUTH_REQUIRED',
    });
}

function refreshFailed() {
    return Object.assign(new Error('Rinnovo della sessione Argo non disponibile. Riprova più tardi.'), {
        status: 503, code: 'ARGO_REFRESH_FAILED',
    });
}

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('hex');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest()
        .toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

function credentialTokenExpiry(expiresIn, issuedAt = Date.now()) {
    // expires_in comes from the TLS-protected token response, not decoded JWT claims.
    // Keep the old six-hour ceiling when the legacy server omits its lifetime.
    const seconds = (typeof expiresIn === 'number' ||
        (typeof expiresIn === 'string' && /^\d+(?:\.\d+)?$/.test(expiresIn)))
        ? Number(expiresIn) : NaN;
    const ttl = Number.isFinite(seconds) && seconds >= 0
        ? Math.min(seconds * 1000, 6 * 3600000) : 6 * 3600000;
    return new Date(issuedAt + ttl).toISOString();
}

// The existing public client is the only known token provenance in this app.
// A future login adapter must supply its actual client; never guess a client or
// redirect for tokens obtained elsewhere. No password or browser cookies apply.
async function refreshArgoToken(refreshToken, clientId) {
    if (clientId !== CLIENT_ID || !validToken(refreshToken)) throw reauthenticationRequired();
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
    });
    const requestedAt = Date.now();
    let response;
    try {
        response = await axios.post(TOKEN_URL, body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000,
            signal: signal(),
            maxRedirects: 0,
        });
    } catch (error) {
        const status = error.response?.status;
        if (status === 401 || (status === 400 && error.response?.data?.error === 'invalid_grant'))
            throw reauthenticationRequired();
        // Do not propagate Axios configuration, token values, or provider text.
        throw refreshFailed();
    }
    const data = response?.data;
    if ((response?.status !== undefined && (response.status < 200 || response.status >= 300)) ||
        !validToken(data?.access_token) ||
        (data.refresh_token !== undefined && !validToken(data.refresh_token)) ||
        (data.token_type !== undefined &&
            (typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer'))) {
        throw refreshFailed();
    }
    const tokens = {
        access_token: data.access_token,
        client_id: CLIENT_ID,
        expires_at: credentialTokenExpiry(data.expires_in, requestedAt),
    };
    if (validToken(data.refresh_token)) tokens.refresh_token = data.refresh_token;
    return tokens;
}

async function authenticateWithCredentials(school, username, password) {
    assertLegacyAuthEnabled();
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 15000, signal: signal() }));

    const CODE_VERIFIER = generateCodeVerifier();
    const CODE_CHALLENGE = generateCodeChallenge(CODE_VERIFIER);
    const STATE = generateState();

    const challengeParams = new URLSearchParams({
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        response_type: 'code',
        prompt: 'login',
        state: STATE,
        scope: 'openid offline profile user.roles argo',
        code_challenge: CODE_CHALLENGE,
        code_challenge_method: 'S256'
    });

    debugLog('PKCE: Richiesta Challenge...');
    const reqChallenge = await client.get(`${CHALLENGE_URL}?${challengeParams.toString()}`);

    const finalUrl = reqChallenge.request?.res?.responseUrl || reqChallenge.config.url || '';
    let loginChallenge = null;
    const matchChallenge = finalUrl.match(/login_challenge=([0-9a-f]+)/);

    if (matchChallenge) {
        loginChallenge = matchChallenge[1];
    } else if (reqChallenge.data) {
        try {
            const $ = cheerio.load(reqChallenge.data);
            const hidden = $('input[name="challenge"]').val();
            if (hidden) loginChallenge = hidden;
        } catch (_) { }
    }

    if (!loginChallenge) throw new Error('Login challenge non trovata (URL/HTML)');

    const loginBody = new URLSearchParams();
    loginBody.append('challenge', loginChallenge);
    loginBody.append('client_id', CLIENT_ID);
    loginBody.append('prefill', 'true');
    loginBody.append('famiglia_customer_code', school);
    loginBody.append('username', username);
    loginBody.append('password', password);
    loginBody.append('login', 'true');

    const reqLogin = await client.post(LOGIN_URL, loginBody, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        maxRedirects: 0,
        validateStatus: () => true
    });

    let location = reqLogin.headers['location'];
    if (!location && reqLogin.data) {
        try {
            const $ = cheerio.load(reqLogin.data);
            location = $('a[href*="code="]').attr('href') || null;
            if (!location) {
                const meta = $('meta[http-equiv="refresh"]').attr('content') || '';
                const m = meta.match(/url=(.+)$/i);
                if (m) location = m[1];
            }
        } catch (_) { }
    }
    if (!location) throw new Error('Credenziali errate o scuola non valida (No Location header)');

    let code = null;
    for (let loopCount = 0; loopCount < 10 && location; loopCount++) {
        const codeMatch = location.match(/code=([0-9a-zA-Z-_.]+)/);
        if (codeMatch) { code = codeMatch[1]; break; }
        const reqRedirect = await client.get(location, { maxRedirects: 0, validateStatus: () => true });
        location = reqRedirect.headers['location'];
    }

    if (!code) throw new Error('Auth code non trovato dopo i redirect');

    const tokenBody = new URLSearchParams();
    tokenBody.append('code', code);
    tokenBody.append('grant_type', 'authorization_code');
    tokenBody.append('redirect_uri', REDIRECT_URI);
    tokenBody.append('code_verifier', CODE_VERIFIER);
    tokenBody.append('client_id', CLIENT_ID);

    const requestedAt = Date.now();
    const tokenRes = await client.post(TOKEN_URL, tokenBody);
    const accessToken = tokenRes.data.access_token;
    if (!validToken(accessToken)) throw new Error('Token di accesso Argo non valido');
    const tokens = { access_token: accessToken, jar, client_id: CLIENT_ID,
        expires_at: credentialTokenExpiry(tokenRes.data.expires_in, requestedAt) };
    // Internal server result only. Public login responses expose no refresh token.
    if (validToken(tokenRes.data.refresh_token)) tokens.refresh_token = tokenRes.data.refresh_token;
    return tokens;
}

module.exports = { authenticateWithCredentials, credentialTokenExpiry, refreshArgoToken,
    LEGACY_CLIENT_ID: CLIENT_ID };
