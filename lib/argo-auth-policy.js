// This policy controls the existing credential flow. It does not implement or
// imply authorization to use an Argo SPID/CIE integration.
function legacyAuthEnabled() {
    const configured = process.env.ARGO_LEGACY_AUTH_ENABLED;
    if (configured === undefined) return true;
    const value = configured.trim();
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw Object.assign(new Error('Configurazione dei metodi di accesso Argo non valida.'), {
        status: 503,
        code: 'ARGO_AUTH_POLICY_INVALID',
    });
}

function assertLegacyAuthEnabled() {
    if (!legacyAuthEnabled()) {
        throw Object.assign(
            new Error('Accesso con credenziali disabilitato. Il collegamento Argo richiede una modalità di accesso abilitata.'),
            { status: 403, code: 'ARGO_CREDENTIALS_DISABLED' },
        );
    }
}

function getAuthMethods() {
    return {
        credentials: { enabled: legacyAuthEnabled() },
        spid: { enabled: false },
        cie: { enabled: false },
        federated: { status: 'requires_provider_integration' },
    };
}

module.exports = { assertLegacyAuthEnabled, getAuthMethods };
