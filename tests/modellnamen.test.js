import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Die Modell-IDs waren schon per ENV wechselbar, der Name ueber der Antwort
// nicht - er stand als Literal im Code. Ein Wechsel auf gemini-3.6-flash
// liess die Spalte weiter "Gemini 3.5 Flash" heissen. Ein Modellvergleich
// mit falschen Beschriftungen vergleicht nichts.
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.CLAUDE_MODEL = "claude-opus-5";
process.env.CLAUDE_MODEL_NAME = "Claude Opus 5";
delete process.env.OPENAI_API_KEY;
delete process.env.PERPLEXITY_API_KEY;
delete process.env.GEMINI_API_KEY;

const createMessage = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor() {
      this.messages = { create: createMessage };
    }
  }
}));

let runModelBattle;

beforeAll(async () => {
  ({ runModelBattle } = await import("../src/services/ai-clients.js"));
});

beforeEach(() => {
  createMessage.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("nicht Gegenstand dieses Tests"); }));
});

describe("Anzeigename des Modells", () => {
  it("folgt der Konfiguration statt einem Literal im Code", async () => {
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: "Antwort" }],
      stop_reason: "end_turn"
    });

    const claude = (await runModelBattle("Testfrage")).find(r => r.model === "claude");

    expect(claude.name).toBe("Claude Opus 5");
    expect(claude.name).not.toBe("Claude Sonnet 5");
  });

  it("schickt auch die konfigurierte Modell-ID an den Anbieter", async () => {
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: "Antwort" }],
      stop_reason: "end_turn"
    });

    await runModelBattle("Testfrage");

    expect(createMessage.mock.calls[0][0].model).toBe("claude-opus-5");
  });

  it("nennt den Namen auch dann, wenn das Modell ausfaellt", async () => {
    createMessage.mockRejectedValue(new Error("Anbieter down"));

    const claude = (await runModelBattle("Testfrage")).find(r => r.model === "claude");

    expect(claude.success).toBe(false);
    expect(claude.name).toBe("Claude Opus 5");
  });

  it("behaelt den bisherigen Namen, wo keine Variable gesetzt ist", async () => {
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: "Antwort" }],
      stop_reason: "end_turn"
    });

    const namen = (await runModelBattle("Testfrage")).map(r => r.name);

    // Nur CLAUDE_MODEL_NAME ist oben gesetzt - die drei anderen fallen auf
    // ihren bisherigen Text zurueck. Ohne gesetzte Variable aendert sich also
    // nichts an dem, was der Besucher sieht.
    expect(namen).toContain("GPT-5 Mini");
    expect(namen).toContain("Perplexity Sonar Pro");
    expect(namen).toContain("Gemini 3.5 Flash");
  });
});
