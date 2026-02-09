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
  
  // Français & Langue (limité)
  "les règles d'accord de conjugaison en français",
  "les homophones courants en français",
  "les figures de style littéraires",
  
  // Capitales (SANS la France, variées)
  "les capitales d'Europe de l'Est",
  "les capitales d'Amérique du Sud",
  "les capitales d'Asie du Sud-Est",
  "les capitales d'Afrique subsaharienne",
  "les capitales d'Océanie",
  "les capitales scandinaves",
  "les capitales du Moyen-Orient",
  
  // Histoire MONDIALE (pas que française)
  "les grandes batailles de l'Histoire mondiale",
  "les empires antiques",
  "les explorateurs célèbres",
  "l'Antiquité romaine",
  "les pharaons égyptiens",
  "la Seconde Guerre mondiale",
  "les rois et reines d'Angleterre",
  "les présidents américains marquants",
  "la Guerre Froide",
  "les inventions de la Renaissance",
  "les civilisations précolombiennes",
  "la dynastie chinoise",
  
  // Géographie
  "les plus longs fleuves du monde",
  "les plus hauts sommets par continent",
  "les déserts du monde",
  "les océans et mers",
  "les îles célèbres",
  "les volcans actifs",
  "les pays les plus peuplés",
  "les fuseaux horaires",
  "les chutes d'eau célèbres",
  "les grands lacs du monde",
  
  // Sciences
  "le système solaire et les planètes",
  "les éléments chimiques courants",
  "les organes du corps humain",
  "les maladies historiques",
  "les inventions du 20e siècle",
  "les scientifiques célèbres",
  "la physique newtonienne",
  "les espèces en voie de disparition",
  "les dinosaures",
  "la génétique de base",
  "les phénomènes naturels",
  "les découvertes médicales",
  
  // Nature & Animaux
  "les records du monde animal",
  "les mammifères marins",
  "les oiseaux migrateurs",
  "les insectes remarquables",
  "les arbres et forêts",
  "les phénomènes météorologiques",
  "les minéraux et pierres précieuses",
  "les félins sauvages",
  "les primates",
  "les reptiles",
  
  // Arts & Culture MONDIALE
  "les peintres impressionnistes",
  "les sculpteurs célèbres",
  "les mouvements artistiques du 20e siècle",
  "les musées célèbres du monde",
  "l'architecture gothique",
  "les monuments du monde",
  "les Sept Merveilles du monde",
  "l'art contemporain",
  "la photographie",
  
  // Littérature MONDIALE
  "les auteurs du 19e siècle",
  "les prix Nobel de littérature",
  "les romans dystopiques",
  "les pièces de Shakespeare",
  "les contes et légendes du monde",
  "les poètes romantiques",
  "les bandes dessinées japonaises (manga)",
  "la science-fiction classique",
  "les auteurs britanniques",
  "les auteurs américains",
  
  // Cinéma
  "le cinéma des années 80",
  "le cinéma des années 90",
  "les réalisateurs oscarisés",
  "les franchises cinéma à succès",
  "les acteurs et actrices légendaires",
  "les studios d'animation",
  "le cinéma d'horreur",
  "le cinéma d'action",
  "les films de science-fiction",
  
  // Musique
  "les compositeurs classiques",
  "les instruments de musique",
  "le rock des années 70",
  "la pop des années 80",
  "le hip-hop et rap",
  "les groupes britanniques célèbres",
  "les festivals de musique",
  "les genres musicaux",
  "le jazz et le blues",
  "la musique électronique",
  
  // Sport
  "les Jeux olympiques d'été",
  "les Jeux olympiques d'hiver",
  "les règles du football",
  "les règles du rugby",
  "les règles du basketball",
  "les records du monde en athlétisme",
  "les champions de tennis",
  "le cyclisme professionnel",
  "les sports de combat",
  "les sports extrêmes",
  "la Formule 1",
  "le golf professionnel",
  
  // Gastronomie MONDIALE
  "les cuisines asiatiques",
  "les cuisines méditerranéennes",
  "les épices et aromates",
  "les fruits exotiques",
  "les techniques de cuisson",
  "les boissons alcoolisées du monde",
  "les desserts célèbres",
  
  // Technologie
  "les inventeurs de l'informatique",
  "l'histoire d'Internet",
  "les langages de programmation",
  "les réseaux sociaux",
  "les jeux vidéo cultes",
  "les consoles de jeux",
  "l'intelligence artificielle",
  "les smartphones et tablettes",
  "les cryptomonnaies",
  
  // Mythologie
  "la mythologie grecque",
  "la mythologie romaine",
  "la mythologie nordique",
  "les créatures mythologiques",
  "les dieux égyptiens",
  "la mythologie asiatique",
  
  // Religion & Philosophie
  "les grandes religions du monde",
  "les philosophes de l'Antiquité",
  "les philosophes des Lumières",
  "les courants philosophiques",
  "les textes sacrés",
  
  // Économie & Société
  "les monnaies du monde",
  "les entreprises multinationales",
  "les organisations internationales",
  "les droits de l'homme",
  "les prix Nobel de la paix",
  "l'Union Européenne",
  
  // Mode & Design
  "les grands couturiers",
  "les styles vestimentaires",
  "les designers célèbres",
  
  // Transport
  "l'histoire de l'automobile",
  "l'aviation commerciale",
  "les trains à grande vitesse",
  "les bateaux célèbres",
  "les motos légendaires",
  
  // Espace
  "les missions spatiales",
  "les astronautes célèbres",
  "les satellites et sondes",
  "les étoiles et constellations",
  "les galaxies",
  
  // Divers
  "les drapeaux du monde",
  "les symboles nationaux",
  "les langues les plus parlées",
  "les records du Guinness",
  "les inventions anciennes",
  "les merveilles naturelles",
  "les parcs nationaux célèbres",
  "les villes les plus peuplées",
  "les gratte-ciels célèbres"
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

    const prompt = `Tu es un créateur de quiz Trivial Pursuit pour adultes.

Génère EXACTEMENT 10 questions QCM en français, une question par thème imposé ci-dessous.

THÈMES IMPOSÉS (1 question par thème, dans l'ordre) :
${randomThemes.map((theme, i) => `${i + 1}. ${theme}`).join("\n")}

NIVEAU : TRIVIAL PURSUIT
- Questions qu'on pose dans un quiz de bar/soirée entre amis
- Culture générale solide MAIS accessible
- Le joueur doit réfléchir 2-3 secondes mais peut trouver

EXEMPLES DE BON NIVEAU :
✅ "Qui a peint 'Guernica' ?" (Picasso)
✅ "Quelle est la monnaie du Japon ?" (Yen)
✅ "Combien de cordes a une guitare classique ?" (6)
✅ "En quelle année l'homme a marché sur la Lune ?" (1969)
✅ "Quel océan borde l'ouest de l'Afrique ?" (Atlantique)
✅ "Combien fait 7 × 9 ?" (63)

🚫 BLACKLIST ABSOLUE - INTERDICTION TOTALE de ces sujets ultra-vus :
- La Joconde / Léonard de Vinci
- Tour Eiffel
- Révolution française / 1789
- Capitale de France / Paris
- Einstein
- Napoléon
- Qui a écrit Les Misérables
- Pluriel de cheval
- Féminin d'acteur
- Pizza italienne
- 2+2 ou additions triviales

DIVERSITÉ OBLIGATOIRE :
- Varie les pays, époques, disciplines
- Privilégie les œuvres/personnages moins connus mais reconnaissables
- Exemples arts : Guernica, Le Cri, Le Baiser, La Jeune Fille à la perle
- Exemples géo : Oslo, Buenos Aires, Hanoï (pas Paris/Londres)
- Exemples histoire : 1969, 1945, chute mur Berlin (pas 1789)

RÈGLES STRICTES :
- Pour CHAQUE thème, génère UNE question pertinente Trivial Pursuit
- 4 options différentes et plausibles
- 1 seule bonne réponse
- answer doit être EXACTEMENT l'une des 4 options
- explanation courte et intéressante (1-2 phrases)

${avoidBlock}

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
      // Passer les thèmes des positions 4 et 8 (index 3 et 7) aux hallus
      const halluThemes = [randomThemes[3], randomThemes[7]];
      
      hallus = await withTimeout(
        generateHalluQuestions({ 
          n: 2, 
          timeoutMs: 12000,
          themes: halluThemes 
        }),
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
