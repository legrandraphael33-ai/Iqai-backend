const https = require('https');

// ── Utilitaire appel HTTPS générique ───────────────────────────────────
function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Réponse invalide')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callOpenAI(payload, apiKey) {
  return httpPost('api.openai.com', '/v1/chat/completions', {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  }, JSON.stringify(payload));
}

// ── LanguageTool : orthographe et grammaire fiables ────────────────────
async function checkWithLanguageTool(text, lang = 'fr') {
  try {
    const body = new URLSearchParams({ text, language: lang, enabledOnly: 'false' }).toString();
    const result = await httpPost(
      'api.languagetool.org', '/v2/check',
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    );
    if (!result.matches) return [];

    const relevantCategories = ['TYPOS', 'GRAMMAR', 'CASING', 'COMPOUNDING', 'TYPOGRAPHY'];

    return result.matches
      .filter(m => relevantCategories.includes(m.rule?.category?.id))
      .map(m => ({
        excerpt: text.substring(Math.max(0, m.offset - 20), m.offset + m.length + 20).trim(),
        word: text.substring(m.offset, m.offset + m.length),
        description: m.message,
        suggestions: m.replacements?.slice(0, 3).map(r => r.value) || [],
        type: 'Erreur linguistique',
        problemType: m.rule?.category?.name || 'Orthographe / Grammaire',
        needsSourceCheck: false,
        sourceQuery: null
      }));
  } catch(e) {
    console.error('LanguageTool error:', e.message);
    return []; // Si LanguageTool est down, on continue sans bloquer
  }
}

