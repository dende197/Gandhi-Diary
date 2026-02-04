export function getSelectedProfile() {
    try {
        const raw = localStorage.getItem('selectedProfile');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}
export function getCurrentUserId() {
    const sp = getSelectedProfile();
    return sp?.id || null; // es. "school:user:profile"
}
export function getCurrentUserName() {
    const sp = getSelectedProfile();
    return sp?.name || null;
}
