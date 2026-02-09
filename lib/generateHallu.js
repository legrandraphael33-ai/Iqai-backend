import OpenAI from "openai";

export async function generateHalluQuestions({ n = 2, timeoutMs = 12000 } = {}) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const prompt = `Génère ${n} questions QCM "piège" en français de NIVEAU INTERMÉDIAIRE (culture générale solide).

NIVEAU DE DIFFICULTÉ :
- NI trop facile : évite "Quelle est la capitale de la France ?", "Quel est le féminin d'acteur ?"
- NI trop difficile : évite "Formule de l'azote liquide", "Prix Nobel 1987"
- NIVEAU CIBLE : Questions qu'une personne cultivée connaît, mais qui nécessitent réflexion

THÈMES VARIÉS À PRIVILÉGIER :
- Histoire (événements marquants, dates importantes)
- Géographie (capitales moins connues, records naturels)
- Sciences (découvertes, inventeurs, phénomènes)
- Arts & Culture (auteurs classiques, œuvres majeures)
- Sport (règles, records, compétitions)
- Musique/Cinéma (œuvres cultes, artistes majeurs)

RÈGLES STRICTES pour créer un piège détectable :

TYPE 1 - Toutes les options sont FAUSSES (PRÉFÉRÉ) :
- Question correcte de niveau intermédiaire, mais les 4 options sont toutes incorrectes
- Exemple : "En quelle année est tombé le mur de Berlin ?" → Options : 1979, 1995, 2001, 1985 (vraie réponse : 1989, absente)
- Exemple : "Quel océan borde l'ouest des États-Unis ?" → Options : Atlantique, Indien, Arctique, Austral (vraie réponse : Pacifique, absente)
- Le joueur vigilant remarque qu'aucune option n'est correcte

TYPE 2 - Données contradictoires dans la question :
- Question avec une prémisse fausse évidente
- Exemple : "Sachant que la Terre a 2 lunes, combien de satellites naturels possède-t-elle ?"
- Le joueur vigilant détecte la contradiction

TYPE 3 - Question absurde :
- Question qui n'a pas de sens logique
- Exemple : "Combien de pattes a un poisson rouge ?" avec 4 nombres en options

IMPÉRATIF :
- Aucune question triviale type "capitale de France", "couleur du ciel", "nombre de continents"
- Préférer TYPE 1 (toutes options fausses) avec des questions de niveau culture générale solide
- "answer" doit être UNE des 4 options (techniquement, même si c'est faux)
- "explanation" doit CLAIREMENT expliquer pourquoi c'était un piège
  Exemple : "Aucune des années proposées n'était correcte. Le mur de Berlin est tombé en 1989."

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
