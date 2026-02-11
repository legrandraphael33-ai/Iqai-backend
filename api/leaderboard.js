import { createClient } from 'redis';

export default async function handler(req, res) {
  const client = createClient({
    url: process.env.REDIS_URL
  });

  client.on('error', (err) => console.error('Erreur Client Redis:', err));

  try {
    await client.connect();

    // LECTURE DU CLASSEMENT
    if (req.method === 'GET') {
      const data = await client.get('leaderboard');
      const scores = data ? JSON.parse(data) : [];
      return res.status(200).json(scores.slice(0, 3));
    }

    // ENVOI D'UN SCORE
    if (req.method === 'POST') {
      const { pseudo, score } = req.body;
      const data = await client.get('leaderboard');
      let scores = data ? JSON.parse(data) : [];

      scores.push({ pseudo, score, date: new Date().toISOString() });
      scores.sort((a, b) => b.score - a.score);
      scores = scores.slice(0, 10); // On garde le top 10 en mémoire

      await client.set('leaderboard', JSON.stringify(scores));
      return res.status(200).json({ success: true });
    }
  } catch (error) {
    console.error("Erreur API:", error);
    return res.status(500).json({ error: "Erreur serveur leaderboard" });
  } finally {
    if (client.isOpen) await client.quit();
  }
}
