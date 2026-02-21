const { v4: uuidv4 } = require('uuid');
const { handleCors, debugLog } = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ success: false, error: 'Supabase non configurato' });

    try {
        const { image: base64Image, userId = uuidv4() } = req.body;

        if (!base64Image || !base64Image.startsWith('data:image/')) {
            return res.status(400).json({ success: false, error: 'Formato immagine non valido' });
        }

        const matches = base64Image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (!matches) throw new Error('Invalid base64');

        const ext = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `${userId.replace(/:/g, '_')}_${Date.now()}.${ext}`;

        const { data, error } = await supabase.storage.from('avatars').upload(filename, buffer, {
            contentType: `image/${ext}`,
            upsert: true
        });

        if (error) throw error;

        const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filename);
        res.status(200).json({ success: true, url: publicData.publicUrl });

    } catch (e) {
        console.error('Avatar upload failed:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
}
