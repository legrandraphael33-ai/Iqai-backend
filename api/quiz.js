import OpenAI from "openai";

export default async function handler(req, res) {
  // CORS pour GitHub Pages
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // On accepte GET (sans avoid) ou POST (avec avoid)
    let avoid = [];
    if (req.method === "POST") {
      // Vercel parse souvent le JSON automatiquement si content-type JSON
      // sinon, req.body peut être une string
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      avoid = Array.isArray(body.avoid) ? body.avoid.slice(0, 60).map(String) : [];
    } else if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const avoidBlock = avoid.length
      ? `Questions/thèmes récemment utilisés (à éviter absolument, même paraphrasés) :
${avoid.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Règle anti-répétition :
- Ne réutilise aucun de ces items.
- Évite aussi les “classiques” trop fréquents (Joconde, synonymes basiques, Tour Eiffel, etc.) si déjà présents.
- Varie les domaines (auteurs, dates, concepts, lieux, sciences, médias, sport, techno, arts, institutions…).`
      : "";

    const prompt = `
Tu es un générateur de quiz "core skills" en français.

Génère EXACTEMENT 10 questions au total, format QCM (4 options) + explication courte (1 phrase).
Répartition STRICTE :
- Q1–Q2 : Calcul mental / petit problème (niveau lycée, sans calculatrice)
- Q3–Q4 : Géographie (capitales/pays, fleuves, montagnes, régions…)
- Q5–Q6 : Histoire niveau Terminale (programme France, niveau bac)
- Q7–Q8 : Culture générale type Trivial Pursuit (sciences, médias, actu récente, culture pop incluse)
- Q9–Q10 : Français (niveau un cran au-dessus du facile : accords subtils, homophones, syntaxe, fonctions, figures simples)

Contraintes :
- Une seule bonne réponse, pas d’ambiguïté.
- Options courtes et plausibles.
- Le champ "answer" doit être EXACTEMENT l’une des 4 options.
- Interdiction de recycler des questions vues récemment : priorité à la nouveauté.

${avoidBlock}

Réponds UNIQUEMENT en JSON strict :
[
  {"q":"...","options":["A","B","C","D"],"answer":"...","explanation":"..."},
  ...
]
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      // un peu plus de variété
      temperature: 0.9
    });

    const text = response.output_text;
    const quiz = JSON.parse(text);

    return res.status(200).json(quiz);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
