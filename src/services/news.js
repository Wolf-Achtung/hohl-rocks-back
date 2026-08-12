// ===================================================================
// DAILY AI NEWS - live via Perplexity, cached per calendar day
// ===================================================================
// Replaces the hardcoded NEWS_DATABASE rotation, whose entries were frozen
// at whatever the last deploy knew. Perplexity (sonar searches the web on
// every call) fetches today's items once; everyone else gets the cache.

import { PERPLEXITY_API_KEY, PERPLEXITY_MODEL, NEWS_DOMAINS, API_TIMEOUT } from "../config/env.js";
import { log } from "../utils/logger.js";

// Ein Eintrag je Kalendertag (Europe/Berlin - das Publikum der Seite)
// und je Sprache: die Seite unter /en/ bekommt dieselben Meldungen auf
// Englisch, also zwei Abrufe am Tag statt einem.
const leer = () => ({ dateKey: null, items: null, fetchedAt: null });
let caches = { de: leer(), en: leer() };
let inflights = { de: null, en: null };
const SPRACHEN = ["de", "en"];
const normSprache = (sprache) => (sprache === "en" ? "en" : "de");

// sv-SE formats as YYYY-MM-DD
const berlinDay = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

// Deliberately 2-5 instead of a fixed count: a fixed "give me 4" made the
// model pad thin days with meta lines like "keine weiteren Meldungen
// verifizierbar" - which then rendered as fake headlines on the site.
const NEWS_PROMPT_DE =
  "Suche die wichtigsten KI-Nachrichten der letzten 24 Stunden " +
  "(neue Modelle, Regulierung, Forschung, bedeutende Produkte). " +
  "Gib zwischen 2 und 5 Meldungen aus - aber NUR echte, belegbare Meldungen " +
  "mit konkreter Artikel-URL. Findest du nur zwei, gib nur zwei aus. " +
  "Erfinde nichts und schreibe keinerlei Meta-Hinweise wie 'keine weiteren " +
  "Nachrichten gefunden' - eine solche Zeile ist keine Meldung. " +
  "Antworte AUSSCHLIESSLICH mit einem JSON-Array in dieser Form, ohne " +
  "Markdown und ohne Text davor oder danach: " +
  '[{"titel":"...","quelle":"Name des Mediums","url":"https://...","satz":"Eine Einordnung in einem Satz auf Deutsch."}]';

// Gleiche Regeln, gleiche Feldnamen - nur die Sprache der Ausgabe wechselt.
// Die Feldnamen bleiben absichtlich deutsch: sie sind der Vertrag mit der
// Anzeige, nicht Text fuer den Leser.
const NEWS_PROMPT_EN =
  "Find the most important AI news of the last 24 hours " +
  "(new models, regulation, research, significant products). " +
  "Return between 2 and 5 items - but ONLY real, verifiable items with a " +
  "concrete article URL. If you find only two, return only two. " +
  "Invent nothing and write no meta notes such as 'no further news found' " +
  "- a line like that is not an item. " +
  "Answer ONLY with a JSON array in this form, without markdown and " +
  "without any text before or after: " +
  '[{"titel":"...","quelle":"name of the outlet","url":"https://...","satz":"One sentence of context in English."}]';

// Belt and braces against exactly the padding the prompt forbids: lines
// that talk about the search instead of reporting news.
const META_ITEM = /suchtreffer|suchergebnis|nicht verifizier|nicht seri|keine (weiteren|belastbaren|aktuellen)|liegen keine|keine meldung|top-4|vollständige liste|no (further|additional|more) (news|items|results)|nothing further|search results?$/i;

// Pulls the first JSON array out of the answer - models occasionally wrap
// JSON in a code fence no matter how firmly told not to.
export function parseNewsAnswer(answer) {
  const match = String(answer).match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array in news answer");
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("News answer is not an array");
  const items = parsed
    .filter((item) =>
      item && typeof item.titel === "string" && item.titel.trim() &&
      typeof item.url === "string" && /^https?:\/\//.test(item.url) &&
      !META_ITEM.test(item.titel) && !META_ITEM.test(item.satz || "")
    )
    .slice(0, 5)
    .map((item) => ({
      titel: item.titel.trim(),
      quelle: typeof item.quelle === "string" ? item.quelle.trim() : "",
      url: item.url,
      satz: typeof item.satz === "string" ? item.satz.trim() : ""
    }));
  if (items.length === 0) throw new Error("News answer contained no usable items");
  return items;
}

async function fetchNewsFromPerplexity(sprache) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const body = {
      model: PERPLEXITY_MODEL,
      max_tokens: 1024,
      search_recency_filter: "day",
      messages: [{ role: "user", content: sprache === "en" ? NEWS_PROMPT_EN : NEWS_PROMPT_DE }]
    };
    // Perplexity caps the domain filter at 10 entries
    if (NEWS_DOMAINS.length > 0) {
      body.search_domain_filter = NEWS_DOMAINS.slice(0, 10);
    }

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Perplexity API error: ${response.status} ${errorBody.slice(0, 100)}`);
    }

    const data = await response.json();
    return parseNewsAnswer(data.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Returns { items, date, fetchedAt, stale } - stale means today's fetch
// failed and these are yesterday's cached items (better than nothing).
export async function getDailyNews(sprache = "de") {
  if (!PERPLEXITY_API_KEY) throw new Error("Perplexity API key not configured");

  const sp = normSprache(sprache);
  const dateKey = berlinDay();
  const cache = caches[sp];
  if (cache.dateKey === dateKey && cache.items) {
    return { items: cache.items, date: dateKey, fetchedAt: cache.fetchedAt, stale: false };
  }

  // Dogpile guard: concurrent requests on a cold cache share one fetch
  if (!inflights[sp]) {
    inflights[sp] = fetchNewsFromPerplexity(sp)
      .then((items) => {
        caches[sp] = { dateKey, items, fetchedAt: new Date().toISOString() };
        return items;
      })
      .finally(() => { inflights[sp] = null; });
  }

  try {
    const items = await inflights[sp];
    return { items, date: dateKey, fetchedAt: caches[sp].fetchedAt, stale: false };
  } catch (error) {
    const alt = caches[sp];
    if (alt.items) {
      log.warn(`Daily news refresh failed (${sp}), serving stale items: ${error.message}`);
      return { items: alt.items, date: alt.dateKey, fetchedAt: alt.fetchedAt, stale: true };
    }
    throw error;
  }
}

// Test hooks
export function resetNewsCache() {
  for (const sp of SPRACHEN) {
    caches[sp] = leer();
    inflights[sp] = null;
  }
}

export function seedNewsCache(dateKey, items, sprache = "de") {
  const sp = normSprache(sprache);
  caches[sp] = { dateKey, items, fetchedAt: new Date().toISOString() };
  inflights[sp] = null;
}
