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

        // 3. Sélectionner 8 questions au hasard
        const shuffled = [...QUESTIONS_BANK].sort(() => 0.5 - Math.random());
        const safe8 = shuffled.slice(0, 8).map(q => ({ ...q, kind: "safe" }));

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

        // 5. Fusionner et mélanger le tout (10 questions)
        const finalQuiz = [...safe8, ...hallu2].sort(() => 0.5 - Math.random());

        return res.status(200).json(finalQuiz);

    } catch (e) {
        console.error("Erreur Backend:", e);
        return res.status(500).json({ error: "Erreur serveur", details: e.message });
    }
};
