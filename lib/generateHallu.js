

export async function generateHalluQuestions(
  client,
  { n = 2, timeoutMs = 12000 } = {}
) {
  

  const prompt = `
Génère ${n} questions QCM en français. Ce sont des "hallucinations contrôlées".
Elles doivent être détectables par un joueur vigilant.

Règles :
- 4 options plausibles, toutes différentes.
- "answer" DOIT être exactement une des options.
- MAIS l'explication DOIT contredire la réponse (erreur de calcul, logique incohérente, contradiction).
- explanation courte (1–2 phrases).
- Retourne STRICTEMENT du JSON valide, tableau de ${n} objets :
[
  {"q":"...","options":["A","B","C","D"],"answer":"...","explanation":"..."}
]
`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await client.responses.create(
      {
        model: "gpt-4.1-mini",
        input: prompt,
        temperature: 0.9
      },
      { signal: controller.signal }
    );

    const text = resp.output_text || "[]";
    const arr = JSON.parse(text);

    return (Array.isArray(arr) ? arr : []).slice(0, n).map(q => ({
      q: String(q.q ?? ""),
      options: Array.isArray(q.options) ? q.options.map(String).slice(0, 4) : [],
      answer: String(q.answer ?? ""),
      explanation: String(q.explanation ?? ""),
      kind: "halu"
    })).filter(
      x => x.q && x.options.length === 4 && x.options.includes(x.answer)
    );
  } finally {
    clearTimeout(t);
  }
}
