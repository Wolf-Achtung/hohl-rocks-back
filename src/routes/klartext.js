// ===================================================================
// KLARTEXT ROUTE - Der Übersetzer der Goodie-Sektion
// ===================================================================
// Ein Satz voller Floskeln geht rein, derselbe Satz in Klartext kommt
// zurück. Bewusst ohne Gesprächsverlauf und ohne Protokoll: Hier
// landen echte Entwürfe - eine Absage, eine Mahnung, ein Beileid.
// Die gehen niemanden etwas an, auch uns nicht. Gespeichert wird
// nichts, geloggt nur die Dauer.

import { Router } from "express";
import { KLARTEXT_SYSTEM_PROMPT, KLARTEXT_BLOCK_TEXT, KLARTEXT_BLOCK_TEXT_EN } from "../config/klartextPrompt.js";
import { generalRateLimit } from "../middleware/rateLimit.js";
import { callClaude } from "../services/ai-clients.js";
import { moderateContent } from "../services/moderation.js";
import { sanitizePrompt, setNoCacheHeaders, sendError } from "../utils/helpers.js";
import { log } from "../utils/logger.js";

const router = Router();

const MAX_TEXT_LENGTH = 1000;

// Dieselben Nummern wie im Battle (siehe modelBattle.js): die Seite
// steht in Berlin, die Telefonseelsorge ist hier wirklich erreichbar.
const CARE_HINT =
  "Bitte sprich mit einem Menschen darüber. Die Telefonseelsorge ist rund " +
  "um die Uhr erreichbar, kostenlos und anonym: 0800 111 0 111 oder " +
  "0800 111 0 222. Im Notfall: 112.";
const CARE_HINT_EN =
  "Please talk to someone about this. In Germany, Telefonseelsorge is " +
  "available around the clock, free and anonymous: 0800 111 0 111 or " +
  "0800 111 0 222. In an emergency: 112.";

router.post("/api/klartext", generalRateLimit, async (req, res) => {
  setNoCacheHeaders(res);

  const startTime = Date.now();
  const englisch = req.body?.lang === "en";

  try {
    const { text } = req.body ?? {};

    if (typeof text !== "string" || text.trim().length === 0) {
      return sendError(res, 400, "Text required", englisch
        ? "Please send the sentence you want translated."
        : "Bitte schick den Satz mit, der übersetzt werden soll.");
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return sendError(res, 400, "Text too long", englisch
        ? `Please keep it under ${MAX_TEXT_LENGTH} characters.`
        : `Bitte bleib unter ${MAX_TEXT_LENGTH} Zeichen.`);
    }

    const verdict = moderateContent(text);
    if (verdict.flagged) {
      log.info(`Klartext blocked: ${verdict.category}`);
      // 200, kein Fehler: die Anzeige erklärt das, statt eine Panne zu
      // melden. Der Text selbst wird nicht zurückgespiegelt.
      return res.json({
        success: false,
        blocked: true,
        moderation: {
          category: verdict.category,
          message: englisch ? KLARTEXT_BLOCK_TEXT_EN : KLARTEXT_BLOCK_TEXT,
          hint: verdict.care ? (englisch ? CARE_HINT_EN : CARE_HINT) : null,
          care: !!verdict.care
        },
        timestamp: new Date().toISOString()
      });
    }

    const klartext = await callClaude(KLARTEXT_SYSTEM_PROMPT, sanitizePrompt(text), 400);

    const responseTime = Date.now() - startTime;
    log.debug(`Klartext completed in ${responseTime}ms`);

    res.json({
      success: true,
      klartext: typeof klartext === "string" ? klartext.trim() : klartext,
      responseTime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error("Klartext error:", error.message);
    sendError(res, 500, "Klartext failed", error.message.includes("timeout")
      ? (englisch ? "Timed out - please try again." : "Zeitüberschreitung - bitte noch einmal.")
      : (englisch ? "Temporarily unavailable." : "Gerade nicht erreichbar."));
  }
});

export default router;
