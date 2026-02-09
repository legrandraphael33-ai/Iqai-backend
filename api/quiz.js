import OpenAI from "openai";
import { generateHalluQuestions } from "../lib/generateHallu.js";

function safeJsonArrayFromText(text) {
  try {
    return JSON.parse(text);
  } catch {}

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

  const uniq = new Set(opts.map(o => o.toLowerCase()));
  if (uniq.size !== 4) return false;

  const ans = String(q.answer).trim();
  if (!opts.includes(ans)) return false;

  if (q.explanation != null && typeof q.explanation !== "string") return false;

  return true;
}

function isValidQuiz(arr) {
  return Array.isArray(arr) && arr.length === 10 && arr.every(isValidQuestion);
}

function normalizeQuestion(q) {
  return {
    q: String(q.q ?? ""),
    options: Array.isArray(q.options) ? q.options.map(String).slice(0, 4) : [],
    answer: String(q.answer ?? ""),
    explanation: String(q.explanation ?? "")
  };
}

function injectHallus(safe10, hallu2) {
  // positions fixes : Q4 et Q8 (index 3 et 7)
  const s = safe10.slice(0, 10).map(q => ({ ...normalizeQuestion(q), kind: "safe" }));
  const h = hallu2.slice(0, 2).map(q => ({ ...normalizeQuestion(q), kind: "halu" }));

  // fallback : si hallu manque, on laisse safe
  if (h.length < 2) return s;

  const out = [];
  out.push(...s.slice(0, 3));
  out.push(h[0]);
  out.push(...s.slice(3, 6));
  out.push(h[1]);
  out.push(...s.slice(6, 10));
  return out.slice(0, 10);
}

// timeout helper côté serveur (évite les fonctions Vercel qui traînent)
async function withTimeout(promise, ms, label = "timeout") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // accept POST (avoid optionnel) ou GET (sans avoid)
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
- Évite aussi les "classiques" trop fréquents.
- Varie les domaines.`
      : "";

    const prompt = `Tu es un créateur de quiz de culture générale pour un public adulte cultivé (niveau "quiz de bar entre amis").

Génère 10 questions QCM en français de NIVEAU INTERMÉDIAIRE :
- Ni trop faciles (évite "Quelle est la capitale de la France ?", "Quel est le féminin d'acteur ?")
- Ni trop difficiles (évite "Quelle est la formule de l'azote liquide ?", "Prix Nobel de physique 1987 ?")
- Niveau cible : questions qu'une personne cultivée connaît, mais qui nécessitent réflexion

DIVERSITÉ THÉMATIQUE OBLIGATOIRE (varie au maximum) :
- Histoire (événements marquants, dates importantes)
- Géographie (capitales moins connues, records naturels, pièges classiques)
- Sciences (découvertes, inventeurs, phénomènes naturels)
- Arts & Culture (auteurs classiques, œuvres majeures, mouvements artistiques)
- Sport (règles, records, compétitions majeures)
- Actualité/Société (événements récents importants, institutions)
- Cinéma/Musique (films/albums cultes, réalisateurs/artistes majeurs)

EXEMPLES DE BON NIVEAU :
✅ "En quelle année est tombé le mur de Berlin ?" (1989)
✅ "Quel est le plus grand désert du monde ?" (Antarctique - piège courant)
✅ "Qui a écrit '1984' ?" (George Orwell)
✅ "Combien de joueurs dans une équipe de rugby ?" (15)
✅ "Quelle est la plus haute montagne d'Afrique ?" (Kilimandjaro)

Chaque question :
- 4 options différentes et crédibles
- 1 seule bonne réponse
- answer EXACTEMENT une des options
- explanation courte (1-2 phrases max, pédagogique)

${avoidBlock}

IMPÉRATIF : Aucune question triviale type "capitale de France", "féminin d'acteur", "couleur du ciel".
IMPÉRATIF : Varie absolument les domaines (pas 3 questions de géo d'affilée).

FORMAT : retourne STRICTEMENT un objet JSON avec une clé "questions" contenant un tableau de 10 objets:
{
  "questions": [
    {"q":"...","options":["A","B","C","D"],"answer":"...","explanation":"..."}
  ]
}
`;

    // 1) Générer un quiz safe (ton existant) avec retry
    let safeQuiz = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await withTimeout(
        client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          response_format: { type: "json_object" }
        }),
        25000,
        "safeQuiz_timeout"
      );

      const text = response.choices[0]?.message?.content || "{}";
      let parsed;
      try {
        const obj = JSON.parse(text);
        parsed = obj.questions || obj.data || [];
      } catch {
        continue;
      }
      
      // ✅ VALIDATION ANTI-REDITE : rejeter si questions déjà vues
      if (isValidQuiz(parsed)) {
        const avoidLower = avoid.map(q => q.toLowerCase().trim());
        const hasDuplicate = parsed.some(q => 
          avoidLower.some(oldQ => 
            oldQ.includes(q.q.toLowerCase().trim()) || 
            q.q.toLowerCase().trim().includes(oldQ)
          )
        );
        
        if (!hasDuplicate) {
          safeQuiz = parsed;
          break;
        }
        // Si duplicate trouvé, on continue à retry
      }
    }

    if (!safeQuiz) {
      return res.status(500).json({
        error: "Quiz safe invalide généré, réessaie.",
        details: "Validation failed after retries."
      });
    }

    // 2) Générer 2 hallus avec timeout + fallback
    let hallus = [];
    try {
      hallus = await withTimeout(
        generateHalluQuestions({ n: 2, timeoutMs: 12000 }),
        13000,
        "hallu_timeout"
      );
    } catch {
      hallus = [];
    }

    // 3) Injecter Q4 et Q8
    const finalQuiz = injectHallus(safeQuiz, hallus);

    return res.status(200).json(finalQuiz);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
