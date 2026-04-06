// ===================================================================
// HOHL.ROCKS BACKEND - Entry Point
// Version: 2.8.0 - Modular Architecture
// ===================================================================

import app from "./src/app.js";
import { PORT, NODE_ENV, API_VERSION, MODEL } from "./src/config/env.js";
import { isDbConnected, closePool } from "./src/config/database.js";
import { validateApiKeys } from "./src/services/ai-clients.js";
import { FEATURED_PROMPTS } from "./src/data/prompts.js";
import { log } from "./src/utils/logger.js";

// ===================================================================
// STARTUP
// ===================================================================

const apiKeysValid = validateApiKeys();

if (!apiKeysValid && NODE_ENV === "production") {
  log.error("Cannot start server: API keys validation failed");
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    🚀 HOHL.ROCKS BACKEND                   ║
╠════════════════════════════════════════════════════════════╣
║  Version:          ${API_VERSION.padEnd(44)}║
║  Port:             ${PORT.toString().padEnd(44)}║
║  Environment:      ${NODE_ENV.padEnd(44)}║
║  Model:            ${MODEL.padEnd(44)}║
║  Prompts:          ${FEATURED_PROMPTS.length.toString().padEnd(44)}║
║  Architecture:     ${"Modular (src/)".padEnd(44)}║
╠════════════════════════════════════════════════════════════╣
║  CRITICAL FEATURES (Rate-Limited):                         ║
║    ⚡ Model Battle (10 req/min) - HAUPTFEATURE             ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    • POST /api/model-battle   ⚡ KRITISCH                  ║
║    • POST /api/chat           💬 Chat                      ║
║    • POST /api/prompt-generator                            ║
║    • POST /api/prompt-optimizer                            ║
║    • GET  /api/prompts                                     ║
║    • GET  /api/daily-challenge                             ║
║    • GET  /api/news                                        ║
║    • GET  /api/spark/today                                 ║
╚════════════════════════════════════════════════════════════╝
  `);

  log.info(`Server ready at http://localhost:${PORT}`);
  log.info(`Rate Limiting: Model Battle 10/min, Admin 30/min, GDPR 10/min`);
  log.info(`Database: ${isDbConnected() ? 'PostgreSQL connected' : 'In-memory fallback'}`);
});

// ===================================================================
// GRACEFUL SHUTDOWN
// ===================================================================

async function gracefulShutdown(signal) {
  log.warn(`${signal} received: shutting down gracefully`);
  server.close(async () => {
    log.info('HTTP server closed');
    try {
      await closePool();
    } catch (err) {
      log.error('Error closing database pool:', err.message);
    }
    process.exit(0);
  });
  // Force shutdown after 10s
  setTimeout(() => {
    log.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
