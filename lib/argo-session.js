const { assertLegacyAuthEnabled } = require('./argo-auth-policy');
const { credentialTokenExpiry } = require('./argo-credentials');
const { database, checked, httpError, withLease } = require('./backend');
const {
    generatePid,
    normalizeUserId,
    createHeaders,
    decryptArgoPassword,
    encryptArgoPassword,
    normalizeClass,
    getCurrentSchoolYearKey,
} = require('./helpers');
const { AdvancedArgo, getDashboard, enrichProfiles, resolveIdentityForProfile } = require('./argo');

function assertIdentity(userId, school, username, index) {
    const id = normalizeUserId(userId);
    if (!id || generatePid(school, username, index) !== id) throw httpError(403, 'Profilo non autorizzato');
    return id;
}
function selectProfile(profiles, row) {
    const list = Array.isArray(profiles) ? profiles : [];
    const match =
        row.argo_id_soggetto != null
            ? list.find((p) => String(p.idSoggetto) === String(row.argo_id_soggetto))
            : list.find((p) => Number(p.index) === Number(row.profile_index));
    if (!match)
        throw httpError(
            409,
            'Il profilo Argo è cambiato. Effettua nuovamente il login e seleziona lo studente.',
        );
    return match;
}
async function recordMembership(userId, school, profile) {
    const cls = normalizeClass(profile.class);
    if (!cls || !profile.idSoggetto) return;
    const key = `${String(school).toUpperCase()}:${getCurrentSchoolYearKey()}:${cls}`;
    await checked(
        database()
            .from('verified_memberships')
            .upsert(
                {
                    user_id: userId,
                    class_key: key,
                    class_name: cls,
                    school_code: String(school).toUpperCase(),
                    subject_id: String(profile.idSoggetto),
                    verified_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' },
            ),
    );
}
async function persistCredentials(userId, school, username, password, index, login, profile) {
    assertLegacyAuthEnabled();
    assertIdentity(userId, school, username, index);
    const db = database();
    const old = await checked(
        db.from('google_tokens').select('user_id,argo_id_soggetto').eq('user_id', userId).maybeSingle(),
    );
    if (old?.argo_id_soggetto && String(old.argo_id_soggetto) !== String(profile.idSoggetto)) {
        throw httpError(409, 'Ordine dei profili Argo cambiato: serve una migrazione esplicita del profilo.');
    }
    const patch = {
        argo_school_code: school,
        argo_username: username,
        argo_password: encryptArgoPassword(password),
        profile_index: index,
        argo_access_token: login.access_token,
        argo_auth_token: profile.token,
        argo_id_soggetto: profile.idSoggetto == null ? null : String(profile.idSoggetto),
        argo_tokens_expiry: login.expires_at || credentialTokenExpiry(),
        updated_at: new Date().toISOString(),
    };
    // Partial UPDATE never replays stale Google tokens over a concurrent OAuth refresh.
    if (old) await checked(db.from('google_tokens').update(patch).eq('user_id', userId));
    else await checked(db.from('google_tokens').insert({ user_id: userId, ...patch }));
    // Never promote the editable profile cache to an authorization source.
    const identity = await resolveIdentityForProfile(
        school,
        username,
        password,
        login.access_token,
        profile.token,
        null,
        null,
        profile.idSoggetto,
    );
    if (normalizeClass(identity.cls))
        await recordMembership(userId, school, { ...profile, class: identity.cls });
    else await checked(db.from('verified_memberships').delete().eq('user_id', userId));
}
async function loadArgoDashboard(userId, { force = false } = {}) {
    userId = normalizeUserId(userId);
    return withLease(`argo:${userId}`, async () => {
        const db = database();
        const row = await checked(db.from('google_tokens').select('*').eq('user_id', userId).maybeSingle());
        if (!row) throw httpError(401, 'Credenziali Argo non disponibili. Effettua il login.');
        assertIdentity(userId, row.argo_school_code, row.argo_username, row.profile_index);
        if (!force) {
            const snapshot = await checked(
                db.from('argo_snapshots').select('payload,expires_at').eq('user_id', userId).maybeSingle(),
            );
            if (snapshot && new Date(snapshot.expires_at) > new Date())
                return { row, dashboard: snapshot.payload, usedCache: true };
        }
        let dashboard;
        let usedCache = false;
        if (row.argo_access_token && row.argo_auth_token && new Date(row.argo_tokens_expiry) > new Date()) {
            try {
                usedCache = true;
                dashboard = await getDashboard(
                    createHeaders(
                        row.argo_school_code,
                        row.argo_access_token,
                        row.argo_auth_token,
                        row.argo_id_soggetto,
                    ),
                    { enableBackfill: false },
                );
            } catch (e) {
                if (![401, 403].includes(e.response?.status || e.status)) throw e;
            }
        }
        if (!dashboard) {
            assertLegacyAuthEnabled();
            const password = decryptArgoPassword(row.argo_password);
            if (!password) throw httpError(401, 'Credenziali Argo non disponibili. Effettua il login.');
            const login = await AdvancedArgo.rawLogin(row.argo_school_code, row.argo_username, password);
            const profiles = await enrichProfiles(row.argo_school_code, login.access_token, login.profiles);
            const profile = selectProfile(profiles, row);
            await persistCredentials(
                userId,
                row.argo_school_code,
                row.argo_username,
                password,
                row.profile_index,
                login,
                profile,
            );
            Object.assign(row, {
                argo_access_token: login.access_token,
                argo_auth_token: profile.token,
                argo_id_soggetto: profile.idSoggetto,
            });
            dashboard = await getDashboard(
                createHeaders(row.argo_school_code, login.access_token, profile.token, profile.idSoggetto),
                { enableBackfill: false },
            );
        }
        await checked(
            db
                .from('argo_snapshots')
                .upsert(
                    {
                        user_id: userId,
                        payload: dashboard,
                        expires_at: new Date(Date.now() + 60000).toISOString(),
                    },
                    { onConflict: 'user_id' },
                ),
        );
        await checked(
            db
                .from('google_tokens')
                .update({ last_argo_sync: new Date().toISOString() })
                .eq('user_id', userId),
        );
        row.last_argo_sync = new Date().toISOString();
        return { row, dashboard, usedCache };
    });
}
module.exports = { assertIdentity, selectProfile, recordMembership, persistCredentials, loadArgoDashboard };
