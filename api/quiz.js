import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT = `
Tu es un générateur de quiz de très haut niveau pour adultes cultivés.

Objectif :
Générer 10 questions mélangées, en français, de difficulté élevée (niveau seconde générale lycée / concours / Programme Voltaire / culture générale).

Répartition implicite (mais mélangée) :
- Mathématiques (niveau bac ES, calcul mental, probabilités, fonctions, logique)
- Français (orthographe, grammaire, accords, homophones, subjonctif, subtilités Voltaire)
- Histoire (programme Terminale : Révolutions, XXe siècle, géopolitique, France, Europe)
- Géographie (capitales, fleuves, montagnes, pays, cartes)
- Culture générale (sciences, littérature, médias, actualité, pop culture, philosophie)

Contraintes ABSOLUES :
- 10 questions exactement
- 4 options par question
- Toutes les options doivent être différentes
- 1 seule bonne réponse
- Les mauvaises réponses doivent être plausibles
- Les questions doivent être toutes différentes
- Interdiction de poser deux fois la même question ou le même thème exact
- Niveau exigeant mais accessible

Format JSON STRICT (sans texte autour) :
[
  {
    "q": "...",
    "options": ["A","B","C","D"],
    "answer": "A",
    "explanation": "..."
  }
]
`;

function isValidQuestion(q){
  if(!q || typeof q.q !== "string") return false;
  if(!Array.isArray(q.options) || q.options.length !== 4) return false;
  if(typeof q.answer !== "string") return false;

  const opts = q.options.map(o => o.trim());
  if(new Set(opts.map(o => o.toLowerCase())).size !== 4) return false;
  if(!opts.map(o => o.toLowerCase()).includes(q.answer.trim().toLowerCase())) return false;

  return true;
}

function normalizeQuizPayload(raw){
  const arr = Array.isArray(raw) ? raw : raw?.questions;
  if(!Array.isArray(arr)) return null;

  const clean = arr.map(x => ({
    q: String(x.q || "").trim(),
    options: Array.isArray(x.options) ? x.options.map(o => String(o).trim()) : [],
    answer: String(x.answer || "").trim(),
    explanation: String(x.explanation || "").trim(),
  }));

  const valid = clean.filter(isValidQuestion);
  return valid.length === 10 ? valid : null;
}

export default async function handler(req, res){
  if(req.method !== "GET") return res.status(405).end();

  let quiz = null;

  for(let attempt = 1; attempt <= 2; attempt++){
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: PROMPT }],
      temperature: 0.9,
    });

    const text = completion.choices[0].message.content.trim();
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }

    quiz = normalizeQuizPayload(parsed);
    if(quiz) break;
  }

  if(!quiz){
    return res.status(502).json({ error: "Quiz invalide généré, réessaie." });
  }

  res.status(200).json(quiz);
}
