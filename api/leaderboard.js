import { createClient } from 'redis';

export default async function handler(req, res) {
  const client = createClient({
    url: process.env.REDIS_URL
  });

  client.on('error', (err) => console.error('Erreur Client Redis:', err));

  // On génère une clé unique pour aujourd'hui (ex: leaderboard_2026-02-20)
  const today = new Date().toISOString().split('T')[0];
  const leaderboardKey = `leaderboard_${today}`;

  try {
    await client.connect();

    // LECTURE DU CLASSEMENT DU JOUR
    if (req.method === 'GET') {
      const data = await client.get(leaderboardKey);
      let scores = data ? JSON.parse(data) : [];
      
      // On renvoie le top 3 d'aujourd'hui
      return res.status(200).json(scores.slice(0, 3));
    }

    // ENVOI D'UN SCORE
    if (req.method === 'POST') {
      const { pseudo, score, timeTaken } = req.body; // On récupère aussi le temps
      const data = await client.get(leaderboardKey);
      let scores = data ? JSON.parse(data) : [];

      // On ajoute le nouveau score avec le temps
      scores.push({ 
        pseudo, 
        score: parseInt(score), 
        timeTaken: parseInt(timeTaken) || 999, // Temps par défaut si absent
        date: new Date().toISOString() 
      });

      // TRI : 
      // 1. Le score le plus haut (b.score - a.score)
      // 2. SI ÉGALITÉ : Le temps le plus court (a.timeTaken - b.timeTaken)
      scores.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.timeTaken - b.timeTaken;
      });

      // On garde le top 10 du jour
      scores = scores.slice(0, 10);

      await client.set(leaderboardKey, JSON.stringify(scores), {
        EX: 172800 // Expire après 48h pour ne pas encombrer Redis inutilement
      });

      return res.status(200).json({ success: true });
    }
  } catch (error) {
    console.error("Erreur API:", error);
    return res.status(500).json({ error: "Erreur serveur leaderboard" });
  } finally {
    if (client.isOpen) await client.quit();
  }
}
