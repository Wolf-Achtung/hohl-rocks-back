// ===================================================================
// CONTENT ROUTES - Daily Challenge, News, Spark
// ===================================================================

import { Router } from "express";
import { promptLibraryRateLimit } from "../middleware/rateLimit.js";
import { callClaude } from "../services/ai-clients.js";
import { setCacheHeaders } from "../utils/helpers.js";
import { createCache } from "../utils/cache.js";
import { NEWS_DATABASE, SPARKS_DATABASE } from "../data/prompts.js";
import { log } from "../utils/logger.js";

const router = Router();
const newsCache = createCache(300000); // 5 min

// Daily Challenge - Get
router.get("/api/daily-challenge", async (req, res) => {
  try {
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];

    log.debug(`Fetching Daily Challenge for ${dateString}`);

    const systemPrompt = `Du bist ein KI-Challenge-Designer. Erstelle eine tägliche KI-Challenge für das Datum ${dateString}.

Die Challenge sollte:
1. Praktisch und im echten Leben nützlich sein
2. In 10-15 Minuten lösbar sein
3. Kreativität fördern
4. Klare Bewertungskriterien haben

Erstelle eine Challenge mit 3 Schwierigkeitsgraden:
- **Beginner**: Einfach, klare Struktur, wenig Erfahrung nötig
- **Intermediate**: Moderater Anspruch, etwas strategisches Denken
- **Expert**: Komplex, erfordert tiefes Verständnis

Antworte NUR mit einem JSON-Objekt, keine zusätzlichen Erklärungen.`;

    const userPrompt = `Erstelle eine Daily Challenge im folgenden Format:

{
  "date": "${dateString}",
  "theme": "Kurzes Thema (z.B. 'Content Creation', 'Problem Solving')",
  "challenges": {
    "beginner": {
      "title": "Challenge Titel",
      "description": "Was soll gemacht werden? (2-3 Sätze)",
      "task": "Konkrete Aufgabe",
      "hint": "Hilfreicher Tipp",
      "estimatedTime": "10 Min"
    },
    "intermediate": {
      "title": "Challenge Titel",
      "description": "Was soll gemacht werden? (2-3 Sätze)",
      "task": "Konkrete Aufgabe",
      "hint": "Hilfreicher Tipp",
      "estimatedTime": "12 Min"
    },
    "expert": {
      "title": "Challenge Titel",
      "description": "Was soll gemacht werden? (2-3 Sätze)",
      "task": "Konkrete Aufgabe",
      "hint": "Hilfreicher Tipp",
      "estimatedTime": "15 Min"
    }
  }
}

Sei kreativ! Wechsle zwischen verschiedenen Themen: Content, Strategie, Analyse, Kommunikation, etc.`;

    const responseText = await callClaude(systemPrompt, userPrompt, 2000);

    // Parse JSON from response
    let challenge;
    try {
      challenge = JSON.parse(responseText);
    } catch (_parseErr) {
      const jsonMatch = responseText.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch) {
        challenge = JSON.parse(jsonMatch[1]);
      } else {
        const objectMatch = responseText.match(/{[\s\S]+}/);
        if (objectMatch) {
          challenge = JSON.parse(objectMatch[0]);
        } else {
          throw new Error("Could not parse JSON from response");
        }
      }
    }

    log.debug(`Generated challenge: "${challenge.theme}"`);

    res.json({
      success: true,
      challenge,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log.error("Error generating daily challenge:", error.message);
    res.status(500).json({
      error: "Failed to generate daily challenge",
      message: error.message
    });
  }
});

