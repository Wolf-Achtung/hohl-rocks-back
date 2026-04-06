// ===================================================================
// GDPR COMPLIANCE ROUTES - User Data Access/Deletion
// ===================================================================

import { Router } from "express";
import { getPool, isDbConnected, getInMemoryLogs } from "../config/database.js";
import { gdprRateLimit } from "../middleware/rateLimit.js";
import { log } from "../utils/logger.js";

const router = Router();

// Get user's own data
router.get("/api/my-data", gdprRateLimit, async (req, res) => {
  const sessionId = req.cookies?.chat_session;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'Keine Session gefunden',
      message: 'Du hast keine aktive Chat-Session.'
    });
  }

  try {
    const pool = getPool();
    if (pool && isDbConnected()) {
      const result = await pool.query(
        'SELECT created_at, user_message, ai_response FROM chat_logs WHERE session_id = $1 ORDER BY created_at ASC',
        [sessionId]
      );
      return res.json({ success: true, sessionId, conversations: result.rows, count: result.rows.length });
    }

    const sessionLogs = getInMemoryLogs()
      .filter(l => l.session_id === sessionId)
      .map(l => ({ created_at: l.created_at, user_message: l.user_message, ai_response: l.ai_response }))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    res.json({ success: true, sessionId, conversations: sessionLogs, count: sessionLogs.length });
  } catch (error) {
    log.error('My-data error:', error.message);
    res.status(500).json({ success: false, error: 'Daten konnten nicht abgerufen werden', message: error.message });
  }
});

// Delete user's own data
router.delete("/api/my-data", gdprRateLimit, async (req, res) => {
  const sessionId = req.cookies?.chat_session;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'Keine Session gefunden',
      message: 'Du hast keine aktive Chat-Session.'
    });
  }

  try {
    let deletedCount = 0;

    const pool = getPool();
    if (pool && isDbConnected()) {
      const result = await pool.query('DELETE FROM chat_logs WHERE session_id = $1', [sessionId]);
      deletedCount = result.rowCount;
    } else {
      const inMemoryLogs = getInMemoryLogs();
      const initialLength = inMemoryLogs.length;
      const remaining = inMemoryLogs.filter(l => l.session_id !== sessionId);
      inMemoryLogs.length = 0;
      inMemoryLogs.push(...remaining);
      deletedCount = initialLength - inMemoryLogs.length;
    }

    res.clearCookie('chat_session');
    res.json({ success: true, message: 'Alle deine Chat-Daten wurden gelöscht.', deletedCount });
  } catch (error) {
    log.error('Delete my-data error:', error.message);
    res.status(500).json({ success: false, error: 'Daten konnten nicht gelöscht werden', message: error.message });
  }
});

export default router;
