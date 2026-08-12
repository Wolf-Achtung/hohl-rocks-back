import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// The OpenAI client is built at import time, so the key must be set first and
// the SDK replaced before ../src/services/ai-clients.js is loaded.
process.env.OPENAI_API_KEY = "test-openai-key";

const createCompletion = vi.fn();

vi.mock("openai", () => ({
  default: class {
    constructor() {
      this.chat = { completions: { create: createCompletion } };
    }
  }
}));

let runModelBattle;

beforeAll(async () => {
  ({ runModelBattle } = await import("../src/services/ai-clients.js"));
});

beforeEach(() => {
  createCompletion.mockReset();
  // Perplexity and Gemini are irrelevant here; let their fetch fail fast.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("not under test"); }));
});

describe("GPT in the Model Battle", () => {
  it("asks for enough tokens that reasoning cannot eat the whole answer", async () => {
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: "GPT sagt hallo" }, finish_reason: "stop" }]
    });

    const gpt = (await runModelBattle("Testfrage")).find(r => r.model === "gpt");

    expect(gpt.success).toBe(true);
    expect(gpt.response).toBe("GPT sagt hallo");

    const params = createCompletion.mock.calls[0][0];
    expect(params.max_tokens).toBeUndefined(); // 400s on the GPT-5 family
    expect(params.max_completion_tokens).toBeGreaterThanOrEqual(4096);
    // default reasoning made battle answers take ~25s
    expect(params.reasoning_effort).toBe("low");
    // shared stage direction keeps all four answers short and comparable
    expect(params.messages[0].role).toBe("system");
    expect(params.messages[0].content).toMatch(/150 Wörtern/);
  });

  it("reports an empty completion as a failure instead of a silent success", async () => {
    // What the live site returned: HTTP 200 after ~10s, reasoning tokens had
    // consumed the entire budget, content came back empty.
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: "" }, finish_reason: "length" }]
    });

    const gpt = (await runModelBattle("Testfrage")).find(r => r.model === "gpt");

    expect(gpt.success).toBe(false);
    expect(gpt.response).toBeNull();
    expect(gpt.error).toBe("Keine Antwort erzeugt");
  });

  it("survives a completion with no choices at all", async () => {
    createCompletion.mockResolvedValue({ choices: [] });

    const gpt = (await runModelBattle("Testfrage")).find(r => r.model === "gpt");
    expect(gpt.success).toBe(false);
    expect(gpt.error).toBe("Keine Antwort erzeugt");
  });

  it("passes an API rejection through as a readable reason", async () => {
    createCompletion.mockRejectedValue(
      Object.assign(new Error("Incorrect API key provided"), { status: 401 })
    );

    const gpt = (await runModelBattle("Testfrage")).find(r => r.model === "gpt");
    expect(gpt.error).toBe("API-Key ungültig");
  });
});
