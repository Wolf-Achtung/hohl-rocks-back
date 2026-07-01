// ===================================================================
// MODEL BATTLE ROUTE - Compare 4 AI models in parallel
// ===================================================================

import { Router } from "express";
import { NODE_ENV } from "../config/env.js";
import { modelBattleRateLimit } from "../middleware/rateLimit.js";
import { runModelBattle } from "../services/ai-clients.js";
import { sanitizePrompt, setNoCacheHeaders, sendError } from "../utils/helpers.js";
import { log } from "../utils/logger.js";

const router = Router();

router.post("/api/model-battle", modelBattleRateLimit, async (req, res) => {
  setNoCacheHeaders(res);

  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return sendError(res, 400, "Prompt is required", "Please provide a non-empty prompt string");
    }

    if (prompt.length > 2000) {
      return res.status(400).json({
        success: false,
        error: "Prompt too long",
        message: "Maximum prompt length is 2000 characters",
        currentLength: prompt.length,
        timestamp: new Date().toISOString()
      });
    }

    const cleanPrompt = sanitizePrompt(prompt);

    if (cleanPrompt.length < 3) {
      return sendError(res, 400, "Invalid prompt", "Prompt must contain meaningful content");
    }

    log.debug(`Model Battle: "${cleanPrompt.slice(0, 50)}..." (${cleanPrompt.length} chars)`);

    const responses = await runModelBattle(cleanPrompt);
    const successCount = responses.filter(r => r.success).length;

    log.debug(`Model Battle completed: ${successCount}/4 models successful`);
    if (NODE_ENV === "development") {
      responses.forEach(r => {
        log.debug(`  ${r.name}: ${r.responseTime}ms ${r.success ? '✓' : '✗'}`);
      });
    }

    res.json({
      success: successCount > 0,
      partialFailure: successCount < 4 && successCount > 0,
      prompt: cleanPrompt,
      responses,
      meta: {
        successfulModels: successCount,
        totalModels: 4,
        avgResponseTime: Math.round(responses.reduce((sum, r) => sum + r.responseTime, 0) / 4)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log.error("Model Battle error:", error.message);
    sendError(res, 500, "Internal server error", NODE_ENV === "development" ? error.message : "Ein Fehler ist aufgetreten");
  }
});

export default router;
