const https = require('https');

// ── Utilitaire appel HTTPS ──────────────────────────────────────────────
function callOpenAI(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Réponse OpenAI invalide')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Détection des répétitions côté code (100% fiable) ──────────────────
function detectRepetitions(text) {
  const lines = text
    .split(/[\n\r]+/)
    .map(l => l.trim())
    .filter(l => l.length >= 15);

  function normalize(s) {
    return s.toLowerCase().replace(/[?!.,;:]+$/g, '').replace(/\s+/g, ' ').trim();
  }

  function similarity(a, b) {
    const wa = new Set(normalize(a).split(' '));
    const wb = new Set(normalize(b).split(' '));
    const intersection = [...wa].filter(w => wb.has(w)).length;
    const union = new Set([...wa, ...wb]).size;
    return union === 0 ? 0 : intersection / union;
  }

  const groups = [];
  const used = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < lines.length; j++) {
      if (used.has(j)) continue;
      if (similarity(lines[i], lines[j]) >= 0.75) {
        group.push(j);
        used.add(j);
      }
    }
    if (group.length > 1) {
      used.add(i);
      groups.push({
        text: lines[i],
        count: group.length,
        exact: group.every(idx => normalize(lines[idx]) === normalize(lines[i]))
      });
    }
  }

  return groups;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const { content, task, sector, mode, image } = req.body;
  if (!task) return res.status(400).json({ error: "Tâche requise" });
  if (mode === 'text' && (!content || content.length > 8000)) return res.status(400).json({ error: "Contenu texte manquant ou trop long" });
  if (mode === 'image' && !image) return res.status(400).json({ error: "Image manquante" });

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) return res.status(500).json({ error: "Clé API manquante" });

  // ── Détection répétitions avant appel IA ───────────────────────────
  let repetitionsContext = '';
  if (mode === 'text' && content) {
    const detectedRepetitions = detectRepetitions(content);
    if (detectedRepetitions.length > 0) {
      repetitionsContext = `\n\nRÉPÉTITIONS DÉTECTÉES PAR ANALYSE AUTOMATIQUE (à intégrer obligatoirement dans "Incohérences structurelles") :\n`;
      detectedRepetitions.forEach((r, i) => {
        repetitionsContext += `${i + 1}. "${r.text.substring(0, 80)}" — apparaît ${r.count} fois (${r.exact ? 'identique' : 'quasi-identique'})\n`;
      });
      repetitionsContext += `Tu DOIS inclure chacune comme une issue distincte.`;
    }
  }

  // ── PROMPT SYSTÈME — 2 passes ───────────────────────────────────────
  const systemPrompt = `Tu es un relecteur expert bilingue français/anglais. Tu analyses des documents avec une rigueur absolue en deux passes successives.

══ PASSE 1 — RÉVISION CLASSIQUE (erreurs universelles) ══

Cherche toutes les erreurs qu'un relecteur humain professionnel relèverait, indépendamment de l'origine du texte :

ORTHOGRAPHE & GRAMMAIRE
- Fautes d'orthographe (y compris accents manquants ou incorrects sur majuscules)
- Accords incorrects : sujet/verbe, adjectif/nom, participe passé
- Conjugaisons fautives
- Mots manquants ou en trop
- Erreurs de typographie (espaces manquants, double espace, ponctuation mal placée)

STYLE & COHÉRENCE
- Incohérences de style ou de registre dans le document
- Nomenclature incohérente (même entité écrite différemment)
- Ponctuation incohérente entre les sections (certaines phrases avec point final, d'autres sans)
- Anglicismes inutiles quand un terme français existe
- Formulations ambiguës ou maladroites

STRUCTURE
- Hiérarchie d'information incohérente
- Sections manquantes ou mal ordonnées
- Répétitions d'idées ou de formulations

══ PASSE 2 — DÉTECTION PATTERNS IA (erreurs spécifiques aux LLMs) ══

Sur le contenu analysé en passe 1, cherche en plus :

HALLUCINATIONS & CHIFFRES
- Chiffres précis sans source ou avec source invérifiable
- Affirmations trop assertives sur des sujets incertains
- Généralisations abusives ("toutes les études montrent...", "il est prouvé que...")

TON IA TYPIQUE
- Transitions artificielles ("Il est important de noter que...", "En conclusion, il convient de...")
- Formulations génériques qui ne répondent pas vraiment à la tâche
- Listes à puces systématiques injustifiées

CONTEXTE
- L'output ne répond pas vraiment à la tâche demandée
- Le secteur métier n'est pas réellement pris en compte

══ RÈGLES ABSOLUES ══
- Signale une erreur uniquement si tu en es certain. En cas de doute, abstiens-toi.
- Un mot peut être singulier ou pluriel selon le contexte — vérifie le sens avant de signaler.
- Pour les accents sur majuscules : en français, É, È, À, Ù sont corrects. Signale uniquement les accents manifestement incorrects.
- Ne jamais inventer une erreur pour remplir une catégorie.
- Si une catégorie est propre, marque clean: true et issues: [].
- Pour les chiffres douteux : needsSourceCheck = true + une sourceQuery précise en anglais.

FORMAT : JSON uniquement, sans markdown, sans backticks, sans texte avant ou après.
{
  "reliabilityScore": <0-100>,
  "reliabilityLevel": <"Fiable" | "À revoir" | "Non livrable">,
  "summary": <string, 1-2 phrases résumant les principaux problèmes>,
  "scoreBreakdown": {
    "factuel": <0-100>,
    "structure": <0-100>,
    "ton": <0-100>,
    "contexte": <0-100>,
    "linguistique": <0-100>
  },
  "categories": [
    {
      "name": <string>,
      "issues": [
        {
          "excerpt": <string, extrait exact max 100 chars>,
          "description": <string, explication précise et certaine>,
          "type": <string>,
          "problemType": <string, ex: "Faute d'orthographe", "Accord incorrect", "Répétition", "Chiffre non sourcé", "Ton IA">,
          "needsSourceCheck": <boolean>,
          "sourceQuery": <string | null>
        }
      ],
      "clean": <boolean>
    }
  ],
  "promptSuggestions": [
    {
      "problem": <string>,
      "suggestion": <string, instruction directe en prompt engineering>
    }
  ]
}`;

  const promptPrefix = `TÂCHE DEMANDÉE : ${task}\nSECTEUR : ${sector || 'Non spécifié'}\n\n`;
  const promptSuffix = `${repetitionsContext}\n\nAPPLIQUE les 2 passes dans ta réflexion interne, puis retourne UNIQUEMENT le JSON final.`;

  let userMessage;
  if (mode === 'image') {
    const matches = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: "Format image invalide" });
    userMessage = {
      role: "user",
      content: [
        { type: "text", text: promptPrefix + "DOCUMENT À ANALYSER : L'image ci-dessous." + promptSuffix },
        { type: "image_url", image_url: { url: `data:${matches[1]};base64,${matches[2]}`, detail: "high" } }
      ]
    };
  } else {
    userMessage = {
      role: "user",
      content: promptPrefix + `DOCUMENT À ANALYSER :\n---\n${content}\n---` + promptSuffix
    };
  }

  try {
    // ── APPEL 1 : ANALYSE COMPLÈTE (2 passes) ──────────────────────────
    const analysisResult = await callOpenAI({
      model: "gpt-4o",
      response_format: { type: "json_object" }, // ← force JSON, élimine les "Je suis désolé"
      messages: [{ role: "system", content: systemPrompt }, userMessage],
      temperature: 0.1,
      max_tokens: 3000
    }, OPENAI_KEY);

    if (analysisResult.error) {
      return res.status(500).json({ error: 'Erreur API OpenAI', details: analysisResult.error.message });
    }

    const raw = analysisResult.choices?.[0]?.message?.content;
    if (!raw) return res.status(500).json({ error: 'Réponse vide de OpenAI' });

    // Parsing sécurisé
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch(e) {
      console.error('JSON parse error:', raw.substring(0, 200));
      return res.status(500).json({ error: 'Format de réponse invalide', details: 'GPT-4o n\'a pas retourné un JSON valide' });
    }

    // ── APPEL 2 : VÉRIFICATION WEB DES SOURCES ────────────────────────
    const toCheck = [];
    (parsed.categories || []).forEach((cat, catIdx) => {
      (cat.issues || []).forEach((issue, issueIdx) => {
        if (issue.needsSourceCheck && issue.sourceQuery) {
          toCheck.push({ catIdx, issueIdx, query: issue.sourceQuery, excerpt: issue.excerpt });
        }
      });
    });

    if (toCheck.length > 0) {
      const checksToRun = toCheck.slice(0, 4);
      const checkResults = await Promise.all(checksToRun.map(async (item) => {
        try {
          const checkResult = await callOpenAI({
            model: "gpt-4o-search-preview",
            messages: [
              {
                role: "system",
                content: `Tu vérifies si une source existe et contient un chiffre précis. Réponds UNIQUEMENT en JSON sans markdown : { "status": "confirmed" | "exists_but_not_found" | "not_found", "explanation": <string courte en français>, "url": <string | null> }`
              },
              {
                role: "user",
                content: `Affirmation : "${item.excerpt}"\nRequête : ${item.query}`
              }
            ],
            web_search_options: { search_context_size: "low" }
          }, OPENAI_KEY);

          const rawCheck = checkResult.choices?.[0]?.message?.content || '{}';
          return { ...item, result: JSON.parse(rawCheck.replace(/```json|```/g, '').trim()) };
        } catch(e) {
          return { ...item, result: { status: 'not_found', explanation: 'Vérification impossible.', url: null } };
        }
      }));

      checkResults.forEach(({ catIdx, issueIdx, result }) => {
        if (parsed.categories[catIdx]?.issues[issueIdx]) {
          parsed.categories[catIdx].issues[issueIdx].sourceCheck = result;
        }
      });
    }

    return res.status(200).json(parsed);

  } catch(e) {
    console.error('Erreur scan-content:', e);
    return res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
};
