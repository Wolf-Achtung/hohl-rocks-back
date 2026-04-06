// ===================================================================
// PROMPT ROUTES - Generator, Optimizer, Library
// ===================================================================

import { Router } from "express";
import { promptGeneratorRateLimit, promptLibraryRateLimit } from "../middleware/rateLimit.js";
import { callClaude } from "../services/ai-clients.js";
import { sanitizePrompt, setCacheHeaders } from "../utils/helpers.js";
import { createCache } from "../utils/cache.js";
import { FEATURED_PROMPTS } from "../data/prompts.js";

const router = Router();
const promptsCache = createCache(300000); // 5 min

// Prompt Generator
router.post("/api/prompt-generator", promptGeneratorRateLimit, async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Topic is required and must be a non-empty string",
      });
    }

    if (topic.length > 500) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Topic too long (max 500 characters)",
      });
    }

    const cleanTopic = sanitizePrompt(topic.trim());

    const systemPrompt = `Du bist ein Prompt Engineering Experte. Deine Aufgabe ist es, für ein gegebenes Thema 5 verschiedene Prompt-Styles zu generieren.

Die 5 Styles sind:
1. EXECUTIVE: Business-strategisch, ROI-fokussiert, für C-Level
2. TECHNICAL: Entwickler-orientiert, implementierungs-fokussiert, technisch präzise
3. CREATIVE: Out-of-the-box, metaphorisch, visuell anregend
4. TUTORIAL: Step-by-step, didaktisch, für Anfänger geeignet
5. EXPERT: Deep-dive, akademisch, für Experten

Jeder Prompt sollte:
- Spezifisch und actionable sein
- Den jeweiligen Style klar repräsentieren
- 2-4 Sätze lang sein
- Deutsche Sprache nutzen

Ausgabeformat (genau so formatieren):
[STYLE_NAME]
[Prompt Text hier]

[STYLE_NAME]
[Prompt Text hier]

etc.`;

    const userPrompt = `Thema: ${cleanTopic}

Generiere 5 verschiedene Prompt-Styles (Executive, Technical, Creative, Tutorial, Expert) für dieses Thema.`;

    const response = await callClaude(systemPrompt, userPrompt, 2000);

    // Parse response
    const styles = {};
    const sections = response.split("\n\n").filter((s) => s.trim());
    const styleNames = ["executive", "technical", "creative", "tutorial", "expert"];
    let currentIndex = 0;

    sections.forEach((section) => {
      const lines = section.split("\n").filter((l) => l.trim());
      if (lines.length >= 2) {
        const styleName = styleNames[currentIndex] || `style_${currentIndex}`;
        const promptText = lines.slice(1).join(" ").trim();
        styles[styleName] = promptText;
        currentIndex++;
      }
    });

    res.json({
      success: true,
      topic: cleanTopic,
      styles,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in prompt-generator:", error);
    res.status(500).json({
      error: "Generation failed",
      message: error.message,
    });
  }
});

