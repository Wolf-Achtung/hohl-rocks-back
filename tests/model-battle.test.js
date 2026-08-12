import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

// Keys must exist before the module is imported - the clients are built at
// import time. Anthropic/OpenAI stay unset so the "not configured" branch is
// exercised without touching a real API.
process.env.PERPLEXITY_API_KEY = "test-perplexity-key";
process.env.GEMINI_API_KEY = "test-gemini-key";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

let describeBattleError, runModelBattle;

beforeAll(async () => {
  ({ describeBattleError, runModelBattle } = await import("../src/services/ai-clients.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("describeBattleError", () => {
  it("names a missing key instead of a generic outage", () => {
    expect(describeBattleError(new Error("Anthropic API key not configured")))
      .toBe("API-Key nicht hinterlegt");
  });

  it("maps an SDK 401 to an invalid key", () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    expect(describeBattleError(err)).toBe("API-Key ungültig");
  });

  it("maps an SDK 404 to a missing model", () => {
    const err = Object.assign(new Error("model not found"), { status: 404 });
    expect(describeBattleError(err)).toBe("Modell nicht verfügbar");
  });

  it("reads the status out of a fetch-based error message", () => {
    expect(describeBattleError(new Error("Gemini API error: 429 quota")))
      .toBe("Anfrage-Limit erreicht");
    expect(describeBattleError(new Error("Perplexity API error: 503 upstream")))
      .toBe("Anbieter-Störung");
  });

  it("recognises a timeout by name and by message", () => {
    expect(describeBattleError(Object.assign(new Error("aborted"), { name: "AbortError" })))
      .toBe("Zeitüberschreitung");
    expect(describeBattleError(new Error("Claude timeout after 60000ms")))
      .toBe("Zeitüberschreitung");
  });

  it("separates an empty answer from an outage", () => {
    expect(describeBattleError(new Error("Empty GPT response (finish_reason: length)")))
      .toBe("Keine Antwort erzeugt");
    expect(describeBattleError(new Error("Claude refused the request")))
      .toBe("Keine Antwort erzeugt");
  });

  it("falls back to the generic line for anything unrecognised", () => {
    expect(describeBattleError(new Error("socket hang up")))
      .toBe("Service vorübergehend nicht verfügbar");
  });
});

function stubFetch(handler) {
  vi.stubGlobal("fetch", vi.fn(async (url, init) => handler(String(url), init)));
}

function jsonResponse(body, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

describe("runModelBattle", () => {
  it("keeps working models and reports why the others dropped out", async () => {
    stubFetch((url) => {
      if (url.includes("perplexity")) {
        return jsonResponse({ choices: [{ message: { content: "Perplexity sagt hallo" } }] });
      }
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: "Gemini sagt hallo" }] } }]
      });
    });

    const results = await runModelBattle("Testfrage");
    const byModel = Object.fromEntries(results.map(r => [r.model, r]));

    expect(results).toHaveLength(4);
    expect(byModel.perplexity.success).toBe(true);
    expect(byModel.perplexity.response).toBe("Perplexity sagt hallo");
    expect(byModel.gemini.response).toBe("Gemini sagt hallo");

    // The two without keys must say so - this is the case the UI used to
    // render as a bare "Keine Antwort erhalten".
    expect(byModel.claude.success).toBe(false);
    expect(byModel.claude.error).toBe("API-Key nicht hinterlegt");
    expect(byModel.gpt.error).toBe("API-Key nicht hinterlegt");
  });

  it("joins multi-part Gemini answers instead of dropping all but the first", async () => {
    stubFetch(() => jsonResponse({
      candidates: [{ content: { parts: [{ text: "Teil eins. " }, { text: "Teil zwei." }] } }]
    }));

    const gemini = (await runModelBattle("Testfrage")).find(r => r.model === "gemini");
    expect(gemini.response).toBe("Teil eins. Teil zwei.");
  });

  it("treats an empty Gemini answer as a failure, not as an empty success", async () => {
    stubFetch(() => jsonResponse({
      candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }]
    }));

    const gemini = (await runModelBattle("Testfrage")).find(r => r.model === "gemini");
    expect(gemini.success).toBe(false);
    expect(gemini.response).toBeNull();
    expect(gemini.error).toBe("Keine Antwort erzeugt");
  });

  it("surfaces an HTTP error from a provider", async () => {
    stubFetch((url) =>
      url.includes("perplexity")
        ? jsonResponse({ error: "invalid key" }, 401)
        : jsonResponse({ candidates: [{ content: { parts: [{ text: "ok" }] } }] })
    );

    const perplexity = (await runModelBattle("Testfrage")).find(r => r.model === "perplexity");
    expect(perplexity.success).toBe(false);
    expect(perplexity.error).toBe("API-Key ungültig");
  });

  it("never rejects - every model yields a result object", async () => {
    stubFetch(() => { throw new Error("network down"); });

    const results = await runModelBattle("Testfrage");
    expect(results).toHaveLength(4);
    expect(results.every(r => r.model && r.name && typeof r.success === "boolean")).toBe(true);
    expect(results.every(r => r.success === false)).toBe(true);
    expect(results.every(r => typeof r.error === "string" && r.error.length > 0)).toBe(true);
  });
});
