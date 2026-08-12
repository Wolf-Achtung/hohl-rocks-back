// ===================================================================
// DATABASE CONNECTION (PostgreSQL with graceful degradation)
// ===================================================================

import pg from "pg";
import { NODE_ENV, MAX_MEMORY_LOGS, DB_SSL_REJECT_UNAUTHORIZED } from "./env.js";
import { log } from "../utils/logger.js";

let pool = null;
let dbConnected = false;
// Why the fallback is active - surfaced by /health so a failed connection
// is diagnosable without digging through deploy logs.
let dbStatus = "not configured";

// In-memory fallback for chat logs
const inMemoryChatLogs = [];

function buildPool(ssl) {
  const candidate = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
  candidate.on('error', (err) => {
    log.error('Unexpected database pool error', err.message);
  });
  return candidate;
}

// Strip the credentials before any error text leaves this module - pg puts
// the connection string into some error messages.
function safeError(message) {
  return String(message || "unknown")
    .replace(/postgres(ql)?:\/\/[^\s]*/gi, "postgres://<redacted>")
    .slice(0, 200);
}

// One connection round: honor the configured TLS posture first, then retry
// without TLS if - and only if - the server refused SSL outright. Railway's
// private network speaks no TLS, and pg then fails with "The server does not
// support SSL connections" regardless of rejectUnauthorized. An unencrypted
// connection inside the private network beats chat logs and battle votes
// that vanish on every restart.
async function tryConnect() {
  const configuredSsl = NODE_ENV === 'production'
    ? { rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED }
    : false;

  const attempts = [{ ssl: configuredSsl, label: 'TLS' }];
  if (configuredSsl) attempts.push({ ssl: false, label: 'no TLS' });

  let lastError = "unknown";
  for (const attempt of attempts) {
    const candidate = buildPool(attempt.ssl);
    try {
      await candidate.query('SELECT NOW()');
      pool = candidate;
      dbConnected = true;
      dbStatus = `connected (${attempt.label})`;
      log.info(`PostgreSQL connected (${attempt.label})`);
      await initDatabase();
      startRetentionJob();
      return true;
    } catch (err) {
      await candidate.end().catch(() => {});
      lastError = safeError(err.message);
      if (attempt.ssl && /SSL|TLS|certificate/i.test(err.message)) {
        log.warn(`PostgreSQL TLS attempt failed (${lastError}), retrying without TLS`);
        continue;
      }
      break;
    }
  }
  dbStatus = `failed: ${lastError}`;
  return false;
}

// Railway's private network needs a moment after container start - a
// connection attempt fired at import time can hit DNS before the network
// is up, which is not a TLS problem and so was never retried. One shot at
// boot meant the in-memory fallback stuck for the whole process lifetime.
const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 30000];

async function connectDatabase() {
  if (await tryConnect()) return;

  for (const [index, delay] of RETRY_DELAYS_MS.entries()) {
    log.warn(`PostgreSQL unavailable (${dbStatus}), retry ${index + 1}/${RETRY_DELAYS_MS.length} in ${delay / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, delay).unref());
    if (await tryConnect()) return;
  }

  log.warn(`PostgreSQL connection failed after ${RETRY_DELAYS_MS.length + 1} attempts, using in-memory fallback: ${dbStatus}`);
}

if (process.env.DATABASE_URL) {
  dbStatus = "connecting";
  connectDatabase().catch((error) => {
    dbStatus = `failed: ${safeError(error.message)}`;
    log.warn('PostgreSQL setup failed, using in-memory fallback', safeError(error.message));
  });
} else {
  dbStatus = "DATABASE_URL not set";
  log.info('DATABASE_URL not set, using in-memory chat logging');
}

// Initialize database tables
async function initDatabase() {
  if (!pool) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(64) NOT NULL,
        user_message TEXT NOT NULL,
        ai_response TEXT,
        model VARCHAR(32) DEFAULT 'claude',
        ip_address VARCHAR(45),
        user_agent TEXT,
        flagged BOOLEAN DEFAULT FALSE,
        flag_reason VARCHAR(255),
        response_time_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_chat_logs_session ON chat_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs(created_at);
      CREATE TABLE IF NOT EXISTS battle_votes (
        id SERIAL PRIMARY KEY,
        model VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_battle_votes_model ON battle_votes(model);
    `);
    log.info('Database tables initialized');
  } catch (error) {
    log.error('Failed to initialize database tables', error.message);
  }
}

