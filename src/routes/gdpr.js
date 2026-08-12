// ===================================================================
// GDPR COMPLIANCE ROUTES - User Data Access/Deletion
// ===================================================================

import { Router } from "express";
import { getChatLogs, deleteSessionLogs } from "../config/chatLog.js";
import { gdprRateLimit } from "../middleware/rateLimit.js";
import { log } from "../utils/logger.js";
import { sendError } from "../utils/helpers.js";

const router = Router();

// Get user's own data
router.get("/api/my-data", gdprRateLimit, async (req, res) => {
  const sessionId = req.cookies?.chat_session;

  if (!sessionId) {
    return sendError(res, 400, 'Keine Session gefunden', 'Du hast keine aktive Chat-Session.');
  }

  try {
    const sessionLogs = getChatLogs()
      .filter(l => l.session_id === sessionId)
      .map(l => ({ created_at: l.created_at, user_message: l.user_message, ai_response: l.ai_response }))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    res.json({ success: true, sessionId, conversations: sessionLogs, count: sessionLogs.length });
  } catch (error) {
    log.error('My-data error:', error.message);
    sendError(res, 500, 'Daten konnten nicht abgerufen werden', error.message);
  }
});

// Delete user's own data
router.delete("/api/my-data", gdprRateLimit, async (req, res) => {
  const sessionId = req.cookies?.chat_session;

  if (!sessionId) {
    return sendError(res, 400, 'Keine Session gefunden', 'Du hast keine aktive Chat-Session.');
  }

  try {
    const deletedCount = deleteSessionLogs(sessionId);

    res.clearCookie('chat_session');
    res.json({ success: true, message: 'Alle deine Chat-Daten wurden gelöscht.', deletedCount });
  } catch (error) {
    log.error('Delete my-data error:', error.message);
    sendError(res, 500, 'Daten konnten nicht gelöscht werden', error.message);
  }
});

export default router;
