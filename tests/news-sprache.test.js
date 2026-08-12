// Der Schluessel muss vor dem Import stehen: env.js liest ihn beim Laden.
process.env.PERPLEXITY_API_KEY = "test-perplexity-key";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

let app, getDailyNews, resetNewsCache, seedNewsCache, server, baseUrl;

const heute = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

const DE = [{ titel: "Modell erschienen", quelle: "heise", url: "https://heise.de/a", satz: "Kurz." }];
const EN = [{ titel: "Model released", quelle: "heise", url: "https://heise.de/a", satz: "Short." }];

beforeAll(async () => {
  ({ default: app } = await import("../src/app.js"));
  ({ getDailyNews, resetNewsCache, seedNewsCache } = await import("../src/services/news.js"));
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});
afterAll(() => {
  resetNewsCache?.();
  server?.close();
});

describe("Tagesmeldungen je Sprache", () => {
  it("haelt zwei getrennte Zwischenspeicher", async () => {
    resetNewsCache();
    seedNewsCache(heute(), DE, "de");
    seedNewsCache(heute(), EN, "en");

    expect((await getDailyNews("de")).items[0].titel).toBe("Modell erschienen");
    expect((await getDailyNews("en")).items[0].titel).toBe("Model released");
  });

  it("bleibt bei unbekannter oder fehlender Sprache auf Deutsch", async () => {
    resetNewsCache();
    seedNewsCache(heute(), DE, "de");
    seedNewsCache(heute(), EN, "en");

    expect((await getDailyNews("kl")).items[0].titel).toBe("Modell erschienen");
    expect((await getDailyNews()).items[0].titel).toBe("Modell erschienen");
  });

  it("liefert die Route je nach ?lang die passende Fassung", async () => {
    resetNewsCache();
    seedNewsCache(heute(), DE, "de");
    seedNewsCache(heute(), EN, "en");

    const de = await (await fetch(`${baseUrl}/api/news`)).json();
    const en = await (await fetch(`${baseUrl}/api/news?lang=en`)).json();
    expect(de.items[0].titel).toBe("Modell erschienen");
    expect(en.items[0].titel).toBe("Model released");
  });

  it("leert beide Sprachen zusammen", async () => {
    seedNewsCache(heute(), DE, "de");
    seedNewsCache(heute(), EN, "en");
    resetNewsCache();
    // Ohne Zwischenspeicher greift der echte Abruf - hier ohne Netz, also
    // ein Fehler. Genau das beweist, dass geleert wurde.
    await expect(getDailyNews("de")).rejects.toThrow();
    await expect(getDailyNews("en")).rejects.toThrow();
  });
});
