// ===================================================================
// ERROR HANDLERS
// ===================================================================

import { NODE_ENV } from "../config/env.js";
import { log } from "../utils/logger.js";

// 404 Handler
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: "Not found",
    message: `Route ${req.method} ${req.path} not found`,
    // Bei neuen Routen mitpflegen: eine 404 mit unvollstaendiger Liste sagt
    // dem Aufrufer, es gaebe die Route nicht.
    availableRoutes: [
      "GET /",
      "GET /health",
      "GET /healthz",
      "GET /readyz",
      "GET /api/self",
      "POST /api/chat",
      "POST /api/klartext",
      "POST /api/prompt-generator",
      "POST /api/prompt-optimizer",
      "GET /api/prompts",
      "GET /api/prompts/:id",
      "POST /api/model-battle",
      "POST /api/model-battle-stream",
      "GET /api/daily-challenge",
      "POST /api/submit-challenge",
      "GET /api/news",
      "GET /api/spark/today",
      "GET /api/my-data",
      "DELETE /api/my-data",
      "GET /api/admin/chat-logs (Auth)",
      "GET /api/admin/chat-stats (Auth)"
    ],
    timestamp: new Date().toISOString()
  });
}

// Global error handler
export function globalErrorHandler(error, req, res, _next) {
  log.error("Global Error Handler:", error.message);

  // CORS Error
  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({
      error: "CORS Error",
      message: "Origin not allowed",
      timestamp: new Date().toISOString()
    });
  }

  // JSON Parsing Error
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      error: "Invalid JSON",
      message: "Request body must be valid JSON",
      timestamp: new Date().toISOString()
    });
  }

  // Generic Error
  res.status(500).json({
    error: "Internal Server Error",
    message: NODE_ENV === "development" ? error.message : "An error occurred",
    timestamp: new Date().toISOString()
  });
}
