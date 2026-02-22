const OpenAI = require('openai');

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.85,
            max_tokens: 3500,
            messages: [
                {
                    role: "system",
                    content: `Tu es un expert en formation pour les équipes des concessions automobiles Emil Frey qui utilisent l'agent IA Sandra AI.

Sandra AI est un agent vocal et messaging qui répond aux appels entrants à la place de la réceptionniste. Elle :
- Prend les rendez-vous atelier (révision, vidange, changement de pneus, réparation...)
- Qualifie les demandes commerciales (VN/VO)
- Capture des données clés sur chaque client et chaque appel
- S'intègre directement dans le DMS et l'agenda atelier
- Transfère à un humain quand la situation le demande

Génère exactement 10 questions de formation sous forme de mises en situation réalistes.
Chaque question doit :
1. Présenter un CONTEXTE concret (un client appelle, Sandra AI a capté des infos spécifiques)
2. Poser une QUESTION claire sur la meilleure façon d'agir avec ces informations
3. Proposer exactement 4 réponses plausibles
4. Avoir une seule bonne réponse (celle qui exploite le mieux ce que Sandra AI a capté)

Thèmes à couvrir (varie-les) :
- Rendez-vous atelier (pneus, révision, vidange, réparation)
- Leads VN/VO (qualification, rappel client)
- Gestion des abandons d'appel (client n'a pas finalisé son RDV avec Sandra)
- Transfert vers humain (cas urgent, client mécontent, demande complexe)
- Exploitation des données clients captées (historique, immatriculation, préférence horaire)
- Rappels constructeur / cas de rappel qualité
- Clients électrique/hybride (spécificités)

IMPORTANT : Varie la position de la bonne réponse dans le tableau options (pas toujours en première position).

Réponds UNIQUEMENT avec un JSON valide, sans balise markdown, sans explication. Format exact :
[
  {
    "situation": "Texte du contexte (2-3 phrases max). Ce que Sandra AI a capté ou fait.",
    "q": "Question posée à l'équipe",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Texte exact de la bonne option (doit correspondre exactement à l'une des options)",
    "explanation": "Pourquoi cette réponse est la meilleure (1-2 phrases)"
  }
]`
                },
                {
                    role: "user",
                    content: "Génère 10 nouvelles mises en situation variées pour la formation des équipes Emil Frey sur Sandra AI."
                }
            ]
        });

        const raw = completion.choices[0].message.content;

        let parsed;
        try {
            const clean = raw.replace(/```json|```/g, "").trim();
            parsed = JSON.parse(clean);
        } catch(e) {
            throw new Error("Impossible de parser la réponse de l'IA : " + e.message);
        }

        if (!Array.isArray(parsed) || parsed.length < 10) {
            throw new Error("Pas assez de questions générées.");
        }

        // Normalisation + mélange des options
        const questions = parsed.slice(0, 10).map((x, i) => {
            const answer = String(x.answer ?? "");
            let options = Array.isArray(x.options) ? x.options.map(String).slice(0, 4) : [];

            // Filet de sécurité : 4 options minimum
            while (options.length < 4) options.push("Option non valide");
            options = options.slice(0, 4);

            // Mélange aléatoire (Fisher-Yates)
            for (let j = options.length - 1; j > 0; j--) {
                const k = Math.floor(Math.random() * (j + 1));
                [options[j], options[k]] = [options[k], options[j]];
            }

            return {
                id: i,
                situation: String(x.situation ?? ""),
                q: String(x.q ?? ""),
                options,
                answer,
                explanation: String(x.explanation ?? ""),
                kind: "safe"
            };
        }).filter(x => x.q && x.options.length === 4 && x.answer && x.options.includes(x.answer));

        if (questions.length < 5) {
    throw new Error("Pas assez de questions valides générées.");
}

        return res.status(200).json(questions);

    } catch (e) {
        console.error("Erreur Backend:", e);
        return res.status(500).json({ error: "Erreur serveur", details: e.message });
    }
};
