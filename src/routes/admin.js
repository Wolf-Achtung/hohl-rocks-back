// ===================================================================
// ADMIN ROUTES - Chat Logs Management
// ===================================================================

import { Router } from "express";
import { MAX_EXPORT_ROWS } from "../config/env.js";
import { getChatLogs } from "../config/chatLog.js";
import { adminAuth } from "../middleware/auth.js";
import { adminRateLimit } from "../middleware/rateLimit.js";
import { log } from "../utils/logger.js";
import { sendError } from "../utils/helpers.js";

const router = Router();

// Neutralize CSV/formula injection: spreadsheet apps treat a leading
// =, +, -, or @ as the start of a formula. User-supplied chat text ends up
// here verbatim, so a message like `=cmd|'/c calc'!A1` could otherwise
// execute when an admin opens the export in Excel/Sheets.
function csvField(value) {
  let str = String(value ?? '');
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
}

// Get all chat logs (with pagination)
router.get("/api/admin/chat-logs", adminRateLimit, adminAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200);
  const offset = (page - 1) * limit;
  const onlyFlagged = req.query.flagged === 'true';

  try {
    const allLogs = getChatLogs();
    const filteredLogs = onlyFlagged ? allLogs.filter(l => l.flagged) : allLogs;

    const total = filteredLogs.length;
    // Kopie sortieren - sort() waere sonst destruktiv auf dem Speicher
    const paginatedLogs = [...filteredLogs]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);

    res.json({
      success: true,
      logs: paginatedLogs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      source: 'in-memory'
    });
  } catch (error) {
    log.error('Admin chat-logs error:', error.message);
    sendError(res, 500, 'Failed to fetch chat logs', error.message);
  }
});

// Get session conversation
router.get("/api/admin/chat-logs/session/:sessionId", adminRateLimit, adminAuth, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const sessionLogs = getChatLogs()
      .filter(l => l.session_id === sessionId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    res.json({ success: true, logs: sessionLogs, count: sessionLogs.length });
  } catch (error) {
    log.error('Admin session-logs error:', error.message);
    sendError(res, 500, 'Failed to fetch session logs', error.message);
  }
});

// Chat stats
router.get("/api/admin/chat-stats", adminRateLimit, adminAuth, async (req, res) => {
  try {
    const logs = getChatLogs();
    const now = Date.now();
    res.json({
      success: true,
      stats: {
        total_conversations: logs.length,
        unique_sessions: new Set(logs.map(l => l.session_id)).size,
        flagged_count: logs.filter(l => l.flagged).length,
        avg_response_time: logs.length > 0
          ? Math.round(logs.reduce((s, l) => s + (l.response_time_ms || 0), 0) / logs.length)
          : 0,
        last_24h: logs.filter(l => now - new Date(l.created_at).getTime() < 86400000).length,
        last_7d: logs.filter(l => now - new Date(l.created_at).getTime() < 604800000).length,
        last_30d: logs.length
      },
      source: 'in-memory'
    });
  } catch (error) {
    log.error('Admin stats error:', error.message);
    sendError(res, 500, 'Failed to fetch stats', error.message);
  }
});

// Flag/unflag chat log
router.patch("/api/admin/chat-logs/:id/flag", adminRateLimit, adminAuth, async (req, res) => {
  const { id } = req.params;
  const { flagged, reason } = req.body;

  try {
    const logEntry = getChatLogs().find(l => l.id === id);
    if (!logEntry) {
      return sendError(res, 404, 'Chat log not found');
    }

    logEntry.flagged = !!flagged;
    logEntry.flag_reason = reason || null;
    res.json({ success: true, log: logEntry });
  } catch (error) {
    log.error('Admin flag error:', error.message);
    sendError(res, 500, 'Failed to update flag', error.message);
  }
});

// Export as CSV
router.get("/api/admin/chat-logs/export", adminRateLimit, adminAuth, async (req, res) => {
  const { from, to } = req.query;

  // Validate date parameters
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  if (from && isNaN(fromDate?.getTime())) {
    return sendError(res, 400, 'Invalid "from" date format');
  }
  if (to && isNaN(toDate?.getTime())) {
    return sendError(res, 400, 'Invalid "to" date format');
  }

  try {
    const filterFrom = fromDate || new Date(0);
    const filterTo = toDate || new Date();
    const logs = getChatLogs()
      .filter(entry => {
        const entryDate = new Date(entry.created_at);
        return entryDate >= filterFrom && entryDate <= filterTo;
      })
      .slice(0, MAX_EXPORT_ROWS);

    const headers = ['Datum', 'Session', 'User-Nachricht', 'KI-Antwort', 'Markiert', 'Grund', 'Antwortzeit (ms)'];
    const csv = [
      headers.join(';'),
      ...logs.map(row => [
        row.created_at,
        row.session_id,
        csvField(row.user_message || ''),
        csvField(row.ai_response || ''),
        row.flagged ? 'Ja' : 'Nein',
        csvField(row.flag_reason || ''),
        row.response_time_ms
      ].join(';'))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=chat-logs-${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    log.error('Admin export error:', error.message);
    sendError(res, 500, 'Failed to export chat logs', error.message);
  }
});

export default router;
