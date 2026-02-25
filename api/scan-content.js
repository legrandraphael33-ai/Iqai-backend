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

  // ── ÉTAPE 1 : ANALYSE DES INCOHÉRENCES ──────────────────────────────
  const systemPrompt = `Tu es un agent spécialisé dans la détection d'incohérences produites par des intelligences artificielles génératives (LLMs).

TON RÔLE : Tu n'analyses pas les erreurs humaines. Tu identifies spécifiquement les patterns d'erreur typiques des LLMs dans un output qui t'est soumis.

CONTEXTE : L'utilisateur te soumet un output produit par une IA, la tâche qui avait été demandée à cette IA, et le secteur métier concerné.

PATTERNS D'ERREUR IA QUE TU CHERCHES :

1. INCOHÉRENCES FACTUELLES
   - Chiffres précis sans source ou avec source incomplète
   - Dates approximatives ou légèrement fausses
   - Affirmations trop assertives sur des sujets incertains
   - Généralisations abusives ("toutes les études montrent...", "il est prouvé que...")
   - Fausse précision : donner l'impression d'être expert sans l'être

2. INCOHÉRENCES STRUCTURELLES
   - Répétitions d'une même idée formulée différemment
   - Répétitions d'un même terme (>3 fois sans justification)
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

RÈGLES ABSOLUES :
- Tu ne dis JAMAIS qu'une affirmation est fausse si tu n'en es pas certain. Tu dis "non vérifiable" ou "à vérifier".
- Si tu ne détectes aucune incohérence dans une catégorie, tu le dis explicitement.
- Tu ne cherches PAS les erreurs humaines, seulement celles de l'IA.
- Pour les suggestions de prompt : rédige-les comme des instructions directes à une IA en prompt engineering réel — précis, contraignant, avec exemples si utile. Pas de langage vague.

FORMAT DE RÉPONSE : JSON uniquement, sans markdown, sans backticks.
{
  "reliabilityScore": <0-100, 100 = parfaitement fiable>,
  "reliabilityLevel": <"Fiable" | "À revoir" | "Non livrable">,
  "summary": <string, 1-2 phrases>,
  "categories": [
    {
      "name": <string>,
      "issues": [
        {
          "excerpt": <string, extrait exact max 100 chars>,
          "description": <string, explication précise>,
          "trustable": <true | false | null>,
          "type": <string, ex: "chiffre sans source", "répétition", "généralisation abusive">,
          "problemType": <string, ex: "Chiffres non sourcés", "Données imprécises", "Manque de sources", "Répétitions", "Ton générique", "Hors sujet">,
          "needsSourceCheck": <boolean — true UNIQUEMENT si chiffre précis avec source nommée non vérifiable OU chiffre précis sans source>,
          "sourceQuery": <string | null — si needsSourceCheck true : requête courte et précise pour trouver la source, ex: "Deloitte 2024 enterprise AI hallucination 47%">
        }
      ],
      "clean": <boolean>
    }
  ],
  "promptSuggestions": [
    {
      "problem": <string, nom court du problème>,
      "suggestion": <string, instruction directe en prompt engineering, précise et contraignante>
    }
  ]
}`;

  const promptPrefix = `TÂCHE DEMANDÉE À L'IA : ${task}\n\nSECTEUR MÉTIER : ${sector || 'Non spécifié'}\n\n`;
  const promptSuffix = `\n\nProcède en 3 étapes dans ta réflexion interne :\nÉTAPE 1 — Décompose l'output en affirmations individuelles.\nÉTAPE 2 — Évalue chaque affirmation selon les 4 catégories.\nÉTAPE 3 — Agrège et retourne uniquement le JSON final.`;

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
      max_tokens: 2500
    }, OPENAI_KEY);

    if (analysisResult.error) {
      return res.status(500).json({ error: 'Erreur API OpenAI', details: analysisResult.error.message });
    }

    const raw = analysisResult.choices?.[0]?.message?.content;
    if (!raw) return res.status(500).json({ error: 'Réponse vide de OpenAI' });

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // ── APPEL 2 : VÉRIFICATION WEB DES SOURCES DOUTEUSES ─────────────
    const toCheck = [];
    (parsed.categories || []).forEach((cat, catIdx) => {
      (cat.issues || []).forEach((issue, issueIdx) => {
        if (issue.needsSourceCheck && issue.sourceQuery) {
          toCheck.push({ catIdx, issueIdx, query: issue.sourceQuery, excerpt: issue.excerpt });
        }
      });
    });

    if (toCheck.length > 0) {
      // Max 4 vérifications pour limiter les coûts
      const checksToRun = toCheck.slice(0, 4);

      const checkResults = await Promise.all(checksToRun.map(async (item) => {
        try {
          const checkResult = await callOpenAI({
            model: "gpt-4o-search-preview",
            messages: [
              {
                role: "system",
                content: `Tu es un agent de vérification de sources. Cherche sur le web si la source existe et si elle contient le chiffre mentionné. Réponds UNIQUEMENT en JSON sans markdown ni backticks : { "status": "confirmed" | "exists_but_not_found" | "not_found", "explanation": <string courte en français>, "url": <string | null> }. "confirmed" = source trouvée ET chiffre confirmé. "exists_but_not_found" = source trouvée mais chiffre absent ou différent. "not_found" = source introuvable.`
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

      // Injecter les résultats dans le JSON principal
      checkResults.forEach(({ catIdx, issueIdx, result }) => {
        if (parsed.categories[catIdx]?.issues[issueIdx]) {
          parsed.categories[catIdx].issues[issueIdx].sourceCheck = result;
          if (result.status === 'confirmed') {
            parsed.categories[catIdx].issues[issueIdx].trustable = true;
          } else if (result.status === 'not_found') {
            parsed.categories[catIdx].issues[issueIdx].trustable = false;
          }
          // exists_but_not_found → trustable reste null (incertain)
        }
      });
    }

    return res.status(200).json(parsed);

  } catch(e) {
    console.error('Erreur scan-content:', e);
    return res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
};
