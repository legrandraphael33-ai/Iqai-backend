import { generateHalluQuestions } from "../lib/generateHallu.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const questionsPath = path.join(__dirname, '../data/questions-bank.json');
const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
const QUESTIONS_BANK = questionsData.questions;

function normalizeQuestion(q) {
  return {
    id: q.id || String(q.q).substring(0, 20), // On ajoute un ID pour le suivi
    q: String(q.q ?? ""),
    options: Array.isArray(q.options) ? q.options.map(String).slice(0, 4) : [],
    answer: String(q.answer ?? ""),
    explanation: String(q.explanation ?? ""),
    category: String(q.category ?? "Culture générale")
  };
}

// Mélange de Fisher-Yates pour un vrai hasard
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// MODIFICATION : On accepte une liste d'IDs à exclure (les questions des jours passés)
function getRandomQuestions(n = 8, excludeIds = []) {
  const filtered = QUESTIONS_BANK.filter(q => !excludeIds.includes(q.id || String(q.q).substring(0, 20)));
  
  // Si on a trop filtré et qu'il n'y a plus assez de questions, on reprend tout
  const pool = filtered.length >= n ? filtered : QUESTIONS_BANK;
  
  const shuffled = shuffle([...pool]);
  const categoryCount = {};
  const selected = [];
  
  for (const q of shuffled) {
    const cat = q.category || "Culture générale";
    if (!categoryCount[cat]) categoryCount[cat] = 0;
    
    if (categoryCount[cat] < 2) {
      selected.push(normalizeQuestion(q));
      categoryCount[cat]++;
      if (selected.length === n) break;
    }
  }
  return selected;
}

function getRandomPositions() {
  const pos1 = Math.floor(Math.random() * 10);
  let pos2 = Math.floor(Math.random() * 10);
  while (pos2 === pos1) pos2 = Math.floor(Math.random() * 10);
  return [pos1, pos2].sort((a, b) => a - b);
}

function injectHallus(safe8, hallu2, positions) {
  const s = safe8.map(q => ({ ...q, kind: "safe" }));
  const backupHallus = [
    { q: "En quelle année Mbappé a-t-il gagné la LDC avec le PSG ?", options: ["2020", "2021", "2022", "2023"], answer: "2020", explanation: "L'événement n'a jamais eu lieu : Mbappé n'a jamais gagné la C1 avec le PSG.", category: "Sport" },
    { q: "Quel est le nom du 4ème film de la trilogie 'Le Seigneur des Anneaux' ?", options: ["Le Retour du Dragon", "L'Ombre du Passé", "La Quête Finale", "Le Destin d'Aragorn"], answer: "La Quête Finale", explanation: "C'est une trilogie : il n'existe que 3 films originaux.", category: "Cinéma" }
  ];

  let h = [...hallu2];
  while (h.length < 2) { h.push(backupHallus[h.length]); }

  const result = [];
  let safeIdx = 0;
  let halluIdx = 0;

  for (let i = 0; i < 10; i++) {
    if (positions.includes(i) && halluIdx < 2) {
      result.push({ ...normalizeQuestion(h[halluIdx]), kind: "halu" });
      halluIdx++;
    } else {
      result.push({ ...s[safeIdx], kind: "safe" });
      safeIdx++;
    }
  }
  return result;
}

export default async function handler(req, res) {
  // CORS...
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // RECUPERATION DES IDS DEJA JOUÉS (envoyés par le front-end)
    const { playedIds } = req.body || {}; 
    const exclude = Array.isArray(playedIds) ? playedIds : [];

    const safeQuestions = getRandomQuestions(8, exclude);
    const halluPositions = getRandomPositions();
    const halluThemes = halluPositions.map(pos => safeQuestions[Math.min(pos, 7)]?.category || "culture générale");

    let hallus = [];
    try {
      // On réduit un peu le timeout pour être plus réactif
      const hPromise = generateHalluQuestions({ n: 2, themes: halluThemes });
      hallus = await Promise.race([
        hPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 12000))
      ]);
    } catch (err) {
      console.error("Hallu error:", err.message);
    }

    const finalQuiz = injectHallus(safeQuestions, hallus, halluPositions);
    return res.status(200).json(finalQuiz);

  } catch (e) {
    console.error("Global Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
