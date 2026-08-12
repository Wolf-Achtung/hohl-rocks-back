import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

// Key must exist before import - env.js reads it at module load
process.env.PERPLEXITY_API_KEY = "test-perplexity-key";
process.env.NEWS_DOMAINS = "heise.de, the-decoder.de,, t3n.de";

let getDailyNews, parseNewsAnswer, resetNewsCache, seedNewsCache;

beforeAll(async () => {
  ({ getDailyNews, parseNewsAnswer, resetNewsCache, seedNewsCache } = await import("../src/services/news.js"));
});

beforeEach(() => resetNewsCache());
afterEach(() => vi.unstubAllGlobals());

const ITEMS = [
  { titel: "Neues Modell vorgestellt", quelle: "heise", url: "https://heise.de/a", satz: "Ein Satz." },
  { titel: "EU reguliert weiter", quelle: "t3n", url: "https://t3n.de/b", satz: "Noch ein Satz." }
];

function perplexityAnswer(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => ""
  };
}

describe("parseNewsAnswer", () => {
  it("parses a clean JSON array", () => {
    const items = parseNewsAnswer(JSON.stringify(ITEMS));
    expect(items).toHaveLength(2);
    expect(items[0].titel).toBe("Neues Modell vorgestellt");
  });

  it("digs the array out of a markdown fence", () => {
    const items = parseNewsAnswer("Hier die Meldungen:\n```json\n" + JSON.stringify(ITEMS) + "\n```");
    expect(items).toHaveLength(2);
  });

  it("drops items without title or with a non-http url", () => {
    const dirty = [...ITEMS, { titel: "", url: "https://x.de" }, { titel: "Ohne URL", url: "javascript:alert(1)" }];
    expect(parseNewsAnswer(JSON.stringify(dirty))).toHaveLength(2);
  });

  it("throws when nothing usable is in the answer", () => {
    expect(() => parseNewsAnswer("Leider keine Nachrichten gefunden.")).toThrow();
    expect(() => parseNewsAnswer("[]")).toThrow();
  });
});

describe("getDailyNews", () => {
  it("fetches once and serves the cache afterwards", async () => {
    const fetchMock = vi.fn(async () => perplexityAnswer(JSON.stringify(ITEMS)));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getDailyNews();
    const second = await getDailyNews();

    expect(first.items).toHaveLength(2);
    expect(first.stale).toBe(false);
    expect(second.items).toEqual(first.items);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes the cleaned domain list to Perplexity", async () => {
    const fetchMock = vi.fn(async () => perplexityAnswer(JSON.stringify(ITEMS)));
    vi.stubGlobal("fetch", fetchMock);

    await getDailyNews();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.search_domain_filter).toEqual(["heise.de", "the-decoder.de", "t3n.de"]);
    expect(body.search_recency_filter).toBe("day");
  });

  it("shares one fetch between concurrent cold-cache requests", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async () => { await gate; return perplexityAnswer(JSON.stringify(ITEMS)); });
    vi.stubGlobal("fetch", fetchMock);

    const both = Promise.all([getDailyNews(), getDailyNews()]);
    release();
    const [a, b] = await both;

    expect(a.items).toEqual(b.items);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves yesterday's items when today's refresh fails", async () => {
    seedNewsCache("2020-01-01", ITEMS); // stale date -> refresh is attempted
    const failing = vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom", json: async () => ({}) }));
    vi.stubGlobal("fetch", failing);

    const news = await getDailyNews();
    expect(news.stale).toBe(true);
    expect(news.items).toEqual(ITEMS);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("surfaces the error when there is no cache to fall back on", async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom", json: async () => ({}) }));
    vi.stubGlobal("fetch", failing);
    await expect(getDailyNews()).rejects.toThrow(/500/);
  });
});
