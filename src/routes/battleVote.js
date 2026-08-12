// ===================================================================
// BATTLE VOTE ROUTE - "Which answer is best?" (blind battle)
// ===================================================================
// Visitors vote for the best answer while the model names are still
// hidden; the reveal then shows how everyone else voted so far. Votes
// store nothing but the model id - no prompt, no IP, no cookie.

import { Router } from "express";
import { NODE_ENV } from "../config/env.js";
import { generalRateLimit } from "../middleware/rateLimit.js";
import { BATTLE_MODEL_IDS } from "../services/ai-clients.js";
import { recordBattleVote, getBattleVotes } from "../config/database.js";
import { setNoCacheHeaders, sendError } from "../utils/helpers.js";
import { log } from "../utils/logger.js";

const router = Router();

// Vote counts plus percentages, shaped for direct display
async function voteSummary() {
  const { counts, total } = await getBattleVotes();
  const votes = {};
  for (const id of BATTLE_MODEL_IDS) {
    const count = counts[id] || 0;
    votes[id] = {
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0
    };
  }
  return { votes, total };
}

router.post("/api/battle-vote", generalRateLimit, async (req, res) => {
  setNoCacheHeaders(res);

  try {
    const { model } = req.body;

    if (!BATTLE_MODEL_IDS.includes(model)) {
      return sendError(res, 400, "Invalid model", `Model must be one of: ${BATTLE_MODEL_IDS.join(", ")}`);
    }

    await recordBattleVote(model);
    const summary = await voteSummary();

    res.json({ success: true, ...summary, timestamp: new Date().toISOString() });
  } catch (error) {
    log.error("Battle vote error:", error.message);
    sendError(res, 500, "Internal server error", NODE_ENV === "development" ? error.message : "Ein Fehler ist aufgetreten");
  }
});

router.get("/api/battle-votes", generalRateLimit, async (req, res) => {
  setNoCacheHeaders(res);

  try {
    const summary = await voteSummary();
    res.json({ success: true, ...summary, timestamp: new Date().toISOString() });
  } catch (error) {
    log.error("Battle votes error:", error.message);
    sendError(res, 500, "Internal server error", NODE_ENV === "development" ? error.message : "Ein Fehler ist aufgetreten");
  }
});

export default router;
