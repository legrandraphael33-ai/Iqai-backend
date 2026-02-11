const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        if (req.method === 'POST') {
            const { pseudo, score } = req.body;
            if (!pseudo) return res.status(400).json({ error: "Pseudo requis" });
            
            // On enregistre le score global (Somme score + vigilance)
            await kv.zadd('leaderboard', { score: parseInt(score), member: pseudo });
            return res.status(200).json({ success: true });
        }

        if (req.method === 'GET') {
            const rawData = await kv.zrange('leaderboard', 0, 2, { rev: true, withScores: true });
            const formatted = [];
            for (let i = 0; i < rawData.length; i += 2) {
                formatted.push({ pseudo: rawData[i], score: rawData[i + 1] });
            }
            return res.status(200).json(formatted);
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
