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
Tu es un générateur de quiz "core skills" (FR).
Génère EXACTEMENT 10 questions, 4 options chacune.
Répartition: 3 calcul mental, 3 français, 2 traduction EN->FR, 2 culture générale.
Contraintes:
- Une seule bonne réponse.
- Options courtes.
- Explication courte.
Réponds UNIQUEMENT en JSON strict :
[
 {"q":"...","options":["A","B","C","D"],"answer":"...","explanation":"..."},
 ...
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
