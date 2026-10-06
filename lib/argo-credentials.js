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
    if (!accessToken) throw new Error('No access_token in response');
    return { access_token: accessToken, jar,
        expires_at: credentialTokenExpiry(tokenRes.data.expires_in, requestedAt) };
}

module.exports = { authenticateWithCredentials, credentialTokenExpiry };
