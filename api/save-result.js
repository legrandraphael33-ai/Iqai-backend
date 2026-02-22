const { createClient } = require('redis');

module.exports = async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => console.error('Erreur Redis:', err));

    try {
        await client.connect();

        if (req.method === 'POST') {
            const { name, score, total, duration, errors } = req.body;
            if (!name || score == null || !total || !duration) {
                return res.status(400).json({ error: "Données manquantes" });
            }

            const entry = {
                name: String(name).slice(0, 50),
                score: Number(score),
                total: Number(total),
                duration: Number(duration),
                errors: Array.isArray(errors) ? errors : [],
                date: new Date().toISOString()
            };

            await client.lPush("sandra:results", JSON.stringify(entry));
            return res.status(200).json({ ok: true });
        }

        if (req.method === 'GET') {
            const raw = await client.lRange("sandra:results", 0, -1);
            const results = raw.map(r => JSON.parse(r));
            return res.status(200).json(results);
        }

    } catch (e) {
        console.error("Erreur save-result:", e);
        return res.status(500).json({ error: "Erreur serveur", details: e.message });
    } finally {
        if (client.isOpen) await client.quit();
    }
};
