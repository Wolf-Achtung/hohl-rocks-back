// ===================================================================
// CHAT ROUTE - Single model chat with Claude
// ===================================================================

import { Router } from "express";
import { logConversation } from "../config/database.js";
import { generalRateLimit } from "../middleware/rateLimit.js";
import { chatWithClaude } from "../services/ai-clients.js";
import { moderateContent } from "../services/moderation.js";
import { sanitizePrompt, setNoCacheHeaders, getSessionId } from "../utils/helpers.js";
import { log } from "../utils/logger.js";

const router = Router();

router.post("/api/chat", generalRateLimit, async (req, res) => {
  setNoCacheHeaders(res);

  const startTime = Date.now();
  const sessionId = getSessionId(req, res);

  try {
    const { messages, model = "claude" } = req.body;

    // Validate messages array
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: "Messages array required",
        message: "Please provide a messages array with role and content"
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        error: "Empty messages array",
        message: "Please provide at least one message"
      });
    }

    const systemMessage = messages.find(m => m.role === "system")?.content || "";
    const userMessages = messages.filter(m => m.role === "user" || m.role === "assistant");

    if (userMessages.length === 0) {
      return res.status(400).json({
        error: "No user message found",
        message: "Please provide at least one user message"
      });
    }

    const lastUserMessage = userMessages.filter(m => m.role === "user").pop()?.content || "";

    // Validate total length
    const totalLength = userMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (totalLength > 4000) {
      return res.status(400).json({
        error: "Messages too long",
        message: "Total message content exceeds 4000 characters"
      });
    }

    // Content moderation
    const modResult = moderateContent(lastUserMessage);

    if (modResult.flagged) {
      await logConversation({
        sessionId,
        userMessage: lastUserMessage,
        aiResponse: null,
        model,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent'),
        flagged: true,
        flagReason: modResult.reason,
        responseTimeMs: Date.now() - startTime
      });

      log.debug(`Flagged message: ${modResult.reason}`);

      return res.json({
        success: true,
        response: "Das ist nicht mein Thema. Frag mich lieber was über KI, meine Arbeit oder den SC Freiburg! ⚽",
        model: "moderation",
        flagged: true,
        timestamp: new Date().toISOString()
      });
    }

    log.debug(`Chat request (model: ${model})`);

    const aiResponse = await chatWithClaude({
      systemMessage,
      userMessages: userMessages.map(m => ({
        role: m.role,
        content: sanitizePrompt(m.content || "")
      }))
    });

    const responseTime = Date.now() - startTime;

    await logConversation({
      sessionId,
      userMessage: lastUserMessage,
      aiResponse,
      model,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('User-Agent'),
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
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('User-Agent'),
      flagged: false,
      flagReason: `error:${error.message}`,
      responseTimeMs: Date.now() - startTime
    });

    log.error("Chat error:", error.message);
    res.status(500).json({
      success: false,
      error: "Chat failed",
      message: error.message.includes("timeout") ? "Zeitüberschreitung" : "Service vorübergehend nicht verfügbar",
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