// Prompt Optimizer
router.post("/api/prompt-optimizer", promptGeneratorRateLimit, async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Prompt is required and must be a non-empty string",
      });
    }

    if (prompt.length > 1000) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Prompt too long (max 1000 characters)",
      });
    }

    const cleanPrompt = sanitizePrompt(prompt.trim());

    const systemPrompt = `Du bist ein Prompt Engineering Experte. Deine Aufgabe ist es, einen gegebenen Prompt zu analysieren, zu bewerten und zu optimieren.

Analyse-Kriterien:
1. Klarheit: Ist der Prompt eindeutig verständlich?
2. Spezifität: Sind die Anforderungen konkret genug?
3. Kontext: Ist genug Kontext für eine gute Antwort gegeben?
4. Struktur: Ist der Prompt gut strukturiert?
5. Actionability: Ist klar, was das gewünschte Output sein soll?

Ausgabeformat (EXAKT so formatieren, keine zusätzlichen Zeichen):
SCORE: [Zahl von 1-10]
PROBLEMS:
- [Problem 1]
- [Problem 2]
- [Problem 3]
IMPROVED:
[Optimierter Prompt hier]
EXPLANATION:
[Erklärung warum besser]`;

    const userPrompt = `Original Prompt: "${cleanPrompt}"

Analysiere und optimiere diesen Prompt. Gib einen Score (1-10), liste Probleme, erstelle einen verbesserten Prompt und erkläre die Verbesserungen.`;

    const response = await callClaude(systemPrompt, userPrompt, 2500);

    // Parse response
    const scoreMatch = response.match(/SCORE:\s*(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;

    const problemsMatch = response.match(/PROBLEMS:\n([\s\S]*?)(?=IMPROVED:)/);
    const problems = problemsMatch
      ? problemsMatch[1].split("\n").filter(l => l.trim().startsWith("-")).map(l => l.trim().replace(/^-\s*/, ""))
      : [];

    const improvedMatch = response.match(/IMPROVED:\n([\s\S]*?)(?=EXPLANATION:)/);
    const improved = improvedMatch ? improvedMatch[1].trim() : "";

    const explanationMatch = response.match(/EXPLANATION:\n([\s\S]*?)$/);
    const explanation = explanationMatch ? explanationMatch[1].trim() : "";

    res.json({
      success: true,
      original: cleanPrompt,
      analysis: { score, problems, improved, explanation },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in prompt-optimizer:", error);
    res.status(500).json({
      error: "Optimization failed",
      message: error.message,
    });
  }
});

// Prompt Library
router.get("/api/prompts", promptLibraryRateLimit, (req, res) => {
  try {
    const { category, search, sort, page, limit: queryLimit } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(queryLimit) || 20), 50);

    // Check cache
    const cacheKey = `prompts:${category || 'all'}:${search || ''}:${sort || ''}:${pageNum}:${limitNum}`;
    const cached = promptsCache.get(cacheKey);
    if (cached) {
      setCacheHeaders(res, 300, 600);
      return res.json(cached);
    }

    let filteredPrompts = [...FEATURED_PROMPTS];

    // Filter by category
    if (category) {
      filteredPrompts = filteredPrompts.filter(p => p.category === category.toLowerCase());
    }

    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      filteredPrompts = filteredPrompts.filter(p =>
        p.title.toLowerCase().includes(searchLower) ||
        p.prompt.toLowerCase().includes(searchLower) ||
        p.tags.some(t => t.includes(searchLower))
      );
    }

    // Sort
    if (sort === "rating") {
      filteredPrompts.sort((a, b) => b.rating - a.rating);
    } else if (sort === "uses") {
      filteredPrompts.sort((a, b) => b.uses - a.uses);
    } else if (sort === "newest") {
      filteredPrompts.sort((a, b) => b.id - a.id);
    }

    // Pagination
    const total = filteredPrompts.length;
    const offset = (pageNum - 1) * limitNum;
    const paginatedPrompts = filteredPrompts.slice(offset, offset + limitNum);

    const response = {
      success: true,
      count: paginatedPrompts.length,
      prompts: paginatedPrompts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      },
      categories: [...new Set(FEATURED_PROMPTS.map(p => p.category))],
      timestamp: new Date().toISOString()
    };

    promptsCache.set(cacheKey, response);
    setCacheHeaders(res, 300, 600);
    res.json(response);

  } catch (error) {
    console.error("Error fetching prompts:", error);
    res.status(500).json({
      error: "Failed to fetch prompts",
      message: error.message,
    });
  }
});

// Single Prompt
router.get("/api/prompts/:id", promptLibraryRateLimit, (req, res) => {
  try {
    const promptId = parseInt(req.params.id);

    if (isNaN(promptId)) {
      return res.status(400).json({
        error: "Invalid ID",
        message: "Prompt ID must be a number"
      });
    }

    const prompt = FEATURED_PROMPTS.find(p => p.id === promptId);

    if (!prompt) {
      return res.status(404).json({
        error: "Not found",
        message: `Prompt with ID ${promptId} not found`
      });
    }

    setCacheHeaders(res, 600, 1200);
    res.json({ success: true, prompt });
  } catch (error) {
    console.error("Error fetching prompt:", error);
    res.status(500).json({
      error: "Failed to fetch prompt",
      message: error.message,
    });
  }
});

export default router;
