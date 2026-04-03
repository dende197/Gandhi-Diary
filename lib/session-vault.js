const TTL_MS = 12 * 60 * 60 * 1000; // 12h
const vault = new Map();

function setArgoCredentials(userId, payload) {
    const key = String(userId || '').trim().toLowerCase();
    if (!key || !payload || !payload.password) return;
    vault.set(key, {
        schoolCode: payload.schoolCode || null,
        username: payload.username || null,
        password: payload.password,
        profileIndex: payload.profileIndex ?? 0,
        expiresAt: Date.now() + TTL_MS
    });
}

function getArgoCredentials(userId) {
    const key = String(userId || '').trim().toLowerCase();
    if (!key) return null;
    const item = vault.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
        vault.delete(key);
        return null;
    }
    return item;
}

function clearArgoCredentials(userId) {
    const key = String(userId || '').trim().toLowerCase();
    if (!key) return;
    vault.delete(key);
}

module.exports = {
    setArgoCredentials,
    getArgoCredentials,
    clearArgoCredentials
};
