import OpenAI from "openai";

export async function generateHalluQuestions({ n = 2, timeoutMs = 12000 } = {}) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const prompt = `Génère ${n} questions QCM en français. Ce sont des "hallucinations contrôlées".
Elles doivent être détectables par un joueur vigilant.

Règles :
- 4 options plausibles, toutes différentes
- "answer" DOIT être exactement une des options
- MAIS l'explication DOIT contredire la réponse (erreur de calcul, logique incohérente, contradiction)
- explanation courte (1–2 phrases)

Retourne STRICTEMENT un objet JSON avec une clé "questions" contenant un tableau de ${n} objets :
{
  "questions": [
    {"q":"...","options":["A","B","C","D"],"answer":"...","explanation":"..."}
  ]
}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // ✅ CORRECTIF : utiliser chat.completions.create au lieu de responses.create
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
