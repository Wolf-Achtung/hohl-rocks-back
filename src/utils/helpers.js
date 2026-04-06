// ===================================================================
// SHARED HELPERS
// ===================================================================

import { v4 as uuidv4 } from "uuid";

// Timeout wrapper for API calls
export function withTimeout(promise, timeoutMs, modelName) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${modelName} timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// Input sanitization - remove HTML/script tags
export function sanitizePrompt(prompt) {
  return prompt
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

// Cache header helpers
export function setCacheHeaders(res, maxAge = 300, staleWhileRevalidate = 600) {
  res.set({
    'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    'Vary': 'Accept-Encoding'
  });
}

export function setNoCacheHeaders(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache'
  });
}

// Session ID management
export function getSessionId(req, res) {
  let sessionId = req.cookies?.chat_session;
  if (!sessionId) {
    sessionId = uuidv4();
    res.cookie('chat_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
  }
  return sessionId;
}

// Standardized response helpers
export function sendSuccess(res, data, meta = {}) {
  res.json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  });
}

export function sendError(res, status, message, code = 'ERROR') {
  res.status(status).json({
    success: false,
    error: { code, message }
  });
}
