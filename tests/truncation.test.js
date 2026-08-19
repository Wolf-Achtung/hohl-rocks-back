import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Keys vor dem Import setzen - die Clients entstehen beim Laden des Moduls.
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.PERPLEXITY_API_KEY = "test-perplexity-key";
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

const createMessage = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor() {
      this.messages = { create: createMessage };
    }
  }
}));

let runModelBattle, callClaude;

beforeAll(async () => {
  ({ runModelBattle, callClaude } = await import("../src/services/ai-clients.js"));
});

beforeEach(() => {
  createMessage.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("nicht Gegenstand dieses Tests"); }));
});

const claudeAntwort = (text, stop_reason) => ({
  content: [{ type: "text", text }],
  stop_reason
});

describe("Abgeschnittene Claude-Antworten", () => {
  // Der Weg, auf dem die Antwort danach geparst wird. Ein halbes JSON ist
  // unbrauchbar - vorher lief es in einen SyntaxError, aus dem niemand die
  // Ursache lesen konnte.
  it("meldet Truncation als Fehler, wenn der Aufrufer die Antwort weiterparst", async () => {
    createMessage.mockResolvedValue(claudeAntwort('{"theme":"Ana', "max_tokens"));

    await expect(callClaude("system", "user", 2000))
      .rejects.toThrow(/abgeschnitten.*max_tokens/);
  });

  it("laesst eine vollstaendige Antwort unveraendert durch", async () => {
    createMessage.mockResolvedValue(claudeAntwort('{"theme":"Analyse"}', "end_turn"));

    await expect(callClaude("system", "user", 2000)).resolves.toBe('{"theme":"Analyse"}');
  });

  // Im Vergleich ist eine fast fertige Antwort mehr wert als gar keine. Sie
  // bleibt stehen - aber der Grund steht jetzt im Log, statt spurlos zu
  // verschwinden.
  it("behaelt eine abgeschnittene Battle-Antwort und verwirft sie nicht", async () => {
    createMessage.mockResolvedValue(claudeAntwort("Der erste Punkt ist", "max_tokens"));

    const claude = (await runModelBattle("Testfrage")).find(r => r.model === "claude");

    expect(claude.success).toBe(true);
    expect(claude.response).toBe("Der erste Punkt ist");
  });
});

describe("Leere Perplexity-Antwort", () => {
  // Als einziger der vier Anbieter pruefte der nicht-streamende Perplexity-
  // Zweig nicht auf Leere. content:"" ging als success:true durch und stand
  // als leere Spalte im Vergleich.
  const perplexityLiefert = (choice) => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (!String(url).includes("perplexity")) throw new Error("nicht Gegenstand dieses Tests");
      return { ok: true, json: async () => ({ choices: [choice] }) };
    }));
  };

  it("wertet eine leere Antwort als Fehlschlag statt als Erfolg", async () => {
    perplexityLiefert({ message: { content: "" }, finish_reason: "length" });

    const pplx = (await runModelBattle("Testfrage")).find(r => r.model === "perplexity");

    expect(pplx.success).toBe(false);
    expect(pplx.response).toBeNull();
  });

  // Der Leitplanken-Test misst, ob ein Modell ein Codewort verschweigt.
  // guardHeld("") liefert true - eine leere Antwort haette den Test also
  // "bestanden", ohne dass je ein Modell geantwortet hat.
  it("zaehlt eine leere Antwort im Leitplanken-Modus nicht als bestanden", async () => {
    perplexityLiefert({ message: { content: "" }, finish_reason: "stop" });

    const pplx = (await runModelBattle("Testfrage", "guard")).find(r => r.model === "perplexity");

    expect(pplx.success).toBe(false);
    expect(pplx.guard).toBeUndefined();
  });

  it("kommt mit einer Antwort ohne choices-Array zurecht", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (!String(url).includes("perplexity")) throw new Error("nicht Gegenstand dieses Tests");
      return { ok: true, json: async () => ({}) };
    }));

    const pplx = (await runModelBattle("Testfrage")).find(r => r.model === "perplexity");

    expect(pplx.success).toBe(false);
    // Kein TypeError, sondern die benannte Ursache
    expect(pplx.error).toBe("Keine Antwort erzeugt");
  });

  it("laesst eine gefuellte Antwort weiterhin durch", async () => {
    perplexityLiefert({ message: { content: "Laut Studie [1] steigt der Anteil." }, finish_reason: "stop" });

    const pplx = (await runModelBattle("Testfrage")).find(r => r.model === "perplexity");

    expect(pplx.success).toBe(true);
    expect(pplx.response).toBe("Laut Studie steigt der Anteil."); // Zitatmarker entfernt
  });
});
