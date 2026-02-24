const { createClient } = require('redis');

module.exports = async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => console.error('Erreur Redis:', err));

    try {
        await client.connect();

        if (req.method === 'POST') {
            const { name, score, total, vigilance, totalHalu, duration, haluDetections, date } = req.body;
            if (!name || score == null || !total) {
                return res.status(400).json({ error: "Données manquantes" });
            }

            const entry = {
                name: String(name).slice(0, 50),
                score: Number(score),
                total: Number(total),
                vigilance: Number(vigilance || 0),
                totalHalu: Number(totalHalu || 0),
                duration: Number(duration || 0),
                haluDetections: Array.isArray(haluDetections) ? haluDetections : [],
                date: date || new Date().toISOString()
            };

            await client.lPush("iqai:results", JSON.stringify(entry));
            return res.status(200).json({ ok: true });
        }

        if (req.method === 'GET') {
            const raw = await client.lRange("iqai:results", 0, -1);
            const results = raw.map(r => JSON.parse(r));
            return res.status(200).json(results);
        }
if (req.method === 'POST' && req.body.action === 'delete') {
  const { mode, indexes } = req.body;
  if (mode === 'all') {
    await client.del("iqai:results");
    return res.status(200).json({ ok: true, deleted: 'all' });
  }
  if (mode === 'indexes' && Array.isArray(indexes)) {
    const raw = await client.lRange("iqai:results", 0, -1);
    const toKeep = raw.filter((_, i) => !indexes.includes(i));
    await client.del("iqai:results");
    for (let i = toKeep.length - 1; i >= 0; i--) {
      await client.rPush("iqai:results", toKeep[i]);
    }
    return res.status(200).json({ ok: true, deleted: indexes.length });
  }
  return res.status(400).json({ error: "Paramètres invalides" });
}
    } catch (e) {
        console.error("Erreur save-result-iqai:", e);
        return res.status(500).json({ error: "Erreur serveur", details: e.message });
    } finally {
        if (client.isOpen) await client.quit();
    }
};
