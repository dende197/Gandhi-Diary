export async function postJson(getEndpointUrl, payload) {
    const url = await getEndpointUrl(); // risolvi la Promise
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}
