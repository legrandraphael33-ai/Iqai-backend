const OpenAI = require("openai");

async function generateHalluQuestions({ n = 2, timeoutMs = 18000, themes = [] } = {}) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const finalThemes = themes.length >= n ? themes.slice(0, n) : ["Histoire", "Foot", "Cinéma", "Musique"];
  
  const prompt = `Tu es une IA qui génère des questions "hallucinées"... (garde le reste de ton prompt identique ici)`;

  try {
    const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        response_format: { type: "json_object" }
    });
    
    const text = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);
    const arr = parsed.questions || [];
    
    return arr.map(q => ({
      ...q,
      kind: "halu"
    }));
  } catch (err) {
    console.error("Erreur hallu:", err);
    return [];
  }
}

// C'est CA qui remplace "export function"
module.exports = { generateHalluQuestions };
