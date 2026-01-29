// lib/injectHallus.js

function normalizeQuestion(q) {
  return {
    q: String(q.q ?? ""),
    options: Array.isArray(q.options) ? q.options.map(String).slice(0, 4) : [],
    answer: String(q.answer ?? ""),
    explanation: String(q.explanation ?? ""),
  };
}

export function injectHallus(safeQuiz, hallus) {
  // sécurité
  const safe = safeQuiz
    .slice(0, 10)
    .map(q => ({ ...normalizeQuestion(q), kind: "safe" }));

  const h = hallus
    .slice(0, 2)
    .map(q => ({ ...normalizeQuestion(q), kind: "halu" }));

  // positions fixes : Q4 et Q8
  if (h[0]) safe[3] = h[0];
  if (h[1]) safe[7] = h[1];

  return safe;
}
