import OpenAI from "openai";

export async function generateHalluQuestions({ n = 2, timeoutMs = 12000, themes = [] } = {}) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // Si pas de thèmes fournis, utiliser des thèmes génériques
  const finalThemes = themes.length >= n ? themes.slice(0, n) : [
    "culture générale variée",
    "connaissances générales"
  ];
  
  const prompt = `Génère ${n} questions QCM "piège" en français niveau TRIVIAL PURSUIT.

THÈMES IMPOSÉS (1 question par thème) :
${finalThemes.map((theme, i) => `${i + 1}. ${theme}`).join("\n")}

CONCEPT DES PIÈGES - "Réponse évidente absente des options" :
Pose une question Trivial Pursuit classique sur le thème, mais la VRAIE RÉPONSE ÉVIDENTE n'est PAS dans les 4 options proposées.

EXEMPLES DE BONS PIÈGES :

✅ Thème "les records du monde animal" :
"Combien de pattes a une araignée ?"
Options : 6, 7, 9, 10
→ La vraie réponse (8) est absente. Un joueur vigilant pense "Attends, une araignée c'est 8 pattes, c'est pas dans les options !"

✅ Thème "le système solaire" :
"Quelle est la planète la plus proche du Soleil ?"
Options : Vénus, Terre, Mars, Jupiter
→ La vraie réponse (Mercure) est absente. Un joueur vigilant pense "C'est Mercure, c'est pas là !"

✅ Thème "les instruments de musique" :
"Combien de cordes a un violon ?"
Options : 3, 5, 6, 7
→ La vraie réponse (4) est absente. Un joueur vigilant pense "Un violon c'est 4 cordes, y'a pas 4 !"

✅ Thème "géographie de base" :
"Combien de continents y a-t-il sur Terre ?"
Options : 5, 8, 9, 10
→ La vraie réponse (7) est absente. Un joueur vigilant pense "C'est 7, pas dans la liste !"

RÈGLES STRICTES :
1. La question doit porter sur un FAIT ÉVIDENT niveau Trivial Pursuit
2. La vraie réponse doit être quelque chose que beaucoup de gens connaissent
3. La vraie réponse n'est PAS dans les 4 options
4. Les 4 options doivent être proches numériquement ou plausibles
5. BUT : Éveiller le joueur vigilant, pas le tromper vicieusement

🚫 BLACKLIST - Ne JAMAIS utiliser :
- Joconde / Léonard de Vinci
- Tour Eiffel
- Révolution française / 1789
- Capitale de France / Paris
- Einstein
- Napoléon
- Pizza italienne
- Pluriel/féminin trivial

NIVEAU REQUIS :
- Questions Trivial Pursuit (accessible mais pas trivial)
- Faits que beaucoup de gens connaissent
- Piège détectable par quelqu'un de vigilant

FORMAT TECHNIQUE :
- "answer" = l'option la plus proche de la vraie réponse (techniquement)
- "explanation" explique la vraie réponse absente
  Exemple : "Une araignée possède 8 pattes, pas 6, 7, 9 ou 10. Aucune option n'était correcte."

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
