const crypto = require('crypto');
const { database, checked } = require('./backend');
const keyFor = (url) =>
    crypto
        .createHash('sha256')
        .update('summary-v2:' + url)
        .digest('hex');
async function getSintesiFromCache(url) {
    const row = await checked(
        database().from('summary_cache').select('summary,expires_at').eq('key', keyFor(url)).maybeSingle(),
    );
    return row && new Date(row.expires_at) > new Date() ? row.summary : null;
}
async function setSintesiInCache(url, summary) {
    await checked(
        database()
            .from('summary_cache')
            .upsert({ key: keyFor(url), summary, expires_at: new Date(Date.now() + 86400000).toISOString() }),
    );
}
module.exports = { getSintesiFromCache, setSintesiInCache };
