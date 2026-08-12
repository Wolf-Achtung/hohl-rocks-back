import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

// Perplexity and Gemini get keys (their streams are mocked via fetch);
// Anthropic/OpenAI stay unset so their immediate-failure path is covered.
process.env.PERPLEXITY_API_KEY = "test-perplexity-key";
process.env.GEMINI_API_KEY = "test-gemini-key";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

let runModelBattleStream;

beforeAll(async () => {
  ({ runModelBattleStream } = await import("../src/services/ai-clients.js"));
});

afterEach(() => vi.unstubAllGlobals());

// Builds a fetch response whose body is a real ReadableStream of SSE lines
function sseResponse(lines) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    }
  });
  return { ok: true, status: 200, body, text: async () => "" };
}

const perplexityLines = [
  'data: {"choices":[{"delta":{"content":"Hallo "}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"Welt"}}]}\n\n',
  "data: [DONE]\n\n"
];

const geminiLines = [
  'data: {"candidates":[{"content":{"parts":[{"text":"Guten "}]}}]}\n\n',
  'data: {"candidates":[{"content":{"parts":[{"text":"Tag"}]},"finishReason":"STOP"}]}\n\n'
];

describe("runModelBattleStream", () => {
  it("emits deltas as they arrive and one result per model", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) =>
      String(url).includes("perplexity") ? sseResponse(perplexityLines) : sseResponse(geminiLines)
    ));

    const events = [];
    await runModelBattleStream("Testfrage", (e) => events.push(e));

    const results = events.filter((e) => e.type === "result");
    expect(results).toHaveLength(4);
    const byModel = Object.fromEntries(results.map((r) => [r.model, r]));

    // Streamed models: deltas in order, final text is their concatenation
    const perplexityDeltas = events.filter((e) => e.type === "delta" && e.model === "perplexity");
    expect(perplexityDeltas.map((d) => d.text)).toEqual(["Hallo ", "Welt"]);
    expect(byModel.perplexity.success).toBe(true);
    expect(byModel.perplexity.response).toBe("Hallo Welt");

    const geminiDeltas = events.filter((e) => e.type === "delta" && e.model === "gemini");
    expect(geminiDeltas.map((d) => d.text)).toEqual(["Guten ", "Tag"]);
    expect(byModel.gemini.response).toBe("Guten Tag");

    // Unconfigured models fail with the readable reason, no deltas
    expect(byModel.claude.success).toBe(false);
    expect(byModel.claude.error).toBe("API-Key nicht hinterlegt");
    expect(byModel.gpt.error).toBe("API-Key nicht hinterlegt");
    expect(events.some((e) => e.type === "delta" && (e.model === "claude" || e.model === "gpt"))).toBe(false);

    // every result arrives after that model's last delta
    const lastDeltaIdx = events.map((e, i) => (e.type === "delta" && e.model === "perplexity" ? i : -1)).filter((i) => i >= 0).pop();
    const resultIdx = events.findIndex((e) => e.type === "result" && e.model === "perplexity");
    expect(resultIdx).toBeGreaterThan(lastDeltaIdx);
  });

  it("turns an empty stream into a failure result", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) =>
      String(url).includes("perplexity")
        ? sseResponse(["data: [DONE]\n\n"])
        : sseResponse(geminiLines)
    ));

    const events = [];
    await runModelBattleStream("Testfrage", (e) => events.push(e));
    const perplexity = events.find((e) => e.type === "result" && e.model === "perplexity");
    expect(perplexity.success).toBe(false);
    expect(perplexity.error).toBe("Keine Antwort erzeugt");
  });

  it("relays an HTTP error from a streaming provider", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) =>
      String(url).includes("perplexity")
        ? { ok: false, status: 429, body: null, text: async () => "rate limited" }
        : sseResponse(geminiLines)
    ));

    const events = [];
    await runModelBattleStream("Testfrage", (e) => events.push(e));
    const perplexity = events.find((e) => e.type === "result" && e.model === "perplexity");
    expect(perplexity.error).toBe("Anfrage-Limit erreicht");
  });

  it("survives SSE payloads split across chunk boundaries", async () => {
    // one JSON line split into two enqueued chunks
    const whole = 'data: {"choices":[{"delta":{"content":"Zusammen"}}]}\n\n';
    const split = [whole.slice(0, 25), whole.slice(25), "data: [DONE]\n\n"];
    vi.stubGlobal("fetch", vi.fn(async (url) =>
      String(url).includes("perplexity") ? sseResponse(split) : sseResponse(geminiLines)
    ));

    const events = [];
    await runModelBattleStream("Testfrage", (e) => events.push(e));
    const perplexity = events.find((e) => e.type === "result" && e.model === "perplexity");
    expect(perplexity.success).toBe(true);
    expect(perplexity.response).toBe("Zusammen");
  });
});

describe("SSE route", () => {
  it("streams start, results and complete over HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      // let supertest-style local fetch through? not needed - route test uses app below
      return String(url).includes("perplexity") ? sseResponse(perplexityLines) : sseResponse(geminiLines);
    }));

    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const port = server.address().port;

    try {
      // Use http directly: global fetch is stubbed above
      const { request } = await import("node:http");
      const raw = await new Promise((resolve, reject) => {
        const req = request(
          { host: "127.0.0.1", port, path: "/api/model-battle-stream", method: "POST", headers: { "Content-Type": "application/json" } },
          (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toContain("text/event-stream");
            let buf = "";
            res.on("data", (chunk) => { buf += chunk; });
            res.on("end", () => resolve(buf));
          }
        );
        req.on("error", reject);
        req.end(JSON.stringify({ prompt: "Testfrage für den Stream" }));
      });

      const payloads = raw
        .split("\n\n")
        .filter((block) => block.startsWith("data: "))
        .map((block) => JSON.parse(block.slice(6)));

      expect(payloads[0].type).toBe("start");
      expect(payloads[0].models).toEqual(["claude", "gpt", "perplexity", "gemini"]);

      const results = payloads.filter((p) => p.type === "result");
      expect(results).toHaveLength(4);
      expect(results.find((r) => r.model === "perplexity").response).toBe("Hallo Welt");

      const complete = payloads[payloads.length - 1];
      expect(complete.type).toBe("complete");
      expect(complete.successfulModels).toBe(2);
    } finally {
      server.close();
    }
  });

  it("rejects an invalid prompt before starting a stream", async () => {
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const { request } = await import("node:http");
      const status = await new Promise((resolve, reject) => {
        const req = request(
          { host: "127.0.0.1", port, path: "/api/model-battle-stream", method: "POST", headers: { "Content-Type": "application/json" } },
          (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); }
        );
        req.on("error", reject);
        req.end(JSON.stringify({ prompt: "" }));
      });
      expect(status).toBe(400);
    } finally {
      server.close();
    }
  });
});
