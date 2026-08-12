// ===================================================================
// MODEL BATTLE ROUTE - Compare 4 AI models in parallel
// ===================================================================

import { Router } from "express";
import { NODE_ENV } from "../config/env.js";
import { modelBattleRateLimit } from "../middleware/rateLimit.js";
import { runModelBattle, runModelBattleStream, BATTLE_MODEL_IDS } from "../services/ai-clients.js";
import { moderateContent } from "../services/moderation.js";
import { sanitizePrompt, setNoCacheHeaders, sendError } from "../utils/helpers.js";
import { log } from "../utils/logger.js";

const router = Router();

// Was der Besucher zu sehen bekommt, wenn ein Filter greift. Bewusst
// erklaerend statt abweisend: die Seite verkauft KI-Sicherheit, also ist
// eine sichtbar arbeitende Leitplanke hier das bessere Schaufenster.
const BLOCK_TEXTS = {
  weapons: "Anleitungen zum Bau von Waffen gebe ich nicht weiter.",
  malware: "Beim Bauen von Schadsoftware mache ich nicht mit. Über Abwehr reden wir gern.",
  credentials: "Fremde Konten oder Zugangsdaten sind hier tabu.",
  drugs: "Bei der Herstellung von Drogen bin ich raus.",
  csam: "Das wird hier nicht verarbeitet.",
  jailbreak: "Das war ein Versuch, die Regeln zu überschreiben – abgefangen.",
  selfharm: "Das klingt, als ginge es dir gerade nicht gut."
};

const BLOCK_TEXTS_EN = {
  weapons: "I do not pass on instructions for building weapons.",
  malware: "I will not help build malware. Happy to talk about defence.",
  credentials: "Other people's accounts or credentials are off limits here.",
  drugs: "Making drugs is where I stop.",
  csam: "This is not processed here.",
  jailbreak: "That was an attempt to overwrite the rules – intercepted.",
  selfharm: "That sounds like you are not doing well right now."
};

const GUARD_HINT =
  "So arbeitet eine Leitplanke: Die Eingabe wird geprüft, bevor sie ein " +
  "Modell erreicht. Nicht das Vokabular entscheidet, sondern die Absicht – " +
  "über Angriffe zu sprechen ist erlaubt, eine Anleitung dazu nicht.";

const GUARD_HINT_EN =
  "This is how a guardrail works: the input is checked before it reaches " +
  "a model. Vocabulary does not decide, intent does – talking about " +
  "attacks is fine, a set of instructions for one is not.";

const CARE_HINT =
  "Bitte sprich mit einem Menschen darüber. Die Telefonseelsorge ist rund " +
  "um die Uhr erreichbar, kostenlos und anonym: 0800 111 0 111 oder " +
  "0800 111 0 222. Im Notfall: 112.";

// Dieselben Nummern: die Seite steht in Berlin, und die Telefonseelsorge
// ist die Stelle, die hier wirklich erreichbar ist.
const CARE_HINT_EN =
  "Please talk to someone about this. In Germany, Telefonseelsorge is " +
  "available around the clock, free and anonymous: 0800 111 0 111 or " +
  "0800 111 0 222. In an emergency: 112.";

// Gemeinsamer Torwaechter beider Battle-Routen. Antwortet selbst und gibt
// null zurueck, sonst den geprueften Prompt.
function guardBattleRequest(req, res, mode, sprache) {
  const cleanPrompt = validateBattlePrompt(req, res);
  if (cleanPrompt === null) return null;

  const englisch = sprache === "en";

  // Im Leitplanken-Test sind Rollenwechsel-Versuche das Testmaterial -
  // sie zu blocken wuerde den Sinn der Uebung zerstoeren. Alles andere
  // gilt dort genauso.
  const verdict = moderateContent(cleanPrompt, { allowJailbreak: mode === "guard" });
  if (verdict.flagged) {
    log.info(`Battle blocked: ${verdict.category}`);
    // 200, kein Fehler: die Anzeige soll das erklaeren, nicht als Panne
    // behandeln. Der Prompt selbst wird nicht zurueckgespiegelt.
    res.json({
      success: false,
      blocked: true,
      moderation: {
        category: verdict.category,
        label: verdict.label,
        message: englisch
          ? (BLOCK_TEXTS_EN[verdict.category] || "I intercepted this request.")
          : (BLOCK_TEXTS[verdict.category] || "Diese Anfrage habe ich abgefangen."),
        hint: verdict.care
          ? (englisch ? CARE_HINT_EN : CARE_HINT)
          : (englisch ? GUARD_HINT_EN : GUARD_HINT),
        care: !!verdict.care
      },
      timestamp: new Date().toISOString()
    });
    return null;
  }

  return cleanPrompt;
}

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
    const mode = req.body?.mode === "guard" ? "guard" : "normal";
    // Die Seite unter /en/ schickt ihre Sprache mit. Alles ausser "en"
    // bleibt Deutsch - auch fehlende oder unbekannte Werte.
    const sprache = req.body?.lang === "en" ? "en" : "de";
    const cleanPrompt = guardBattleRequest(req, res, mode, sprache);
    if (cleanPrompt === null) return;

    log.debug(`Model Battle (${mode}): "${cleanPrompt.slice(0, 50)}..." (${cleanPrompt.length} chars)`);

    const responses = await runModelBattle(cleanPrompt, mode, sprache);
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
  const mode = req.body?.mode === "guard" ? "guard" : "normal";
  const sprache = req.body?.lang === "en" ? "en" : "de";
  const cleanPrompt = guardBattleRequest(req, res, mode, sprache);
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

  log.debug(`Model Battle stream (${mode}): "${cleanPrompt.slice(0, 50)}..." (${cleanPrompt.length} chars)`);
  send({ type: "start", models: BATTLE_MODEL_IDS, mode, lang: sprache });

  const results = [];
  try {
    await runModelBattleStream(cleanPrompt, (event) => {
      if (event.type === "result") results.push(event);
      send(event);
    }, abort.signal, mode, sprache);
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
