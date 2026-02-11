const { generateHalluQuestions } = require("../lib/generateHallu.js");
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    // 1. Headers de sécurité (CORS)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        // 2. Charger les 8 questions "vraies" depuis la banque JSON
        const questionsPath = path.join(process.cwd(), 'data', 'questions-bank.json');
        const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
        const QUESTIONS_BANK = questionsData.questions;

        const safe8 = [...QUESTIONS_BANK]
            .sort(() => 0.5 - Math.random())
            .slice(0, 8)
            .map(q => ({ ...q, kind: "safe" }));

        // 3. Appeler ton fichier externe pour les 2 hallucinations
        // On récupère les thèmes des questions choisies pour guider l'IA
        const themes = safe8.map(q => q.category || "Culture générale");
        
        const hallus = await generateHalluQuestions({ n: 2, themes: themes });

        // 4. Fusionner les 10 questions et mélanger
        const finalQuiz = [...safe8, ...hallus].sort(() => 0.5 - Math.random());

        // 5. Envoyer la réponse au front-end
        return res.status(200).json(finalQuiz);

    } catch (e) {
        console.error("Erreur Backend Quiz:", e);
        return res.status(500).json({ 
            error: "Erreur serveur", 
            message: e.message 
        });
    }
};
