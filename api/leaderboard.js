import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Crée une clé unique par jour (ex: top:2026-02-10)
  const today = new Date().toISOString().split('T')[0];
  const LEADERBOARD_KEY = `top:${today}`;

  try {
    if (req.method === 'POST') {
      const { pseudo, score } = req.body;
      if (!pseudo || score === undefined) {
        return res.status(400).json({ error: "Données manquantes" });
      }

      // Ajoute au classement. Redis garde automatiquement le meilleur score.
      await kv.zadd(LEADERBOARD_KEY, { score: score, member: pseudo });
      // On garde les données 48h (pour éviter de saturer la base gratuite)
      await kv.expire(LEADERBOARD_KEY, 172800);

      return res.status(200).json({ success: true });
    } 

    if (req.method === 'GET') {
      // Récupère les 3 meilleurs scores (du plus haut au plus bas)
      const rawTop = await kv.zrevrange(LEADERBOARD_KEY, 0, 2, { withScores: true });
      
      const top3 = [];
      for (let i = 0; i < rawTop.length; i += 2) {
        top3.push({ pseudo: rawTop[i], score: rawTop[i + 1] });
      }
      return res.status(200).json(top3);
    }
  } catch (error) {
    console.error("Erreur Redis:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
