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

// Drei Anlaeufe, ein JSON aus einer Modellantwort zu holen: roh, aus einem
// ```json-Block, aus dem ersten {...} im Text. Vorher standen die Anlaeufe
// zwei und drei ungesichert im catch des ersten - warf Anlauf zwei (etwa
// weil ein abgeschnittener Codeblock unvollstaendiges JSON enthielt), kam
// Anlauf drei nie dran, und der nackte SyntaxError landete beim Aufrufer.
// Jetzt scheitert jeder Anlauf fuer sich, und erst wenn alle drei daneben
// liegen, gibt es einen Fehler, der sagt was los war.
export function parseJsonFromModel(text, kontext = "Modellantwort") {
  const kandidaten = [
    text,
    text.match(/```json\s*\n([\s\S]+?)\n\s*```/)?.[1],
    text.match(/{[\s\S]+}/)?.[0]
  ];

  for (const kandidat of kandidaten) {
    if (!kandidat) continue;
    try {
      const parsed = JSON.parse(kandidat);
      // Ein nackter String oder eine Zahl ist gueltiges JSON, aber nicht das,
      // was die Aufrufer hier erwarten - sonst faellt der Fehler erst beim
      // Zugriff auf ein Feld auf.
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Naechster Anlauf. Der letzte Fehlschlag wirft unten.
    }
  }

  throw new Error(`Kein JSON-Objekt in ${kontext} gefunden (${text.length} Zeichen)`);
}

// Standardized error response - matches the shape most routes already use
// ({success, error, message, timestamp}), so every route now sends it
// consistently instead of some omitting `success`/`timestamp`.
export function sendError(res, status, error, message) {
  res.status(status).json({
    success: false,
    error,
    message,
    timestamp: new Date().toISOString()
  });
}
