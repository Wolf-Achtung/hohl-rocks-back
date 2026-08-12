// ===================================================================
// CHAT LOG - kurzlebig, nur im Arbeitsspeicher
// ===================================================================
// Es gab hier einmal eine PostgreSQL-Anbindung. Sie hat nie getragen (der
// private Railway-Hostname loeste nie auf), und ihr einziger Zweck war ein
// Gespraechsarchiv, das niemand gelesen hat - erkauft mit gespeicherten
// IP-Adressen und den DSGVO-Pflichten, die daran haengen. Bewusst
// abgeschafft: Gespraeche leben jetzt nur in diesem Prozess, gedeckelt und
// beim naechsten Neustart fort.
//
// Ohne Personenbezug: weder IP noch User-Agent werden erfasst. Bleibt die
// Sitzungskennung, damit die Selbstauskunft unter /api/my-data waehrend
// einer Sitzung funktioniert.

import { MAX_MEMORY_LOGS } from "./env.js";
import { log } from "../utils/logger.js";

const chatLogs = [];

export function logConversation({ sessionId, userMessage, aiResponse, model, flagged, flagReason, responseTimeMs }) {
  chatLogs.push({
    id: crypto.randomUUID(),
    session_id: sessionId,
    user_message: userMessage,
    ai_response: aiResponse,
    model,
    flagged: flagged || false,
    flag_reason: flagReason,
    response_time_ms: responseTimeMs,
    created_at: new Date().toISOString()
  });

  // FIFO: der Speicher waechst nicht ueber MAX_MEMORY_LOGS hinaus
  while (chatLogs.length > MAX_MEMORY_LOGS) {
    chatLogs.shift();
  }
}

export function getChatLogs() {
  return chatLogs;
}

export function deleteSessionLogs(sessionId) {
  const before = chatLogs.length;
  const remaining = chatLogs.filter((entry) => entry.session_id !== sessionId);
  chatLogs.length = 0;
  chatLogs.push(...remaining);
  return before - chatLogs.length;
}

log.info(`Chat logging: in-memory only, max ${MAX_MEMORY_LOGS} entries, no persistence`);
