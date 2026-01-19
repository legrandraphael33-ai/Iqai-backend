import OpenAI from "openai";

export default async function handler(req, res) {
  // CORS pour GitHub Pages
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

 const prompt = `
Tu es un professeur exigeant de lycée français.

Génère 10 questions de quiz **mélangées et variées**, sans catégorie apparente, niveau lycée seconde générale / Projet Voltaire / Culture générale exigeante.

Contraintes obligatoires :
- Aucune question ne doit être triviale ou répétitive.
- Pas de synonymes simples ("rapide", "heureux", "triste").
- Pas de "Qui a peint la Joconde", "capitale de la France", "2+2".
- Chaque session doit proposer des questions différentes.

Types de questions à mélanger :
- Mathématiques : calcul mental, fonctions, probabilités simples, logique (niveau Terminale ES)
- Français : orthographe, grammaire, accords, homophones, syntaxe (style Projet Voltaire)
- Histoire : programme de Terminale (Révolution française, XIXe, XXe siècle, géopolitique)
- Géographie : capitales, fleuves, reliefs, géopolitique
- Culture générale : littérature, sciences, médias, actualité, culture pop intelligente

Format STRICT JSON :

[
  {
    "q": "Question ?",
    "options": ["A", "B", "C", "D"],
    "answer": "Bonne réponse exacte",
    "explanation": "Explication courte et claire"
  }
]
`;


    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    const text = response.output_text;
    const quiz = JSON.parse(text);

    return res.status(200).json(quiz);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