// Daily Challenge - Submit & Evaluate
router.post("/api/submit-challenge", async (req, res) => {
  try {
    const { difficulty, task, answer } = req.body;

    if (!difficulty || !task || !answer) {
      return res.status(400).json({
        error: "Missing required fields: difficulty, task, answer"
      });
    }

    if (answer.trim().length < 20) {
      return res.status(400).json({
        error: "Answer too short (minimum 20 characters)"
      });
    }

    if (answer.length > 5000) {
      return res.status(400).json({
        error: "Answer too long (maximum 5000 characters)"
      });
    }

    log.debug(`Evaluating ${difficulty} challenge submission...`);

    const systemPrompt = `Du bist ein KI-Challenge-Bewerter. Bewerte die eingereichte Antwort auf eine Daily Challenge.

Bewertungskriterien:
- **Relevanz**: Passt die Antwort zur Aufgabe?
- **Qualität**: Ist die Antwort durchdacht und gut strukturiert?
- **Kreativität**: Zeigt die Antwort originelles Denken?
- **Vollständigkeit**: Wurden alle Aspekte der Aufgabe erfüllt?

Badge-Vergabe:
- **Bronze (60-74%)**: Grundlegende Anforderungen erfüllt, aber Verbesserungspotenzial
- **Silver (75-89%)**: Gute Qualität, durchdacht, erfüllt Anforderungen gut
- **Gold (90-100%)**: Exzellent, kreativ, professionell, übertrifft Erwartungen

Antworte NUR mit einem JSON-Objekt, keine zusätzlichen Erklärungen.`;

    const userPrompt = `Aufgabe (${difficulty}): "${task}"

Eingereichte Antwort:
"${answer}"

Bewerte die Antwort und erstelle ein JSON-Objekt:
{
  "score": 85,
  "badge": "silver",
  "feedback": {
    "positive": ["Was wurde gut gemacht?", "Stärken der Antwort"],
    "improvements": ["Was könnte besser sein?", "Verbesserungsvorschläge"]
  },
  "summary": "Kurze 1-2 Satz Zusammenfassung der Bewertung"
}`;

    const responseText = await callClaude(systemPrompt, userPrompt, 1500);

    let evaluation;
    try {
      evaluation = JSON.parse(responseText);
    } catch (_parseErr) {
      const jsonMatch = responseText.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[1]);
      } else {
        const objectMatch = responseText.match(/{[\s\S]+}/);
        if (objectMatch) {
          evaluation = JSON.parse(objectMatch[0]);
        } else {
          throw new Error("Could not parse JSON from response");
        }
      }
    }

    log.debug(`Evaluation complete: ${evaluation.badge?.toUpperCase()} (${evaluation.score}%)`);

    res.json({
      success: true,
      evaluation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log.error("Error evaluating challenge:", error.message);
    res.status(500).json({
      error: "Failed to evaluate challenge",
      message: error.message
    });
  }
});

// KI-News
router.get("/api/news", promptLibraryRateLimit, (req, res) => {
  try {
    const { page, limit, compact } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 6), 20);

    const cacheKey = `news:${pageNum}:${limitNum}:${compact || ''}`;
    const cached = newsCache.get(cacheKey);
    if (cached) {
      setCacheHeaders(res, 300, 600);
      return res.json(cached);
    }

    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);

    const startIndex = dayOfYear % NEWS_DATABASE.length;
    const selectedNews = [];
    for (let i = 0; i < 6; i++) {
      const index = (startIndex + i) % NEWS_DATABASE.length;
      selectedNews.push(NEWS_DATABASE[index]);
    }

    const offset = (pageNum - 1) * limitNum;
    const paginatedNews = selectedNews.slice(offset, offset + limitNum);

    log.debug(`Serving ${paginatedNews.length} news items (rotation: day ${dayOfYear})`);

    const formattedNews = compact === 'true'
      ? paginatedNews.map(n => ({ t: n.title, d: n.date, u: n.url, s: n.source }))
      : paginatedNews;

    const response = {
      success: true,
      items: formattedNews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: selectedNews.length,
        pages: Math.ceil(selectedNews.length / limitNum)
      },
      lastUpdated: new Date().toISOString(),
      rotationDay: dayOfYear
    };

    newsCache.set(cacheKey, response);
    setCacheHeaders(res, 300, 600);
    res.json(response);

  } catch (error) {
    log.error("Error fetching news:", error.message);
    res.status(500).json({
      error: "Failed to fetch news",
      message: error.message
    });
  }
});

// Spark of the Day
router.get("/api/spark/today", (req, res) => {
  try {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const sparkIndex = dayOfYear % SPARKS_DATABASE.length;
    const spark = SPARKS_DATABASE[sparkIndex];

    log.debug(`Serving Spark of the Day: "${spark.spark.slice(0, 50)}..."`);

    setCacheHeaders(res, 3600, 7200);
    res.json({
      success: true,
      spark: spark.spark,
      author: spark.author,
      category: spark.category,
      date: new Date().toISOString().split('T')[0],
      sparkNumber: sparkIndex + 1,
      totalSparks: SPARKS_DATABASE.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error("Error fetching spark:", error.message);
    res.status(500).json({
      error: "Failed to fetch spark of the day",
      message: error.message
    });
  }
});

export default router;
