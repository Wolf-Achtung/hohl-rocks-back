import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

const createMessage = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor() {
      this.messages = { create: createMessage };
    }
  }
}));

let server, baseUrl;

beforeAll(async () => {
  const { default: app } = await import("../src/app.js");
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(() => server?.close());

beforeEach(() => createMessage.mockReset());

const claudeSagt = (text) =>
  createMessage.mockResolvedValue({ content: [{ type: "text", text }], stop_reason: "end_turn" });

const post = (pfad, body) =>
  fetch(`${baseUrl}${pfad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

describe("/api/prompt-generator", () => {
  it("liefert die erkannten Styles", async () => {
    claudeSagt("EXECUTIVE\nStrategischer Prompt.\n\nTECHNICAL\nTechnischer Prompt.");

    const data = await (await post("/api/prompt-generator", { topic: "KI im Mittelstand" })).json();

    expect(data.success).toBe(true);
    expect(data.styles.executive).toBe("Strategischer Prompt.");
  });

  // Vorher: der Parser fand nichts, styles blieb {}, und die Route schickte
  // trotzdem HTTP 200 mit success:true. Der Aufrufer sah einen Erfolg ohne
  // ein einziges Ergebnis.
  it("meldet einen Fehler statt success:true mit leerem styles-Objekt", async () => {
    claudeSagt("Tut mir leid, dazu faellt mir nichts ein.");

    const res = await post("/api/prompt-generator", { topic: "KI im Mittelstand" });
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.styles).toBeUndefined();
  });
});

describe("/api/prompt-optimizer", () => {
  const vollstaendig =
    "SCORE: 8\nPROBLEMS:\n- Zu vage\nIMPROVED:\nEin praeziser Prompt.\nEXPLANATION:\nJetzt konkret.";

  it("gibt die Bewertung des Modells weiter", async () => {
    claudeSagt(vollstaendig);

    const data = await (await post("/api/prompt-optimizer", { prompt: "Schreib was" })).json();

    expect(data.success).toBe(true);
    expect(data.analysis.score).toBe(8);
    expect(data.analysis.improved).toBe("Ein praeziser Prompt.");
  });

  // Der Kern: die 5 war nie eine Bewertung, sondern der Parser, der nichts
  // gefunden hatte. Wer "5/10" liest, glaubt, sein Prompt sei bewertet worden.
  it("erfindet keinen Score von 5, wenn das Modell keinen genannt hat", async () => {
    claudeSagt("PROBLEMS:\n- Zu vage\nIMPROVED:\nEin praeziser Prompt.\nEXPLANATION:\nJetzt konkret.");

    const data = await (await post("/api/prompt-optimizer", { prompt: "Schreib was" })).json();

    expect(data.analysis.score).toBeNull();
    expect(data.analysis.score).not.toBe(5);
  });

  // Der optimierte Prompt ist das Produkt dieser Route. Fehlt er, war die
  // Antwort wertlos - vorher ging sie als success:true mit leerem Feld raus.
  it("meldet einen Fehler, wenn kein optimierter Prompt in der Antwort steht", async () => {
    claudeSagt("SCORE: 7\nPROBLEMS:\n- Zu vage");

    const res = await post("/api/prompt-optimizer", { prompt: "Schreib was" });
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
  });
});

describe("404-Antwort", () => {
  // Eine unvollstaendige Liste sagt dem Aufrufer, es gaebe die Route nicht.
  it("nennt auch klartext und model-battle-stream", async () => {
    const data = await (await fetch(`${baseUrl}/api/gibtesnicht`)).json();

    expect(data.availableRoutes).toContain("POST /api/klartext");
    expect(data.availableRoutes).toContain("POST /api/model-battle-stream");
  });
});

describe("/health", () => {
  // Stand vorher als feste 7 im Code - eine Zahl, die zu keiner
  // Zusammensetzung der Liste passte.
  it("meldet die tatsaechliche Anzahl der CORS-Herkuenfte", async () => {
    const { ALLOWED_ORIGINS } = await import("../src/config/env.js");
    const data = await (await fetch(`${baseUrl}/health`)).json();

    expect(data.environment.corsOrigins).toBe(ALLOWED_ORIGINS.length);
    expect(ALLOWED_ORIGINS).toContain("https://hohl.rocks");
  });
});
