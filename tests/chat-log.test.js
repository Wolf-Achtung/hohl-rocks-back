import { describe, it, expect, beforeAll } from "vitest";
import { MAX_MEMORY_LOGS } from "../src/config/env.js";

let logConversation, getChatLogs, deleteSessionLogs;

beforeAll(async () => {
  ({ logConversation, getChatLogs, deleteSessionLogs } = await import("../src/config/chatLog.js"));
});

function write(sessionId, message, extra = {}) {
  logConversation({
    sessionId,
    userMessage: message,
    aiResponse: "Antwort",
    model: "claude",
    responseTimeMs: 120,
    ...extra
  });
}

describe("Chat-Protokoll im Arbeitsspeicher", () => {
  it("hält ein Gespräch fest", () => {
    write("sitzung-a", "Was ist der EU AI Act?");
    const entry = getChatLogs().find((l) => l.session_id === "sitzung-a");
    expect(entry.user_message).toBe("Was ist der EU AI Act?");
    expect(entry.ai_response).toBe("Antwort");
    expect(entry.created_at).toBeTruthy();
  });

  // Der Kern der Entscheidung: ohne Personenbezug gibt es nichts, was
  // aufbewahrt, ausgekunftet oder gelöscht werden müsste.
  it("speichert weder IP-Adresse noch Browser-Kennung", () => {
    write("sitzung-b", "Hallo");
    for (const entry of getChatLogs()) {
      expect(entry.ip_address).toBeUndefined();
      expect(entry.user_agent).toBeUndefined();
    }
  });

  it("trennt Sitzungen für die Selbstauskunft", () => {
    write("sitzung-c", "eins");
    write("sitzung-c", "zwei");
    write("sitzung-d", "fremd");
    expect(getChatLogs().filter((l) => l.session_id === "sitzung-c")).toHaveLength(2);
  });

  it("löscht auf Wunsch nur die eigene Sitzung", () => {
    const fremdVorher = getChatLogs().filter((l) => l.session_id === "sitzung-d").length;
    const geloescht = deleteSessionLogs("sitzung-c");
    expect(geloescht).toBe(2);
    expect(getChatLogs().some((l) => l.session_id === "sitzung-c")).toBe(false);
    expect(getChatLogs().filter((l) => l.session_id === "sitzung-d")).toHaveLength(fremdVorher);
  });

  it("meldet 0, wenn zu einer Sitzung nichts vorliegt", () => {
    expect(deleteSessionLogs("gibt-es-nicht")).toBe(0);
  });

  it("wächst nicht über die Obergrenze hinaus", () => {
    for (let i = 0; i < MAX_MEMORY_LOGS + 50; i++) write("flut", `Nachricht ${i}`);
    expect(getChatLogs().length).toBe(MAX_MEMORY_LOGS);
    // Die ältesten fallen zuerst heraus
    expect(getChatLogs()[getChatLogs().length - 1].user_message).toBe(`Nachricht ${MAX_MEMORY_LOGS + 49}`);
  });
});
