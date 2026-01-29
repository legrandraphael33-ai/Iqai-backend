import OpenAI from "openai";

export async function generateHalluQuestions({ n = 2, timeoutMs = 12000 } = {}) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const prompt = `Génère ${n} questions QCM "piège" en français. Ce sont des hallucinations détectables par un joueur vigilant.

RÈGLES STRICTES pour créer un piège détectable :

TYPE 1 - Toutes les options sont FAUSSES (préféré) :
- Question correcte, mais les 4 options proposées sont toutes incorrectes
- Exemple : "Quelle est la date de la Révolution française ?" → Options : 1945, 1818, 1969, 1889 (vraie réponse : 1789, absente)
- Le joueur vigilant remarque qu'aucune option n'est correcte

TYPE 2 - Données contradictoires dans la question :
- Question avec une prémisse fausse évidente
- Exemple : "Sachant que la Tour Eiffel mesure 50cm, combien de mètres fait-elle ?"
- Le joueur vigilant détecte la contradiction

TYPE 3 - Question absurde :
- Question qui n'a pas de sens logique
- Exemple : "Combien de côtés a un cercle ?" avec 4 nombres en options

IMPORTANT :
- "answer" doit être UNE des 4 options (techniquement, même si c'est faux)
- "explanation" doit CLAIREMENT expliquer pourquoi c'était un piège (ex: "Aucune des dates proposées n'était correcte. La vraie réponse est 1789.")
- Les 4 options doivent être plausibles mais TOUTES fausses ou la question doit être absurde/contradictoire

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
