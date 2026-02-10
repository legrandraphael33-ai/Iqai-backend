import { generateHalluQuestions } from "../lib/generateHallu.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger la bank de questions
const questionsPath = path.join(__dirname, '../data/questions-bank.json');
const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
const QUESTIONS_BANK = questionsData.questions;

function normalizeQuestion(q) {
  return {
    q: String(q.q ?? ""),
    options: Array.isArray(q.options) ? q.options.map(String).slice(0, 4) : [],
    answer: String(q.answer ?? ""),
    explanation: String(q.explanation ?? ""),
    category: String(q.category ?? "Culture générale")
  };
}

function getRandomPositions() {
  // Tirer 2 positions aléatoires différentes entre 0 et 9
  const pos1 = Math.floor(Math.random() * 10);
  let pos2 = Math.floor(Math.random() * 10);
  while (pos2 === pos1) {
    pos2 = Math.floor(Math.random() * 10);
  }
  return [pos1, pos2].sort((a, b) => a - b);
}

function getRandomQuestions(n = 8) {
  // Tirer 8 questions aléatoires avec max 2 par catégorie
  const shuffled = [...QUESTIONS_BANK].sort(() => Math.random() - 0.5);
  const categoryCount = {};
  const selected = [];
  
  for (const q of shuffled) {
    const cat = q.category || "Culture générale";
    if (!categoryCount[cat]) categoryCount[cat] = 0;
    
    // Max 2 questions par catégorie
    if (categoryCount[cat] < 2) {
      selected.push(normalizeQuestion(q));
      categoryCount[cat]++;
      
      if (selected.length === n) break;
    }
  }
  
  return selected;
}

function injectHallus(safe8, hallu2, positions) {
  const s = safe8.map(q => ({ ...q, kind: "safe" }));
  const h = hallu2.slice(0, 2).map(q => ({ ...normalizeQuestion(q), kind: "halu" }));
  
  // Fallback si pas assez d'hallus : compléter avec des questions safe
  if (h.length < 2) {
    const allSafe = [...s, ...s].slice(0, 10).map(q => ({ ...q, kind: "safe" }));
    return allSafe;
  }
  
  const result = [];
  let safeIndex = 0;
  let halluIndex = 0;
  
  for (let i = 0; i < 10; i++) {
    if (positions.includes(i) && halluIndex < 2) {
      result.push(h[halluIndex]);
      halluIndex++;
    } else if (safeIndex < 8) {
      result.push(s[safeIndex]);
      safeIndex++;
    }
  }
  
  return result.slice(0, 10);
}

async function withTimeout(promise, ms, label = "timeout") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // 1) Tirer 8 questions safe de la bank
    const safeQuestions = getRandomQuestions(8);
    
    // 2) Tirer 2 positions aléatoires pour les hallus
    const halluPositions = getRandomPositions();
    
    // 3) Générer 2 hallus (thèmes basés sur les positions)
    const halluThemes = halluPositions.map(pos => 
      safeQuestions[Math.min(pos, 7)]?.category || "culture générale"
    );
    
    let hallus = [];
    try {
      hallus = await withTimeout(
        generateHalluQuestions({ 
          n: 2, 
          timeoutMs: 18000,
          themes: halluThemes 
        }),
        19000,
        "hallu_timeout"
      );
    } catch (err) {
      console.error("Hallu generation failed:", err);
      hallus = [];
    }
    
    // 4) Injecter les hallus aux positions aléatoires
    const finalQuiz = injectHallus(safeQuestions, hallus, halluPositions);
    
    return res.status(200).json(finalQuiz);
    
  } catch (e) {
    console.error("Quiz generation error:", e);
    return res.status(500).json({ 
      error: "Server error", 
      details: String(e?.message || e) 
    });
  }
}
