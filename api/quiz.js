// Test branche dev-test
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    try {
        const questionsPath = path.join(process.cwd(), 'data', 'questions-bank.json');
        const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
        const QUESTIONS_BANK = questionsData.questions;

        const playedIds = req.body.playedIds || [];
        let filteredQuestions = QUESTIONS_BANK.filter(q => !playedIds.map(Number).includes(Number(q.id)));
        if (filteredQuestions.length < 8) {
            filteredQuestions = [...QUESTIONS_BANK];
        }
        for (let i = filteredQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [filteredQuestions[i], filteredQuestions[j]] = [filteredQuestions[j], filteredQuestions[i]];
        }
        const safe8 = filteredQuestions.slice(0, 8).map(q => ({ ...q, kind: "safe" }));

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Tu es un générateur de questions pièges pour une formation professionnelle en Finance, Comptabilité et Administration d'entreprise.

Ton rôle : créer des questions qui SEMBLENT professionnelles et crédibles, mais qui contiennent une erreur factuelle délibérée et vérifiable.

RÈGLE ABSOLUE : Les 4 options de réponse proposées doivent toutes être FAUSSES. Aucune ne doit correspondre à la réalité. L'objectif est que le participant comprenne que la question elle-même est incorrecte et clique sur "Signaler une anomalie IA" plutôt que de choisir une réponse.

TYPES D'ERREURS à alterner entre les 2 questions (varie le niveau de difficulté) :

Type 1 — ERREUR GROSSIÈRE (détectable au premier coup d'œil par un professionnel) :
- Taux ou chiffres clairement faux (ex: "TVA à 35%", "IS à 45%", "délai LME de 120 jours")
- Inversion totale de concepts (ex: "Le compte 411 enregistre les dettes fournisseurs")
- Définition complètement inversée (ex: "Le passif représente ce que l'entreprise possède")

Type 2 — ERREUR SUBTILE (nécessite de relire attentivement) :
- Confusion entre deux concepts proches (ex: BFR et FR, CAF et EBE, IS et IR)
- Chiffre légèrement décalé mais plausible (ex: "conservation des documents : 7 ans" au lieu de 10)
- Définition presque juste avec un mot clé erroné (ex: "amortissement = constatation de la perte de valeur d'une créance" au lieu d'immobilisation)
- Inversion subtile de sens dans une formule

FORMAT DE RÉPONSE JSON STRICT :
{
  "questions": [
    {
      "q": "La question piège formulée de façon professionnelle et crédible",
      "options": ["Option fausse A", "Option fausse B", "Option fausse C", "Option fausse D"],
      "answer": "Non applicable — question invalide",
      "explanation": "Explication pédagogique de l'erreur : ce qui est faux dans la question et quelle est la vraie réponse correcte"
    }
  ]
}`
                },
                {
                    role: "user",
                    content: `Génère exactement 2 questions pièges sur des thèmes variés parmi : TVA, IS, comptabilité générale (comptes de classe 4/5/6/7), bilan, compte de résultat, paie, délais de paiement, ratios financiers, amortissements, provisions, BFR, trésorerie, audit.

Question 1 : erreur de Type 1 (grossière, visible rapidement)
Question 2 : erreur de Type 2 (subtile, nécessite attention)

OBLIGATOIRE : Chaque question doit avoir EXACTEMENT 4 options dans le tableau "options", ni plus ni moins.
Assure-toi que les 4 options sont toutes factuellement incorrectes.`
                }
            ],
            response_format: { type: "json_object" }
        });

        // Récupérer les hallus avec sécurité sur le format
        const aiResponse = JSON.parse(completion.choices[0].message.content);
        const rawHallus = (aiResponse.questions || aiResponse.hallucinations || Object.values(aiResponse)[0]);

        const hallu2 = rawHallus.slice(0, 2).map(q => {
            let options = Array.isArray(q.options) ? q.options.map(String) : [];
            // Filet de sécurité : on force exactement 4 options quoi qu'il arrive
            while (options.length < 4) options.push("Option non valide");
            options = options.slice(0, 4);
            return { ...q, options, kind: "halu" };
        });

        const finalQuiz = [...safe8, ...hallu2];
        for (let i = finalQuiz.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [finalQuiz[i], finalQuiz[j]] = [finalQuiz[j], finalQuiz[i]];
        }
        return res.status(200).json(finalQuiz);

    } catch (e) {
        console.error("Erreur Backend:", e);
        return res.status(500).json({ error: "Erreur serveur", details: e.message });
    }
};
