// ===================================================================
// DATABASE CONNECTION (PostgreSQL with graceful degradation)
// ===================================================================

import pg from "pg";
import { NODE_ENV, MAX_MEMORY_LOGS, DB_SSL_REJECT_UNAUTHORIZED } from "./env.js";
import { log } from "../utils/logger.js";

let pool = null;
let dbConnected = false;

// In-memory fallback for chat logs
const inMemoryChatLogs = [];

if (process.env.DATABASE_URL) {
  try {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: NODE_ENV === 'production' ? { rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      log.error('Unexpected database pool error', err.message);
    });

    // Test connection
    pool.query('SELECT NOW()')
      .then(() => {
        dbConnected = true;
        log.info('PostgreSQL connected');
        initDatabase();
      })
      .catch(err => {
        log.warn('PostgreSQL connection failed, using in-memory fallback', err.message);
        pool = null;
      });
  } catch (error) {
    log.warn('PostgreSQL setup failed, using in-memory fallback', error.message);
  }
} else {
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
    `);
    log.info('Database tables initialized');
  } catch (error) {
    log.error('Failed to initialize database tables', error.message);
  }
}

export function isDbConnected() {
  return dbConnected;
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
