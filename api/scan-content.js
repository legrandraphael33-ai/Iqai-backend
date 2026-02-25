const https = require('https');

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

  // ── PROMPT EN 3 COUCHES ──────────────────────────────────────────────
  const systemPrompt = `Tu es un agent spécialisé dans la détection d'incohérences produites par des intelligences artificielles génératives (LLMs).

TON RÔLE : Tu n'analyses pas les erreurs humaines. Tu identifies spécifiquement les patterns d'erreur typiques des LLMs dans un output qui t'est soumis.

CONTEXTE : L'utilisateur te soumet un output produit par une IA, la tâche qui avait été demandée à cette IA, et le secteur métier concerné. Tu dois analyser cet output avec une rigueur maximale.

PATTERNS D'ERREUR IA QUE TU CHERCHES (et seulement ceux-là) :

1. INCOHÉRENCES FACTUELLES
   - Chiffres précis sans source ("34% des entreprises...", "en 2019, 1,2 million de...")
   - Dates approximatives ou légèrement fausses sur des faits connus
   - Affirmations trop assertives sur des sujets incertains
   - Généralisations abusives ("toutes les études montrent...", "il est prouvé que...")
   - Fausse précision : donner l'impression d'être expert sans l'être

2. INCOHÉRENCES STRUCTURELLES
   - Répétitions d'une même idée formulée différemment
   - Répétitions d'un même terme ou expression clé (>3 fois sans justification)
   - Contradictions entre deux parties du texte
   - Longueur ou niveau de détail disproportionné par rapport à la tâche

3. INCOHÉRENCES DE TON
   - Changement de registre sans raison (formel puis familier)
   - Formulations génériques qui ne répondent pas vraiment à la tâche
   - Transitions artificielles ("Il est important de noter que...", "En conclusion, il convient de...")
   - Listes à puces systématiques même quand le sujet ne le justifie pas

4. INCOHÉRENCES DE CONTEXTE
   - L'output ne répond pas vraiment à la tâche demandée
   - Le secteur métier n'est pas réellement pris en compte
   - Conseils trop génériques pour être actionnables dans ce contexte précis

RÈGLES ABSOLUES :
- Tu ne dis JAMAIS qu'une affirmation est fausse si tu n'en es pas certain. Tu dis "non vérifiable" ou "à vérifier".
- Tu exprimes TOUJOURS un niveau de confiance : ÉLEVÉ / MOYEN / FAIBLE
- Niveau ÉLEVÉ = pattern clairement identifiable, très probable
- Niveau MOYEN = pattern probable mais nécessite vérification externe
- Niveau FAIBLE = signal faible, à surveiller mais pas alarmant
- Si tu ne détectes aucune incohérence dans une catégorie, tu le dis explicitement.
- Tu ne cherches PAS les erreurs de l'humain qui a rédigé la tâche, seulement celles de l'IA.

FORMAT DE RÉPONSE : Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans texte avant ou après. Structure exacte :
{
  "riskScore": <nombre entre 0 et 100>,
  "riskLevel": <"FAIBLE" | "MODÉRÉ" | "ÉLEVÉ">,
  "summary": <string, 1-2 phrases résumant le verdict global>,
  "categories": [
    {
      "name": <string, nom de la catégorie>,
      "issues": [
        {
          "excerpt": <string, extrait exact du texte concerné, max 100 caractères>,
          "description": <string, explication de l'incohérence détectée>,
          "confidence": <"ÉLEVÉ" | "MOYEN" | "FAIBLE">,
          "type": <"factuelle" | "structurelle" | "ton" | "contexte">
        }
      ],
      "clean": <boolean, true si aucune incohérence dans cette catégorie>
    }
  ],
  "recommendation": <string, conseil actionnable en 1-2 phrases>
}`;

  // Construction du message utilisateur selon le mode
  let userMessage;
  const promptPrefix = `TÂCHE DEMANDÉE À L'IA : ${task}\n\nSECTEUR MÉTIER : ${sector || 'Non spécifié'}\n\n`;
  const promptSuffix = `\n\nProcède en 3 étapes dans ta réflexion interne (ne les écris pas dans ta réponse) :\nÉTAPE 1 — Décompose l'output en affirmations individuelles.\nÉTAPE 2 — Évalue chaque affirmation selon les 4 catégories de patterns d'erreur IA.\nÉTAPE 3 — Agrège et retourne uniquement le JSON final.`;

  if (mode === 'image') {
    // Extraire le base64 pur et le media type
    const matches = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: "Format image invalide" });
    const mediaType = matches[1];
    const base64Data = matches[2];

    userMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: promptPrefix + "OUTPUT IA À ANALYSER : L'image ci-dessous contient l'output produit par une IA. Analyse son contenu textuel." + promptSuffix
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mediaType};base64,${base64Data}`,
            detail: "high"
          }
        }
      ]
    };
  } else {
    userMessage = {
      role: "user",
      content: promptPrefix + `OUTPUT IA À ANALYSER :\n---\n${content}\n---` + promptSuffix
    };
  }

  // ── APPEL OPENAI ─────────────────────────────────────────────────────
  const payload = JSON.stringify({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      userMessage
    ],
    temperature: 0.1,
    max_tokens: 2000
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error('Réponse OpenAI invalide')); }
        });
      });

      request.on('error', reject);
      request.write(payload);
      request.end();
    });

    if (result.error) {
      console.error('Erreur OpenAI:', result.error);
      return res.status(500).json({ error: 'Erreur API OpenAI', details: result.error.message });
    }

    const raw = result.choices?.[0]?.message?.content;
    if (!raw) return res.status(500).json({ error: 'Réponse vide de OpenAI' });

    // Nettoyer au cas où le modèle aurait quand même mis des backticks
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return res.status(200).json(parsed);

  } catch(e) {
    console.error('Erreur scan-content:', e);
    return res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
};
