import { createClient } from '@vercel/kv';

export default async function handler(request, response) {
  // On autorise les appels depuis ton site
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  const kv = createClient({
    url: process.env.REDIS_URL,
  });

  if (request.method === 'POST') {
    // On récupère "pseudo" car c'est ce que ton index.html envoie
    const { pseudo, score } = request.body;

    if (!pseudo || score === undefined) {
      return response.status(400).json({ error: "Données manquantes" });
    }

    try {
      // On enregistre dans Redis (Top 100)
      await kv.zadd('leaderboard', { score: score, member: pseudo });
      return response.status(200).json({ success: true });
    } catch (error) {
      console.error(error);
      return response.status(500).json({ error: "Erreur Redis" });
    }
  }

  if (request.method === 'GET') {
    try {
      // On récupère le top 3
      const top3 = await kv.zrange('leaderboard', 0, 2, { rev: true, withScores: true });
      return response.status(200).json(top3);
    } catch (error) {
      return response.status(500).json({ error: "Erreur lecture Redis" });
    }
  }
}
