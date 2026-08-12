import { describe, it, expect } from "vitest";
import { CHAT_SYSTEM_PROMPT } from "../src/config/chatPrompt.js";

// Waechter fuer die Tonalitaet der Chat-Persona: Kraftausdruecke haben in
// der Regieanweisung nichts verloren - was dort steht, plappert das Modell
// nach. Ausserdem muss die Projektliste zur Startseite passen.
describe("Chat-Regieanweisung: Sprache und Inhalt", () => {
  it("enthaelt keine Kraftausdruecke oder derben Anglizismen", () => {
    const verboten = [/bullshit/i, /scheiß/i, /verdammt/i, /\bcrap\b/i, /\bfuck/i];
    for (const muster of verboten) {
      expect(CHAT_SYSTEM_PROMPT).not.toMatch(muster);
    }
  });

  it("nutzt die vereinbarte Zertifizierungs-Formulierung", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("TÜV-zertifiziertes KI-Management");
    expect(CHAT_SYSTEM_PROMPT).not.toContain("KI-Manager ");
    expect(CHAT_SYSTEM_PROMPT).not.toMatch(/KI-Manager\b/);
  });

  it("nennt die aktuelle Projektliste der Startseite", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("nichts-geschenkt.de");
    expect(CHAT_SYSTEM_PROMPT).toContain("mondelese.de");
    expect(CHAT_SYSTEM_PROMPT).not.toContain("nicht-anerkannt.info");
    expect(CHAT_SYSTEM_PROMPT).not.toContain("horoscop.one");
  });

  it("verankert die Sprachregel fuer Antworten", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("keine Kraftausdrücke");
  });
});
