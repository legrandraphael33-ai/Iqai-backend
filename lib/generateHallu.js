import OpenAI from "openai";

export async function generateHalluQuestions({ n = 2, timeoutMs = 12000, themes = [] } = {}) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // Si pas de thèmes fournis, utiliser des thèmes génériques
  const finalThemes = themes.length >= n ? themes.slice(0, n) : [
    "culture générale variée",
    "connaissances générales"
  ];
  
  const prompt = `Génère ${n} questions QCM "piège" en français de NIVEAU INTERMÉDIAIRE.

THÈMES IMPOSÉS (1 question par thème) :
${finalThemes.map((theme, i) => `${i + 1}. ${theme}`).join("\n")}

CONCEPT DES PIÈGES - TYPE "FAIT INVENTÉ CRÉDIBLE" :
Génère des questions sur le thème demandé, mais avec un FAIT LÉGÈREMENT FAUX mais PLAUSIBLE.

EXEMPLES DE BONS PIÈGES :
✅ Thème "records du monde animal" → "Quel animal peut survivre jusqu'à 3 ans sans boire ?" 
   Options : Chameau, Dromadaire, Kangourou, Autruche
   → Toutes ces options peuvent survivre longtemps sans eau, MAIS "3 ans" est FAUX (max 6-8 mois)
   → Un joueur vigilant pense "3 ans c'est trop, ça n'a pas de sens"

✅ Thème "le système solaire" → "Combien de lunes possède Jupiter ?"
   Options : 42, 53, 67, 79
   → Le vrai nombre change régulièrement (découvertes), mais proposer des chiffres arrondis suspects
   → Un joueur vigilant pense "ces chiffres semblent inventés"

✅ Thème "les records en athlétisme" → "Quel est le record du monde du 100m ?"
   Options : 9.48s, 9.52s, 9.56s, 9.61s
   → Le vrai est 9.58s (Usain Bolt), absent des options
   → Un joueur vigilant pense "je connais Bolt, c'était environ 9.58s, ça ne correspond pas"

RÈGLES STRICTES :
1. La question doit être sur le thème imposé
2. Le piège doit être SUBTIL : une date légèrement fausse, un chiffre exagéré, une durée irréaliste
3. Le joueur VIGILANT détecte l'incohérence (trop long, trop court, impossible, suspect)
4. Le joueur NON VIGILANT choisit une option qui semble plausible
5. AUCUNE question triviale : évite "capitale de France", "couleur du ciel", "pizza italienne"

NIVEAU REQUIS :
- Questions de culture générale SOLIDE (niveau intermédiaire)
- Pas de questions trop faciles ou trop difficiles

FORMAT TECHNIQUE :
- "answer" doit être UNE des 4 options (la plus plausible techniquement)
- "explanation" explique POURQUOI c'était un piège
  Exemple : "Le chameau peut survivre environ 6-8 mois sans boire dans des conditions extrêmes, pas 3 ans. La durée proposée était irréaliste."

Retourne STRICTEMENT un objet JSON avec une clé "questions" contenant un tableau de ${n} objets :
{
  "questions": [
    {"q":"...","options":["A","B","C","D"],"answer":"...","explanation":"..."}
  ]
}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const resp = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        response_format: { type: "json_object" }
      },
      { signal: controller.signal }
    );
    
    const text = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);
    const arr = parsed.questions || parsed.data || [];
    
    return (Array.isArray(arr) ? arr : []).slice(0, n).map(q => ({
      q: String(q.q ?? ""),
      options: Array.isArray(q.options) ? q.options.map(String).slice(0, 4) : [],
      answer: String(q.answer ?? ""),
      explanation: String(q.explanation ?? ""),
      kind: "halu"
    })).filter(
      x => x.q && x.options.length === 4 && x.options.includes(x.answer)
    );
  } catch (err) {
    console.error("generateHalluQuestions error:", err);
    return [];
  } finally {
    clearTimeout(t);
  }
}
