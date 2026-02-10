import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
  // Configuration du client Redis (KV)
  const kv = createClient({
    url: process.env.REDIS_URL,
  });

  // 1. Gérer l'envoi d'un score (POST)
  if (req.method === 'POST') {
    const { pseudo, score } = req.body;
    
    if (!pseudo || score === undefined) {
      return res.status(400).json({ error: "Données manquantes" });
    }

    try {
      // On ajoute le score dans Redis
      await kv.zadd('leaderboard', { score: score, member: pseudo });
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Erreur Redis POST" });
    }
  }

  // 2. Gérer l'affichage du podium (GET)
  if (req.method === 'GET') {
    try {
      // On récupère le top 3 (les 6 éléments : pseudo1, score1, pseudo2, score2...)
      const rawData = await kv.zrange('leaderboard', 0, 2, { rev: true, withScores: true });
      
      // On transforme ça en format clair pour ton index.html
      const formatted = [];
      for (let i = 0; i < rawData.length; i += 2) {
        formatted.push({ 
            name: rawData[i], 
            points: rawData[i + 1] 
        });
      }
      return res.status(200).json(formatted);
    } catch (error) {
      return res.status(500).json({ error: "Erreur Redis GET" });
    }
  }
}
