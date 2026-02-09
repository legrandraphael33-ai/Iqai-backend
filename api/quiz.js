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

// ========== BANK DE THÈMES VARIÉS ==========
const THEME_BANK = [
  // Tables & Maths de base
  "les tables de multiplication",
  "les fractions et pourcentages simples",
  "les unités de mesure courantes",
  
  // Français & Langue
  "les règles d'accord de conjugaison en français",
  "les homophones courants en français",
  "les figures de style littéraires",
  "l'étymologie de mots français",
  
  // Capitales (SANS la France)
  "les capitales d'Europe de l'Est",
  "les capitales d'Amérique du Sud",
  "les capitales d'Asie",
  "les capitales d'Afrique",
  "les capitales d'Océanie",
  "les capitales scandinaves",
  
  // Histoire
  "les grandes batailles de l'Histoire",
  "les révolutions du 18e et 19e siècle",
  "les inventions de la Renaissance",
  "la Guerre Froide",
  "les explorateurs célèbres",
  "l'Antiquité romaine",
  "les pharaons égyptiens",
  "la Seconde Guerre mondiale",
  "les rois et reines d'Angleterre",
  "les présidents américains marquants",
  
  // Géographie
  "les plus longs fleuves du monde",
  "les plus hauts sommets par continent",
  "les déserts du monde",
  "les océans et mers",
  "les îles célèbres",
  "les volcans actifs",
  "les pays les plus peuplés",
  "les fuseaux horaires",
  
  // Sciences
  "le système solaire",
  "les éléments du tableau périodique courants",
  "les organes du corps humain",
  "les maladies historiques",
  "les inventions du 20e siècle",
  "les scientifiques célèbres",
  "la physique newtonienne",
  "les espèces en voie de disparition",
  "les dinosaures",
  "la génétique de base",
  
  // Nature & Animaux
  "les records du monde animal",
  "les mammifères marins",
  "les oiseaux migrateurs",
  "les insectes remarquables",
  "les arbres et forêts",
  "les phénomènes météorologiques",
  "les minéraux et pierres précieuses",
  
  // Arts & Culture
  "les peintres impressionnistes",
  "les sculpteurs célèbres",
  "les mouvements artistiques du 20e siècle",
  "les musées célèbres",
  "l'architecture gothique",
  "les monuments du monde",
  "les Sept Merveilles du monde",
  
  // Littérature
  "les auteurs du 19e siècle",
  "les prix Nobel de littérature",
  "les romans dystopiques",
  "les pièces de Shakespeare",
  "les contes et légendes",
  "les poètes français",
  "les bandes dessinées franco-belges",
  
  // Cinéma
  "le cinéma des années 80",
  "le cinéma des années 90",
  "les réalisateurs oscarisés",
  "les films cultes français",
  "les franchises cinéma à succès",
  "les acteurs et actrices légendaires",
  "les studios d'animation",
  
  // Musique
  "les compositeurs classiques",
  "les instruments de musique",
  "le rock des années 70",
  "la pop des années 2000",
  "les groupes britanniques célèbres",
  "les festivals de musique",
  "les genres musicaux",
  
  // Sport
  "les Jeux olympiques d'été",
  "les Jeux olympiques d'hiver",
  "les règles du football",
  "les règles du rugby",
  "les règles du basketball",
  "les records du monde en athlétisme",
  "les champions de tennis",
  "le Tour de France",
  "les sports de combat",
  "les sports extrêmes",
  
  // Gastronomie
  "les fromages français",
  "les vins et vignobles",
  "les cuisines du monde",
  "les épices et aromates",
  "les fruits exotiques",
  "les techniques de cuisson",
  
  // Technologie
  "les inventeurs de l'informatique",
  "l'histoire d'Internet",
  "les langages de programmation",
  "les réseaux sociaux",
  "les jeux vidéo cultes",
  "les consoles de jeux",
  "l'intelligence artificielle",
  
  // Mythologie
  "la mythologie grecque",
  "la mythologie romaine",
  "la mythologie nordique",
  "les créatures mythologiques",
  "les dieux égyptiens",
  
  // Religion & Philosophie
  "les grandes religions du monde",
  "les philosophes de l'Antiquité",
  "les philosophes des Lumières",
  "les courants philosophiques",
  
  // Économie & Société
  "les monnaies du monde",
  "les entreprises multinationales",
  "les organisations internationales",
  "les droits de l'homme",
  "les prix Nobel de la paix",
  
  // Mode & Design
  "les grands couturiers",
  "les styles vestimentaires",
  "les designers célèbres",
  
  // Transport
  "l'histoire de l'automobile",
  "l'aviation commerciale",
  "les trains à grande vitesse",
  "les bateaux célèbres",
  
  // Espace
  "les missions spatiales",
  "les astronautes célèbres",
  "les satellites et sondes",
  "les étoiles et constellations",
  
  // Divers
  "les drapeaux du monde",
  "les symboles nationaux",
  "les codes et langages secrets",
  "les superstitions",
  "les records du Guinness",
  "les phobies courantes",
  "les couleurs et leur symbolique",
  "les proverbes français",
  "les signes du zodiaque"
];

// Fonction pour tirer 10 thèmes aléatoires différents
function getRandomThemes(n = 10) {
  const shuffled = [...THEME_BANK].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
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
      ? `Questions récemment utilisées (à éviter absolument) :
${avoid.map((s, i) => `${i + 1}. ${s}`).join("\n")}

NE JAMAIS réutiliser ces questions ou des variantes.`
      : "";

    // Tirer 10 thèmes aléatoires
    const randomThemes = getRandomThemes(10);

    const prompt = `Tu es un créateur de quiz de culture générale pour un public adulte cultivé.

Génère EXACTEMENT 10 questions QCM en français, une question par thème imposé ci-dessous.

THÈMES IMPOSÉS (1 question par thème, dans l'ordre) :
${randomThemes.map((theme, i) => `${i + 1}. ${theme}`).join("\n")}

NIVEAU DE DIFFICULTÉ :
- Ni trop facile (évite "Quelle est la capitale de la France ?")
- Ni trop difficile (évite "Formule chimique de l'azote liquide ?")
- Niveau cible : culture générale solide, questions qu'une personne cultivée connaît

RÈGLES STRICTES :
- Pour CHAQUE thème, génère UNE question pertinente sur ce thème précis
- 4 options différentes et crédibles par question
- 1 seule bonne réponse
- answer doit être EXACTEMENT l'une des 4 options
- explanation courte et pédagogique (1-2 phrases max)

${avoidBlock}

EXEMPLES de bon niveau :
✅ "En quelle année est tombé le mur de Berlin ?" (1989)
✅ "Quel est le plus grand désert du monde ?" (Antarctique)
✅ "Qui a écrit '1984' ?" (George Orwell)

FORMAT : retourne STRICTEMENT un objet JSON avec une clé "questions" contenant un tableau de 10 objets:
{
  "questions": [
    {"q":"...","options":["A","B","C","D"],"answer":"...","explanation":"..."}
  ]
}
`;

    // 1) Générer un quiz safe avec retry
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