// ── Détection répétitions (Jaccard) ────────────────────────────────────
function detectRepetitions(text) {
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length >= 15);
  function normalize(s) { return s.toLowerCase().replace(/[?!.,;:]+$/g, '').replace(/\s+/g, ' ').trim(); }
  function similarity(a, b) {
    const wa = new Set(normalize(a).split(' '));
    const wb = new Set(normalize(b).split(' '));
    const inter = [...wa].filter(w => wb.has(w)).length;
    const union = new Set([...wa, ...wb]).size;
    return union === 0 ? 0 : inter / union;
  }
  const groups = [], used = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < lines.length; j++) {
      if (!used.has(j) && similarity(lines[i], lines[j]) >= 0.75) { group.push(j); used.add(j); }
    }
    if (group.length > 1) { used.add(i); groups.push({ text: lines[i], count: group.length, exact: group.every(idx => normalize(lines[idx]) === normalize(lines[i])) }); }
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

  // ── ÉTAPE 1 : LanguageTool + Jaccard en parallèle (rapide) ──────────
  let ltIssues = [];
  let repetitionsContext = '';

  if (mode === 'text' && content) {
    const [ltResults, repetitions] = await Promise.all([
      checkWithLanguageTool(content, 'fr'),
      Promise.resolve(detectRepetitions(content))
    ]);
    ltIssues = ltResults;
    if (repetitions.length > 0) {
      repetitionsContext = `\n\nRÉPÉTITIONS DÉTECTÉES (intègre-les toutes dans "Incohérences structurelles") :\n`;
      repetitions.forEach((r, i) => {
        repetitionsContext += `${i + 1}. "${r.text.substring(0, 80)}" — ${r.count} fois (${r.exact ? 'identique' : 'quasi-identique'})\n`;
      });
      repetitionsContext += `Tu DOIS inclure chacune comme une issue distincte.`;
    }
  }

  // ── ÉTAPE 2 : GPT-4o — analyse sans orthographe ─────────────────────
  const systemPrompt = `Tu es un agent d'analyse de documents. LanguageTool gère déjà l'orthographe et la grammaire de base — tu NE vérifies PAS l'orthographe, les accents ou les accords. Concentre-toi uniquement sur ce que tu fais mieux que tout autre outil.

TES RESPONSABILITÉS EXCLUSIVES :

1. INCOHÉRENCES FACTUELLES
   - Chiffres précis sans source ou avec source invérifiable
   - Affirmations trop assertives sur des sujets incertains
   - Généralisations abusives ("toutes les études montrent...", "il est prouvé que...")
   - Fausse précision, dates approximatives

2. INCOHÉRENCES STRUCTURELLES
   - Répétitions d'idées (tu recevras la liste exhaustive — intègre-les toutes)
   - Contradictions entre deux parties du document
   - Structure disproportionnée par rapport à la tâche

3. TON & STYLE IA
   - Transitions artificielles ("Il est important de noter que...", "En conclusion, il convient de...")
   - Formulations génériques qui ne répondent pas vraiment à la tâche
   - Changement de registre injustifié
   - Listes à puces systématiques injustifiées

4. ADÉQUATION À LA TÂCHE
   - L'output ne répond pas vraiment à ce qui était demandé
   - Le secteur métier n'est pas réellement pris en compte
   - Conseils trop génériques pour être actionnables

RÈGLES ABSOLUES :
- Ne signale JAMAIS une faute d'orthographe, d'accent ou d'accord — c'est géré par LanguageTool.
- Ne signale une erreur que si tu en es certain.
- Si une catégorie est propre, marque clean: true et issues: [].
- Pour les chiffres douteux : needsSourceCheck = true + sourceQuery précise en anglais.

FORMAT : JSON uniquement, sans markdown, sans backticks.
{
  "reliabilityScore": <0-100>,
  "reliabilityLevel": <"Fiable" | "À revoir" | "Non livrable">,
  "summary": <string, 1-2 phrases>,
  "scoreBreakdown": { "factuel": <0-100>, "structure": <0-100>, "ton": <0-100>, "contexte": <0-100>, "linguistique": <0-100> },
  "categories": [
    {
      "name": <string>,
      "issues": [
        {
          "excerpt": <string, extrait exact max 100 chars>,
          "description": <string>,
          "type": <string>,
          "problemType": <string>,
          "needsSourceCheck": <boolean>,
          "sourceQuery": <string | null>
        }
      ],
      "clean": <boolean>
    }
  ],
  "promptSuggestions": [{ "problem": <string>, "suggestion": <string> }]
}`;

  const promptPrefix = `TÂCHE : ${task}\nSECTEUR : ${sector || 'Non spécifié'}\n\n`;
  const promptSuffix = `${repetitionsContext}\n\nRetourne UNIQUEMENT le JSON final.`;

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
    userMessage = { role: "user", content: promptPrefix + `DOCUMENT À ANALYSER :\n---\n${content}\n---` + promptSuffix };
  }

  try {
    const analysisResult = await callOpenAI({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: systemPrompt }, userMessage],
      temperature: 0.1,
      max_tokens: 3000
    }, OPENAI_KEY);

    if (analysisResult.error) return res.status(500).json({ error: 'Erreur API OpenAI', details: analysisResult.error.message });

    const raw = analysisResult.choices?.[0]?.message?.content;
    if (!raw) return res.status(500).json({ error: 'Réponse vide de OpenAI' });

    let parsed;
    try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
    catch(e) { return res.status(500).json({ error: 'Format de réponse invalide' }); }

    // ── ÉTAPE 3 : Injecter les résultats LanguageTool dans le JSON ─────
    if (ltIssues.length > 0) {
      // Chercher la catégorie linguistique existante ou en créer une
      let ltCategory = parsed.categories?.find(c =>
        c.name?.toLowerCase().includes('linguistique') ||
        c.name?.toLowerCase().includes('orthographe') ||
        c.name?.toLowerCase().includes('erreur')
      );

      if (!ltCategory) {
        if (!parsed.categories) parsed.categories = [];
        ltCategory = { name: 'Erreurs linguistiques', issues: [], clean: false };
        parsed.categories.push(ltCategory);
      }

      // Ajouter les issues LanguageTool
      ltCategory.issues = [...(ltCategory.issues || []), ...ltIssues];
      ltCategory.clean = ltCategory.issues.length === 0;

      // Ajuster le score linguistique selon le nombre de fautes
      if (parsed.scoreBreakdown) {
        const penalty = Math.min(40, ltIssues.length * 8);
        parsed.scoreBreakdown.linguistique = Math.max(20, 100 - penalty);
        // Recalculer le score global
        const vals = Object.values(parsed.scoreBreakdown);
        parsed.reliabilityScore = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        parsed.reliabilityLevel = parsed.reliabilityScore >= 70 ? 'Fiable' : parsed.reliabilityScore >= 40 ? 'À revoir' : 'Non livrable';
      }
    }

    // ── ÉTAPE 4 : Vérification web des sources ─────────────────────────
    const toCheck = [];
    (parsed.categories || []).forEach((cat, catIdx) => {
      (cat.issues || []).forEach((issue, issueIdx) => {
        if (issue.needsSourceCheck && issue.sourceQuery) {
          toCheck.push({ catIdx, issueIdx, query: issue.sourceQuery, excerpt: issue.excerpt });
        }
      });
    });

    if (toCheck.length > 0) {
      const checkResults = await Promise.all(toCheck.slice(0, 4).map(async (item) => {
        try {
          const r = await callOpenAI({
            model: "gpt-4o-search-preview",
            messages: [
              { role: "system", content: `Vérifie si une source existe et contient ce chiffre. Réponds UNIQUEMENT en JSON : { "status": "confirmed" | "exists_but_not_found" | "not_found", "explanation": <string en français>, "url": <string | null> }` },
              { role: "user", content: `Affirmation : "${item.excerpt}"\nRequête : ${item.query}` }
            ],
            web_search_options: { search_context_size: "low" }
          }, OPENAI_KEY);
          const raw = r.choices?.[0]?.message?.content || '{}';
          return { ...item, result: JSON.parse(raw.replace(/```json|```/g, '').trim()) };
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
