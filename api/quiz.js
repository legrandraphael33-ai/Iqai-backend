// Test branche dev-test
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    // 1. Autoriser le front-end
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
        // 2. Charger les questions depuis le fichier JSON
        // Note : On utilise path.join(process.cwd()) car sur Vercel c'est plus fiable
        const questionsPath = path.join(process.cwd(), 'data', 'questions-bank.json');
        const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
        const QUESTIONS_BANK = questionsData.questions;

        // 3. Sélectionner 8 questions au hasard (avec FILTRAGE)
        const playedIds = req.body.playedIds || []; // On récupère les IDs envoyés par le front
        
        // On crée une liste de questions filtrées (uniquement celles non jouées)
        let filteredQuestions = QUESTIONS_BANK.filter(q => !playedIds.map(Number).includes(Number(q.id)));

        // Sécurité : Si le joueur a tout vu ou s'il reste moins de 8 questions, on réinitialise
        if (filteredQuestions.length < 8) {
            filteredQuestions = [...QUESTIONS_BANK];
        }

        // Maintenant on mélange SEULEMENT les questions filtrées
        for (let i = filteredQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [filteredQuestions[i], filteredQuestions[j]] = [filteredQuestions[j], filteredQuestions[i]];
        }
        
        // On prend les 8 premières
        const safe8 = filteredQuestions.slice(0, 8).map(q => ({ ...q, kind: "safe" }));

        // 4. Générer 2 hallucinations avec OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Génère 2 questions de quiz qui ont l'air vraies mais dont la réponse est une pure invention (hallucination). Réponds en JSON uniquement." },
                { role: "user", content: "Format : [{ \"q\": \"...\", \"options\": [\"...\"], \"answer\": \"...\", \"explanation\": \"...\" }]" }
            ],
            response_format: { type: "json_object" }
        });

        // On récupère les hallus (si l'IA répond correctement au format)
        const aiResponse = JSON.parse(completion.choices[0].message.content);
        const hallu2 = (aiResponse.questions || aiResponse.hallucinations || Object.values(aiResponse)[0])
                        .slice(0, 2)
                        .map(q => ({ ...q, kind: "halu" }));

        // 5. Fusionner et mélanger le tout (10 questions) proprement
        const finalQuiz = [...safe8, ...hallu2];
        
        // On applique encore le mélange Fisher-Yates sur les 10 questions finales
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
