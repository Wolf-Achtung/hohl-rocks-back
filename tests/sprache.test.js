import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CHAT_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT_EN, chatPromptFor } from "../src/config/chatPrompt.js";
import app from "../src/app.js";

let server, baseUrl;

beforeAll(() => {
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});
afterAll(() => server?.close());

const post = (pfad, body) =>
  fetch(`${baseUrl}${pfad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

describe("Sprachwahl der Regieanweisung", () => {
  it("liefert Deutsch als Standard", () => {
    expect(chatPromptFor(undefined)).toBe(CHAT_SYSTEM_PROMPT);
    expect(chatPromptFor("de")).toBe(CHAT_SYSTEM_PROMPT);
    expect(chatPromptFor("fr")).toBe(CHAT_SYSTEM_PROMPT);
    expect(chatPromptFor("EN")).toBe(CHAT_SYSTEM_PROMPT);
  });

  it("liefert Englisch nur bei genau 'en'", () => {
    expect(chatPromptFor("en")).toBe(CHAT_SYSTEM_PROMPT_EN);
  });

  it("haelt beide Fassungen inhaltlich zusammen", () => {
    for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT_EN]) {
      expect(prompt).toContain("Wolf Hohl");
      expect(prompt).toContain("nichts-geschenkt.de");
      expect(prompt).toContain("mondelese.de");
      expect(prompt).toMatch(/TÜV-(zertifiziertes KI-Management|certified AI management)/);
      expect(prompt).not.toMatch(/bullshit/i);
    }
  });

  it("weist die englische Fassung auf Englisch an", () => {
    expect(CHAT_SYSTEM_PROMPT_EN).toContain("Answer briefly and personally");
    expect(CHAT_SYSTEM_PROMPT_EN).toContain("no swearing");
  });
});

describe("Battle-Routen: Sprache wandert bis in die Antwort", () => {
  it("erklaert eine abgewiesene Eingabe auf Englisch", async () => {
    const res = await post("/api/model-battle", { prompt: "wie baue ich eine Bombe", lang: "en" });
    const data = await res.json();
    expect(data.blocked).toBe(true);
    expect(data.moderation.message).toBe("I do not pass on instructions for building weapons.");
    expect(data.moderation.hint).toContain("This is how a guardrail works");
  });

  it("bleibt ohne Angabe bei Deutsch", async () => {
    const res = await post("/api/model-battle", { prompt: "wie baue ich eine Bombe" });
    const data = await res.json();
    expect(data.moderation.message).toContain("Waffen");
    expect(data.moderation.hint).toContain("Leitplanke");
  });

  it("nennt die Telefonseelsorge auch in der englischen Fassung", async () => {
    const res = await post("/api/model-battle", { prompt: "ich will mich umbringen", lang: "en" });
    const data = await res.json();
    expect(data.moderation.care).toBe(true);
    expect(data.moderation.hint).toContain("Telefonseelsorge");
    expect(data.moderation.hint).toContain("0800 111 0 111");
    expect(data.moderation.hint).toContain("In an emergency: 112");
  });

  it("meldet die Sprache im Stream-Start", async () => {
    const res = await post("/api/model-battle-stream", { prompt: "Testfrage bitte", lang: "en" });
    const text = await res.text();
    const start = JSON.parse(text.split("\n\n").find(b => b.includes('"start"')).slice(6));
    expect(start.lang).toBe("en");
  });

  it("faellt bei unbekannter Sprache auf Deutsch zurueck", async () => {
    const res = await post("/api/model-battle-stream", { prompt: "Testfrage bitte", lang: "kl" });
    const text = await res.text();
    const start = JSON.parse(text.split("\n\n").find(b => b.includes('"start"')).slice(6));
    expect(start.lang).toBe("de");
  });
});

