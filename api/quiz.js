import OpenAI from "openai";
import { generateHalluQuestions } from "../lib/generateHallu.js";
import { injectHallus } from "../lib/injectHallus.js";




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
- Évite aussi les “classiques” trop fréquents.
- Varie les domaines.`
      : "";

    const prompt = `
Tu es un professeur exigeant de lycée français (niveau Terminale), clair et pédagogique.

Génère 10 questions QCM variées en français.
Chaque question:
- 4 options différentes
- 1 seule bonne réponse
- answer EXACTEMENT une des options
- explication courte (1-2 phrases max)

${avoidBlock}

FORMAT : retourne STRICTEMENT du JSON valide (pas de texte autour), tableau de 10 objets:
[
  {"q":"...","options":["A","B","C","D"],"answer":"...","explanation":"..."}
]
`;

    // 1) Générer un quiz safe (ton existant) avec retry
    let safeQuiz = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await withTimeout(
        client.responses.create({
          model: "gpt-4.1-mini",
          input: prompt,
          temperature: 0.7
        }),
        18000,
        "safeQuiz_timeout"
      );

      const text = response.output_text || "";
      let parsed;
      try {
        parsed = safeJsonArrayFromText(text);
      } catch {
        continue;
      }
      if (isValidQuiz(parsed)) {
        safeQuiz = parsed;
        break;
      }
    }

    if (!safeQuiz) {
      return res.status(500).json({
        error: "Quiz safe invalide généré, réessaie.",
        details: "Validation failed after retries."
      });
    }

    // 2) Générer 2 hallus (avec garantie absolue)
let hallus = [];
try {
  hallus = await withTimeout(
    generateHalluQuestions(client, { n: 2, timeoutMs: 12000 }),
    13000,
    "hallu_timeout"
  );
} catch {
  hallus = [];
}

// nettoyage strict
hallus = Array.isArray(hallus) ? hallus : [];
hallus = hallus.filter(h =>
  h &&
  h.kind === "halu" &&
  typeof h.q === "string" &&
  h.q.trim() &&
  Array.isArray(h.options) &&
  h.options.length === 4
);

// fallback garanti
while (hallus.length < 2) {
  hallus.push(getFallbackHallu());
}
hallus = hallus.slice(0, 2);

// 3) Injection finale
const finalQuiz = injectHallus(safeQuiz, hallus);

return res.status(200).json(finalQuiz);

    } catch (e) {
  return res.status(500).json({
    error: "Server error",
    details: String(e?.message || e)
  });
}

}
