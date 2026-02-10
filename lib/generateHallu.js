import OpenAI from "openai";

export async function generateHalluQuestions({ n = 2, timeoutMs = 18000, themes = [] } = {}) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const finalThemes = themes.length >= n ? themes.slice(0, n) : [
    "Histoire de France",
    "Football International",
    "Cinéma",
    "Musique"
  ];
  
  const prompt = `Tu es une IA qui génère des questions "hallucinées" pour un jeu de quiz. 

CONCEPT :
Tu dois poser une question qui repose sur un FAIT QUI N'A JAMAIS EXISTÉ, mais en le présentant comme une vérité historique ou culturelle établie.

EXEMPLES DE CE QUE JE VEUX :
- "En quelle année Kylian Mbappé a-t-il soulevé la Ligue des Champions avec le PSG ?" (Réponse réelle : Jamais)
- "Quel discours célèbre a prononcé Napoléon lors de son sacre à New York ?" (Réponse réelle : Il n'a jamais été à NY)
- "Combien d'Oscars a remporté Leonardo DiCaprio pour son rôle dans Titanic ?" (Réponse réelle : Zéro pour ce film)

DIRECTIVES :
1. PRÉSUPPOSÉ FAUX : La question doit intégrer une erreur factuelle majeure.
2. OPTIONS : Propose 4 années ou 4 noms crédibles, mais qui sont tous faux puisque l'événement n'a pas eu lieu.
3. EXPLICATION : L'explication doit révéler le pot-aux-roses de manière claire.
   Exemple : "Bien vu ! C'était un piège : Mbappé n'a jamais gagné la C1 avec Paris."
4. CIBLES : Utilise des sujets très connus (Mbappé, Disney, Histoire, Stars) pour que le joueur puisse dire "Attends, c'est n'importe quoi".

THÈMES IMPOSÉS :
${finalThemes.map((theme, i) => `${i + 1}. ${theme}`).join("\n")}

FORMAT JSON STRICT :
{
  "questions": [
    {
      "q": "La question avec le mensonge intégré",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A", 
      "explanation": "L'explication qui rétablit la vérité"
    }
  ]
}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const resp = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8, // Un peu moins de température pour garder une cohérence factuelle dans le mensonge
        response_format: { type: "json_object" }
      },
      { signal: controller.signal }
    );
    
    const text = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);
    const arr = parsed.questions || [];
    
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
