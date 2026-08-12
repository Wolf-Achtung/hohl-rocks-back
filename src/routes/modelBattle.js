// ===================================================================
// MODEL BATTLE ROUTE - Compare 4 AI models in parallel
// ===================================================================

import { Router } from "express";
import { NODE_ENV } from "../config/env.js";
import { modelBattleRateLimit } from "../middleware/rateLimit.js";
import { runModelBattle, runModelBattleStream, BATTLE_MODEL_IDS } from "../services/ai-clients.js";
import { sanitizePrompt, setNoCacheHeaders, sendError } from "../utils/helpers.js";
import { log } from "../utils/logger.js";

const router = Router();

// Shared validation for both battle routes. Sends the error response itself
// and returns null, or returns the sanitized prompt.
function validateBattlePrompt(req, res) {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    sendError(res, 400, "Prompt is required", "Please provide a non-empty prompt string");
    return null;
  }

  if (prompt.length > 2000) {
    res.status(400).json({
      success: false,
      error: "Prompt too long",
      message: "Maximum prompt length is 2000 characters",
      currentLength: prompt.length,
      timestamp: new Date().toISOString()
    });
    return null;
  }

  const cleanPrompt = sanitizePrompt(prompt);

  if (cleanPrompt.length < 3) {
    sendError(res, 400, "Invalid prompt", "Prompt must contain meaningful content");
    return null;
  }

  return cleanPrompt;
}

router.post("/api/model-battle", modelBattleRateLimit, async (req, res) => {
  setNoCacheHeaders(res);

  try {
    const cleanPrompt = validateBattlePrompt(req, res);
    if (cleanPrompt === null) return;

    log.debug(`Model Battle: "${cleanPrompt.slice(0, 50)}..." (${cleanPrompt.length} chars)`);

    const responses = await runModelBattle(cleanPrompt);
    const successCount = responses.filter(r => r.success).length;

    // Logged at info so a partial battle is visible in production logs; the
    // per-model reason itself is logged by runModelBattle.
    const summary = responses
      .map(r => `${r.model}=${r.success ? `${r.responseTime}ms` : r.error}`)
      .join(', ');
    log.info(`Model Battle completed: ${successCount}/4 successful (${summary})`);

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

// Streaming variant: relays every model's tokens as Server-Sent Events the
// moment they arrive, so the four answers type in live instead of appearing
// after the slowest model finishes.
router.post("/api/model-battle-stream", modelBattleRateLimit, async (req, res) => {
  const cleanPrompt = validateBattlePrompt(req, res);
  if (cleanPrompt === null) return;

  // no-transform also opts this response out of the compression middleware,
  // which would otherwise buffer the stream and defeat the point.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (payload) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Stop all four provider calls the moment the client goes away.
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  log.debug(`Model Battle stream: "${cleanPrompt.slice(0, 50)}..." (${cleanPrompt.length} chars)`);
  send({ type: "start", models: BATTLE_MODEL_IDS });

  const results = [];
  try {
    await runModelBattleStream(cleanPrompt, (event) => {
      if (event.type === "result") results.push(event);
      send(event);
    }, abort.signal);
  } catch (error) {
    // runModelBattleStream settles every model internally; this is belt and
    // braces so a bug can never leave the connection hanging open.
    log.error("Model Battle stream error:", error.message);
  }

  const successCount = results.filter(r => r.success).length;
  const summary = results
    .map(r => `${r.model}=${r.success ? `${r.responseTime}ms` : r.error}`)
    .join(', ');
  log.info(`Model Battle stream completed: ${successCount}/4 successful (${summary})`);

  send({ type: "complete", successfulModels: successCount, totalModels: BATTLE_MODEL_IDS.length });
  res.end();
});

export default router;
