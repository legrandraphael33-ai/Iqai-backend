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
  // Découper en phrases/lignes significatives (min 15 chars)
  const lines = text
    .split(/[\n\r]+/)
    .map(l => l.trim())
    .filter(l => l.length >= 15);

  // Normalisation pour comparaison : minuscules, sans ponctuation finale
  function normalize(s) {
    return s.toLowerCase().replace(/[?!.,;:]+$/g, '').replace(/\s+/g, ' ').trim();
  }

  // Similarité de Jaccard sur les mots
  function similarity(a, b) {
    const wa = new Set(normalize(a).split(' '));
    const wb = new Set(normalize(b).split(' '));
    const intersection = [...wa].filter(w => wb.has(w)).length;
    const union = new Set([...wa, ...wb]).size;
    return union === 0 ? 0 : intersection / union;
  }

  const groups = []; // groupes de répétitions détectées
  const used = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < lines.length; j++) {
      if (used.has(j)) continue;
      const sim = similarity(lines[i], lines[j]);
      if (sim >= 0.75) { // 75% de mots en commun = répétition
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
  let detectedRepetitions = [];
  if (mode === 'text' && content) {
    detectedRepetitions = detectRepetitions(content);
    if (detectedRepetitions.length > 0) {
      repetitionsContext = `\n\nRÉPÉTITIONS DÉTECTÉES PAR ANALYSE AUTOMATIQUE (exhaustif, à intégrer obligatoirement dans ta réponse JSON sous "Incohérences structurelles") :\n`;
      detectedRepetitions.forEach((r, i) => {
        repetitionsContext += `${i + 1}. "${r.text.substring(0, 80)}" — apparaît ${r.count} fois (${r.exact ? 'identique' : 'quasi-identique'})\n`;
      });
      repetitionsContext += `Tu DOIS inclure chacune de ces répétitions comme une issue distincte. Ne les ignore pas.`;
    }
  }

  // ── PROMPT PRINCIPAL ────────────────────────────────────────────────
  const systemPrompt = `Tu es un agent spécialisé dans la détection d'incohérences produites par des intelligences artificielles génératives (LLMs).

TON RÔLE : Tu n'analyses pas les erreurs humaines. Tu identifies spécifiquement les patterns d'erreur typiques des LLMs dans un output qui t'est soumis.

PATTERNS D'ERREUR IA QUE TU CHERCHES :

1. INCOHÉRENCES FACTUELLES
   - Chiffres précis sans source ou avec source incomplète
   - Dates approximatives ou légèrement fausses
   - Affirmations trop assertives sur des sujets incertains
   - Généralisations abusives ("toutes les études montrent...", "il est prouvé que...")
   - Fausse précision

2. INCOHÉRENCES STRUCTURELLES
   - Répétitions d'idées ou de phrases (tu recevras la liste exhaustive si applicable — tu dois toutes les inclure)
   - Contradictions entre deux parties du texte
   - Longueur disproportionnée par rapport à la tâche

3. INCOHÉRENCES DE TON
   - Changement de registre sans raison
   - Formulations génériques qui ne répondent pas vraiment à la tâche
   - Transitions artificielles ("Il est important de noter que...", "En conclusion, il convient de...")
   - Listes à puces systématiques injustifiées

4. INCOHÉRENCES DE CONTEXTE
   - L'output ne répond pas vraiment à la tâche demandée
   - Le secteur métier n'est pas réellement pris en compte
   - Conseils trop génériques pour être actionnables

5. ERREURS LINGUISTIQUES
   - Fautes d'orthographe
   - Accords incorrects (sujet/verbe, adjectif/nom, participe passé)
   - Conjugaisons fautives
   - Anglicismes inutiles
   - Ponctuation aberrante

RÈGLES ABSOLUES :
- Tu ne dis JAMAIS qu'une affirmation est fausse si tu n'en es pas certain.
- Si tu ne détectes aucune incohérence dans une catégorie, tu le dis explicitement.
- Pour les suggestions de prompt : rédige des instructions directes en prompt engineering réel — précises, contraignantes, avec exemples si utile.
- Pour les chiffres avec source douteuse : needsSourceCheck = true + une sourceQuery précise en anglais.

FORMAT DE RÉPONSE : JSON uniquement, sans markdown, sans backticks.
{
  "reliabilityScore": <0-100, 100 = parfaitement fiable>,
  "reliabilityLevel": <"Fiable" | "À revoir" | "Non livrable">,
  "summary": <string, 1-2 phrases>,
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
          "description": <string, explication précise>,
          "trustable": <true | false | null>,
          "type": <string>,
          "problemType": <string, ex: "Chiffres non sourcés", "Répétition exacte", "Répétition quasi-identique", "Contradiction", "Faute d'orthographe", "Accord incorrect">,
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

  const promptPrefix = `TÂCHE DEMANDÉE À L'IA : ${task}\n\nSECTEUR MÉTIER : ${sector || 'Non spécifié'}\n\n`;
  const promptSuffix = `${repetitionsContext}\n\nProcède en 3 étapes dans ta réflexion interne :\nÉTAPE 1 — Décompose l'output en affirmations individuelles.\nÉTAPE 2 — Évalue chaque affirmation selon les 5 catégories. Intègre TOUTES les répétitions listées ci-dessus.\nÉTAPE 3 — Agrège et retourne uniquement le JSON final.`;

  let userMessage;
  if (mode === 'image') {
    const matches = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: "Format image invalide" });
    userMessage = {
      role: "user",
      content: [
        { type: "text", text: promptPrefix + "OUTPUT IA À ANALYSER : L'image ci-dessous contient l'output produit par une IA." + promptSuffix },
        { type: "image_url", image_url: { url: `data:${matches[1]};base64,${matches[2]}`, detail: "high" } }
      ]
    };
  } else {
    userMessage = {
      role: "user",
      content: promptPrefix + `OUTPUT IA À ANALYSER :\n---\n${content}\n---` + promptSuffix
    };
  }

  try {
    // ── APPEL 1 : ANALYSE ─────────────────────────────────────────────
    const analysisResult = await callOpenAI({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }, userMessage],
      temperature: 0.1,
      max_tokens: 3000
    }, OPENAI_KEY);

    if (analysisResult.error) {
      return res.status(500).json({ error: 'Erreur API OpenAI', details: analysisResult.error.message });
    }

    const raw = analysisResult.choices?.[0]?.message?.content;
    if (!raw) return res.status(500).json({ error: 'Réponse vide de OpenAI' });

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

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
          const cleanedCheck = rawCheck.replace(/```json|```/g, '').trim();
          return { ...item, result: JSON.parse(cleanedCheck) };
        } catch(e) {
          return { ...item, result: { status: 'not_found', explanation: 'Vérification impossible techniquement.', url: null } };
        }
      }));

      checkResults.forEach(({ catIdx, issueIdx, result }) => {
        if (parsed.categories[catIdx]?.issues[issueIdx]) {
          parsed.categories[catIdx].issues[issueIdx].sourceCheck = result;
          if (result.status === 'confirmed') parsed.categories[catIdx].issues[issueIdx].trustable = true;
          else if (result.status === 'not_found') parsed.categories[catIdx].issues[issueIdx].trustable = false;
        }
      });
    }

    return res.status(200).json(parsed);

  } catch(e) {
    console.error('Erreur scan-content:', e);
    return res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
};
