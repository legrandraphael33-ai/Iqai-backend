const { createClient } = require('@vercel/kv');

module.exports = async (req, res) => {
  const kv = createClient({
    url: process.env.REDIS_URL,
  });

  try {
    // 1. Enregistrement du score
    if (req.method === 'POST') {
      const { pseudo, score } = req.body;
      if (!pseudo) return res.status(400).json({ error: "Pseudo manquant" });
      
      await kv.zadd('leaderboard', { score: score, member: pseudo });
      return res.status(200).json({ success: true });
    }

    // 2. Récupération du podium
    if (req.method === 'GET') {
      const rawData = await kv.zrange('leaderboard', 0, 2, { rev: true, withScores: true });
      const formatted = [];
      for (let i = 0; i < rawData.length; i += 2) {
        formatted.push({ pseudo: rawData[i], score: rawData[i + 1] });
      }
      return res.status(200).json(formatted);
    }
  } catch (error) {
    console.error("Erreur Redis:", error);
    return res.status(500).json({ error: error.message });
  }
};