// ===================================================================
// GDPR RETENTION
// ===================================================================
// chat_logs store user messages, IP and user agent. The session cookie
// expires after 24h, after which the /api/my-data self-service can no
// longer reach those rows - so old logs must be deleted automatically.

const RETENTION_DAYS = Math.max(1, parseInt(process.env.CHAT_LOG_RETENTION_DAYS, 10) || 90);

async function deleteExpiredLogs() {
  if (!pool || !dbConnected) return;
  try {
    const result = await pool.query(
      'DELETE FROM chat_logs WHERE created_at < NOW() - make_interval(days => $1)',
      [RETENTION_DAYS]
    );
    if (result.rowCount > 0) {
      log.info(`Retention job: deleted ${result.rowCount} chat logs older than ${RETENTION_DAYS} days`);
    }
  } catch (error) {
    log.error('Retention job failed', error.message);
  }
}

function startRetentionJob() {
  deleteExpiredLogs();
  // unref() so the interval never keeps a shutting-down process alive
  setInterval(deleteExpiredLogs, 24 * 60 * 60 * 1000).unref();
  log.info(`Chat log retention active: ${RETENTION_DAYS} days`);
}

export function isDbConnected() {
  return dbConnected;
}

// Human-readable reason, for /health
export function getDbStatus() {
  return dbStatus;
}

export function getPool() {
  return pool;
}

export function getInMemoryLogs() {
  return inMemoryChatLogs;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    log.info('Database pool closed');
  }
}

// ===================================================================
// BATTLE VOTES (blind battle "which answer is best")
// ===================================================================
// Votes carry no personal data - just the model id and a timestamp - so
// unlike chat logs they are kept indefinitely: the running total is the
// point of the feature.

const inMemoryVotes = new Map();

export async function recordBattleVote(model) {
  if (pool && dbConnected) {
    await pool.query('INSERT INTO battle_votes (model) VALUES ($1)', [model]);
  } else {
    inMemoryVotes.set(model, (inMemoryVotes.get(model) || 0) + 1);
  }
}

// Returns { counts: {model: n, ...}, total }
export async function getBattleVotes() {
  if (pool && dbConnected) {
    const result = await pool.query(
      'SELECT model, COUNT(*)::int AS votes FROM battle_votes GROUP BY model'
    );
    const counts = {};
    let total = 0;
    for (const row of result.rows) {
      counts[row.model] = row.votes;
      total += row.votes;
    }
    return { counts, total };
  }
  const counts = Object.fromEntries(inMemoryVotes);
  const total = [...inMemoryVotes.values()].reduce((sum, n) => sum + n, 0);
  return { counts, total };
}

// Log a conversation to database or in-memory
export async function logConversation({ sessionId, userMessage, aiResponse, model, ipAddress, userAgent, flagged, flagReason, responseTimeMs }) {
  try {
    if (pool && dbConnected) {
      await pool.query(
        `INSERT INTO chat_logs (session_id, user_message, ai_response, model, ip_address, user_agent, flagged, flag_reason, response_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [sessionId, userMessage, aiResponse, model, ipAddress, userAgent, flagged, flagReason, responseTimeMs]
      );
    } else {
      // In-memory fallback
      inMemoryChatLogs.push({
        id: crypto.randomUUID(),
        session_id: sessionId,
        user_message: userMessage,
        ai_response: aiResponse,
        model,
        ip_address: ipAddress,
        user_agent: userAgent,
        flagged: flagged || false,
        flag_reason: flagReason,
        response_time_ms: responseTimeMs,
        created_at: new Date().toISOString()
      });

      // FIFO eviction
      if (inMemoryChatLogs.length > MAX_MEMORY_LOGS) {
        inMemoryChatLogs.shift();
      }
    }
  } catch (error) {
    log.error('Failed to log conversation', error.message);
  }
}
