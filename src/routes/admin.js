// ===================================================================
// ADMIN ROUTES - Chat Logs Management
// ===================================================================

import { Router } from "express";
import { MAX_EXPORT_ROWS } from "../config/env.js";
import { getPool, isDbConnected, getInMemoryLogs } from "../config/database.js";
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
    const pool = getPool();
    if (pool && isDbConnected()) {
      let query = 'SELECT * FROM chat_logs';
      let countQuery = 'SELECT COUNT(*) FROM chat_logs';
      const params = [];

      if (onlyFlagged) {
        query += ' WHERE flagged = TRUE';
        countQuery += ' WHERE flagged = TRUE';
      }

      query += ' ORDER BY created_at DESC LIMIT $1 OFFSET $2';
      params.push(limit, offset);

      const [logs, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery)
      ]);

      return res.json({
        success: true,
        logs: logs.rows,
        pagination: {
          page,
          limit,
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(countResult.rows[0].count / limit)
        },
        source: 'postgresql'
      });
    }

    // In-Memory fallback
    const inMemoryLogs = getInMemoryLogs();
    let filteredLogs = onlyFlagged
      ? inMemoryLogs.filter(l => l.flagged)
      : inMemoryLogs;

    const total = filteredLogs.length;
    const paginatedLogs = filteredLogs
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
    const pool = getPool();
    if (pool && isDbConnected()) {
      const result = await pool.query(
        'SELECT * FROM chat_logs WHERE session_id = $1 ORDER BY created_at ASC',
        [sessionId]
      );
      return res.json({ success: true, logs: result.rows, count: result.rows.length });
    }

    const inMemoryLogs = getInMemoryLogs();
    const sessionLogs = inMemoryLogs
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
    const pool = getPool();
    if (pool && isDbConnected()) {
      const result = await pool.query(`
        SELECT
          COUNT(*) as total_conversations,
          COUNT(DISTINCT session_id) as unique_sessions,
          COUNT(CASE WHEN flagged THEN 1 END) as flagged_count,
          ROUND(AVG(response_time_ms)) as avg_response_time,
          MIN(created_at) as first_conversation,
          MAX(created_at) as last_conversation,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as last_7d,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as last_30d
        FROM chat_logs
      `);

      return res.json({ success: true, stats: result.rows[0], source: 'postgresql' });
    }

    // In-Memory fallback
    const logs = getInMemoryLogs();
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
    const pool = getPool();
    if (pool && isDbConnected()) {
      const result = await pool.query(
        'UPDATE chat_logs SET flagged = $1, flag_reason = $2 WHERE id = $3 RETURNING *',
        [!!flagged, reason || null, id]
      );

      if (result.rows.length === 0) {
        return sendError(res, 404, 'Chat log not found');
      }

      return res.json({ success: true, log: result.rows[0] });
    }

    // In-Memory fallback
    const logs = getInMemoryLogs();
    const logEntry = logs.find(l => l.id === id);
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
    let logs = [];

    const pool = getPool();
    if (pool && isDbConnected()) {
      const result = await pool.query(`
        SELECT created_at, session_id, user_message, ai_response, flagged, flag_reason, response_time_ms
        FROM chat_logs
        WHERE created_at BETWEEN $1 AND $2
        ORDER BY created_at DESC
        LIMIT $3
      `, [from || '1970-01-01', to || new Date().toISOString(), MAX_EXPORT_ROWS]);
      logs = result.rows;
    } else {
      const filterFrom = fromDate || new Date(0);
      const filterTo = toDate || new Date();
      logs = getInMemoryLogs()
        .filter(log => {
          const logDate = new Date(log.created_at);
          return logDate >= filterFrom && logDate <= filterTo;
        })
        .slice(0, MAX_EXPORT_ROWS);
    }

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
