import OpenAI from "openai";

function safeJsonArrayFromText(text) {
  // Essaie direct
  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch {}

  // Sinon: extrait le premier [...] (cas où le modèle met du texte autour)
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    const slice = text.slice(start, end + 1);
    return JSON.parse(slice);
  }
  throw new Error("JSON parse failed");
}

function isValidQuestion(q) {
  if (!q || typeof q.q !== "string" || !q.q.trim()) return false;
  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  if (typeof q.answer !== "string" || !q.answer.trim()) return false;

  const opts = q.options.map(o => String(o).trim()).filter(Boolean);
  if (opts.length !== 4) return false;

  // options uniques (case-insensitive)
  const uniq = new Set(opts.map(o => o.toLowerCase()));
  if (uniq.size !== 4) return false;

  const ans = String(q.answer).trim();
  if (!opts.includes(ans)) return false;

  // explanation optionnelle mais utile
  if (q.explanation != null && typeof q.explanation !== "string") return false;

  return true;
}

function isValidQuiz(arr) {
  return Array.isArray(arr) && arr.length === 10 && arr.every(isValidQuestion);
}

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
- Évite aussi les “classiques” trop fréquents (Joconde, synonymes basiques, Tour Eiffel, etc.).
- Varie les domaines (auteurs, dates, concepts, lieux, sciences, médias, sport, techno, arts, institutions…).`
      : "";

    const prompt = `
Tu es un professeur exigeant de lycée français (niveau Terminale générale/ES), mais tu restes clair, pédagogique et sans pièges gratuits.

Objectif :
Génère 10 questions de quiz MÉLANGÉES (pas de catégories visibles), variées, intéressantes et non répétitives.

Répartition implicite (sans l’afficher) :
- maths : 2 questions
- géographie : 2 questions
- histoire (programme Terminale générale) : 2 questions
- culture générale (incluant littérature, art, musique) : 2 questions
- français (style Projet Voltaire : orthographe/grammaire/syntaxe) : 2 questions

CONTRAINTES IMPORTANTES (anti-nul / anti-répétition) :
- Interdiction des questions vues 1000 fois (Joconde, capitale de la France, “synonyme de rapide/heureux”, etc.).
- Interdiction des doublons de type (pas 2 synonymes, pas 2 capitales ultra connues, etc.).
- Chaque question doit être précise, sans ambiguïté, et avoir UNE seule bonne réponse.
- Les 4 options doivent être toutes différentes, plausibles, et UNE seule correcte.
- Donne une explication courte et correcte (1 à 2 phrases max).

MATHS — RÈGLES STRICTES (calcul mental “balisé”) :
- UNIQUEMENT du calcul mental faisable de tête (niveau “ça demande de s’accrocher”, mais sans outils).
- Résultat final TOUJOURS un entier (ou une fraction très simple type 1/2, 3/4), jamais un long décimal.
- Interdit : racines carrées, puissances/carrés, dérivées, intégrales, trigonométrie, équations compliquées, logarithmes, matrices, suites, formules longues.
- Autorisé : pourcentages simples, proportions, vitesses/distance/temps simples, moyenne, règle de trois, probabilités très simples, logique de base, petites manipulations algébriques ultra légères.
- Vérifie tes calculs AVANT de donner la réponse et l’explication.

FRANÇAIS — style “Projet Voltaire” :
- Questions d’orthographe/accords/homophones/participe passé/subjonctif, registres et pièges classiques MAIS pas “évidents”.
- Interdiction des options identiques.
- La bonne réponse doit être EXACTEMENT une des options (copie exacte).

${avoidBlock}

CONTRÔLE QUALITÉ OBLIGATOIRE (avant de répondre) :
- Pour CHAQUE question, vérifie que "answer" est EXACTEMENT l’une des 4 valeurs de "options".
- Pour les questions de maths : recalculer le résultat, et vérifier que l’explication est cohérente.
- Interdiction de donner une explication qui mène à un résultat différent de "answer".
- Si tu n'arrives pas à respecter ces règles, recommence.

FORMAT : retourne STRICTEMENT du JSON valide (pas de texte autour), sous forme d’un tableau de 10 objets :
[
  {
    "q": "Question en français ?",
    "options": ["A", "B", "C", "D"],
    "answer": "B",
    "explanation": "Explication courte."
  }
]
`;

    // Retry automatique si la sortie est invalide
    let quiz = null;
    let lastText = "";

    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        input: prompt,
        temperature: 0.8
      });

      const text = response.output_text || "";
      lastText = text;

      let parsed;
      try {
        parsed = safeJsonArrayFromText(text);
      } catch {
        continue;
      }

      if (isValidQuiz(parsed)) {
        quiz = parsed;
        break;
      }
    }

    if (!quiz) {
      return res.status(500).json({
        error: "Quiz invalide généré, réessaie.",
        details: "Validation failed after retries."
      });
    }

    return res.status(200).json(quiz);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
