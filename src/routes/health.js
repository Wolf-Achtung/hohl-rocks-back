// ===================================================================
// HEALTH CHECK & INFO ROUTES
// ===================================================================

import { Router } from "express";
import { API_VERSION, NODE_ENV, PORT, MODEL } from "../config/env.js";
import { isDbConnected, getDbStatus } from "../config/database.js";
import { FEATURED_PROMPTS } from "../data/prompts.js";

const router = Router();

// Main Health Check
router.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "hohl.rocks backend is running",
    version: API_VERSION,
    features: {
      critical: ["model-battle"],
      legacy: [
        "prompt-generator",
        "prompt-optimizer",
        "prompt-library",
        "daily-challenge",
        "ki-news",
        "spark"
      ]
    },
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Detailed Health Check
router.get("/health", (req, res) => {
  const health = {
    status: "healthy",
    version: API_VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      api: "ok",
      database: isDbConnected() ? "connected" : "fallback (in-memory)",
      // Why, not just what - a silent fallback cost a day of guessing once.
      // Credentials are stripped in database.js before the text gets here.
      databaseDetail: getDbStatus(),
      rateLimiting: "active"
    },
    environment: {
      nodeEnv: NODE_ENV,
      port: PORT,
      corsOrigins: 7,
      apiKeysConfigured: {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        perplexity: !!process.env.PERPLEXITY_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY
      }
    }
  };

  res.json(health);
});

// Kubernetes probes
router.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

router.get("/readyz", (req, res) => {
  res.status(200).json({
    status: "ready",
    database: isDbConnected() ? "connected" : "in-memory"
  });
});

// API Self-description
router.get("/api/self", (req, res) => {
  res.json({
    name: "HOHL.ROCKS Backend",
    version: API_VERSION,
    model: MODEL,
    prompts: FEATURED_PROMPTS.length,
    endpoints: {
      critical: {
        "POST /api/model-battle": "Compare 4 AI models in parallel (Rate: 10/min)"
      },
      chat: {
        "POST /api/chat": "Single-model chat with Claude (Rate: 30/min)"
      },
      prompts: {
        "POST /api/prompt-generator": "Generate 5 prompt styles (Rate: 20/min)",
        "POST /api/prompt-optimizer": "Analyze & improve prompts (Rate: 20/min)",
        "GET /api/prompts": "Browse prompt library (Rate: 60/min)",
        "GET /api/prompts/:id": "Get single prompt (Rate: 60/min)"
      },
      content: {
        "GET /api/daily-challenge": "Daily AI challenge",
        "POST /api/submit-challenge": "Submit & evaluate challenge answer",
        "GET /api/news": "KI-News (Daily rotating)",
        "GET /api/spark/today": "Daily inspiration quote"
      },
      user: {
        "GET /api/my-data": "Retrieve own chat history (GDPR)",
        "DELETE /api/my-data": "Delete own chat history (GDPR)"
      },
      admin: {
        "GET /api/admin/chat-logs": "View chat logs (Auth required)",
        "GET /api/admin/chat-stats": "Chat statistics (Auth required)",
        "GET /api/admin/chat-logs/export": "Export logs as CSV (Auth required)"
      }
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
