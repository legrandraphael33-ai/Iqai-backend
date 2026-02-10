import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
  const kv = createClient({
    url: process.env.REDIS_URL,
  });

  // 1. Enregistrement du score (POST)
  if (req.method === 'POST') {
    const { pseudo, score } = req.body;
    
    if (!pseudo || score === undefined) {
      return res.status(400).json({ error: "Données manquantes" });
    }

    try {
      await kv.zadd('leaderboard', { score: score, member: pseudo });
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Erreur Redis" });
    }
  }

  // 2. Récupération du podium (GET)
  if (req.method === 'GET') {
    try {
      const rawData = await kv.zrange('leaderboard', 0, 2, { rev: true, withScores: true });
      
      const formatted = [];
      for (let i = 0; i < rawData.length; i += 2) {
        // On utilise "pseudo" et "score" pour correspondre à ton HTML
        formatted.push({ 
            pseudo: rawData[i], 
            score: rawData[i + 1] 
        });
      }
      return res.status(200).json(formatted);
    } catch (error) {
      return res.status(500).json({ error: "Erreur lecture" });
    }
  }
}
