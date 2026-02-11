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
- "En quelle année Kylian Mbappé a-t-il soulevé la Ligue des Champions avec le PSG ?" (Vérité : Jamais)
- "Quel discours célèbre a prononcé Napoléon lors de son sacre à New York ?" (Vérité : Il n'a jamais été à NY)

DIRECTIVES CRUCIALES POUR L'EXPLICATION :
1. NE JAMAIS utiliser de formules de félicitations ou de jugement (PAS de "Bien vu !", "Bravo", "Piégé !", "Dommage").
2. L'explication doit être NEUTRE et FACTUELLE. Elle doit rétablir la vérité pour que le texte soit cohérent que le joueur ait trouvé ou non le piège.
3. Exemple d'explication neutre : "Kylian Mbappé n'a jamais remporté la Ligue des Champions avec le PSG malgré plusieurs tentatives."
4. PRÉSUPPOSÉ FAUX : La question doit intégrer une erreur factuelle majeure.
5. OPTIONS : Propose 4 choix crédibles, mais qui sont tous faux puisque l'événement n'a pas eu lieu.
6. CIBLES : Utilise des sujets très connus (Stars, Histoire, Sport, Cinéma).

THÈMES IMPOSÉS :
${finalThemes.map((theme, i) => `${i + 1}. ${theme}`).join("\n")}

FORMAT JSON STRICT :
{
  "questions": [
    {
      "q": "La question avec le mensonge intégré",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A", 
      "explanation": "L'explication factuelle et neutre sans 'Bravo' ni 'Bien vu'"
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
