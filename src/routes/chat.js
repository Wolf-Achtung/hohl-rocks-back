// ===================================================================
// CHAT ROUTE - Single model chat with Claude
// ===================================================================

import { Router } from "express";
import { chatPromptFor } from "../config/chatPrompt.js";
import { logConversation } from "../config/chatLog.js";
import { generalRateLimit } from "../middleware/rateLimit.js";
import { chatWithClaude } from "../services/ai-clients.js";
import { moderateContent } from "../services/moderation.js";
import { sanitizePrompt, setNoCacheHeaders, getSessionId, sendError } from "../utils/helpers.js";
import { log } from "../utils/logger.js";

const router = Router();

// This endpoint only ever calls Claude; "model" is accepted for forward
// compatibility but is validated against this list before it reaches the
// chat log - unvalidated it would be stored verbatim.
const SUPPORTED_MODELS = ["claude"];

router.post("/api/chat", generalRateLimit, async (req, res) => {
  setNoCacheHeaders(res);

  const startTime = Date.now();
  const sessionId = getSessionId(req, res);

  try {
    const { messages, model: requestedModel } = req.body;
    // Die Seite unter /en/ schickt ihre Sprache mit. Alles ausser
    // "en" bleibt Deutsch - auch fehlende oder unbekannte Werte.
    const sprache = req.body?.lang === "en" ? "en" : "de";
    const model = SUPPORTED_MODELS.includes(requestedModel) ? requestedModel : "claude";

    // Validate messages array
    if (!messages || !Array.isArray(messages)) {
      return sendError(res, 400, "Messages array required", "Please provide a messages array with role and content");
    }

    if (messages.length === 0) {
      return sendError(res, 400, "Empty messages array", "Please provide at least one message");
    }

    // The system prompt is enforced server-side (see config/chatPrompt.js).
    // Client-supplied "system" messages are dropped - otherwise this endpoint
    // is an open Claude proxy with a freely choosable persona.
    const userMessages = messages.filter(m => m?.role === "user" || m?.role === "assistant");

    // Reject malformed message objects before they reach sanitizePrompt/Claude
    // (a non-string content would throw a TypeError -> generic 500).
    if (userMessages.some(m => typeof m.content !== "string")) {
      return sendError(res, 400, "Invalid message format", "Each message needs a string content field");
    }

    if (userMessages.length === 0) {
      return sendError(res, 400, "No user message found", "Please provide at least one user message");
    }

    const lastUserMessage = userMessages.filter(m => m.role === "user").pop()?.content || "";

    // Validate total length
    const totalLength = userMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (totalLength > 4000) {
      return sendError(res, 400, "Messages too long", "Total message content exceeds 4000 characters");
    }

    // Content moderation
    const modResult = moderateContent(lastUserMessage);

    if (modResult.flagged) {
      await logConversation({
        sessionId,
        userMessage: lastUserMessage,
        aiResponse: null,
        model,
        flagged: true,
        flagReason: modResult.reason,
        responseTimeMs: Date.now() - startTime
      });

      log.debug(`Flagged message: ${modResult.reason}`);

      return res.json({
        success: true,
        response: sprache === "en"
          ? "That is not my subject. Ask me about AI, my work or SC Freiburg instead! ⚽"
          : "Das ist nicht mein Thema. Frag mich lieber was über KI, meine Arbeit oder den SC Freiburg! ⚽",
        model: "moderation",
        flagged: true,
        timestamp: new Date().toISOString()
      });
    }

    log.debug(`Chat request (model: ${model})`);

    const aiResponse = await chatWithClaude({
      systemMessage: chatPromptFor(sprache),
      userMessages: userMessages.map(m => ({
        role: m.role,
        content: sanitizePrompt(m.content)
      }))
    });

    const responseTime = Date.now() - startTime;

    await logConversation({
      sessionId,
      userMessage: lastUserMessage,
      aiResponse,
      model,
      flagged: false,
      flagReason: null,
      responseTimeMs: responseTime
    });

    log.debug(`Chat completed in ${responseTime}ms`);

    res.json({
      success: true,
      response: aiResponse,
      model: "claude",
      responseTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    await logConversation({
      sessionId,
      userMessage: req.body?.messages?.filter(m => m.role === "user").pop()?.content || "unknown",
      aiResponse: null,
      model: "claude",
      flagged: false,
      flagReason: `error:${error.message}`,
      responseTimeMs: Date.now() - startTime
    });

    log.error("Chat error:", error.message);
    sendError(res, 500, "Chat failed", error.message.includes("timeout") ? "Zeitüberschreitung" : "Service vorübergehend nicht verfügbar");
  }
});

export default router;
