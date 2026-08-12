// ===================================================================
// DAILY AI NEWS - live via Perplexity, cached per calendar day
// ===================================================================
// Replaces the hardcoded NEWS_DATABASE rotation, whose entries were frozen
// at whatever the last deploy knew. Perplexity (sonar searches the web on
// every call) fetches today's items once; everyone else gets the cache.

import { PERPLEXITY_API_KEY, PERPLEXITY_MODEL, NEWS_DOMAINS, API_TIMEOUT } from "../config/env.js";
import { log } from "../utils/logger.js";

// One entry per calendar day (Europe/Berlin - the site's audience).
let cache = { dateKey: null, items: null, fetchedAt: null };
let inflight = null;

// sv-SE formats as YYYY-MM-DD
const berlinDay = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

const NEWS_PROMPT =
  "Was sind heute die 4 wichtigsten Nachrichten aus der Welt der KI " +
  "(neue Modelle, Regulierung, Forschung, bedeutende Produkte)? " +
  "Antworte AUSSCHLIESSLICH mit einem JSON-Array in dieser Form, ohne " +
  "Markdown und ohne Text davor oder danach: " +
  '[{"titel":"...","quelle":"Name des Mediums","url":"https://...","satz":"Eine Einordnung in einem Satz auf Deutsch."}]';

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
      typeof item.url === "string" && /^https?:\/\//.test(item.url)
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

async function fetchNewsFromPerplexity() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const body = {
      model: PERPLEXITY_MODEL,
      max_tokens: 1024,
      search_recency_filter: "day",
      messages: [{ role: "user", content: NEWS_PROMPT }]
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
export async function getDailyNews() {
  if (!PERPLEXITY_API_KEY) throw new Error("Perplexity API key not configured");

  const dateKey = berlinDay();
  if (cache.dateKey === dateKey && cache.items) {
    return { items: cache.items, date: dateKey, fetchedAt: cache.fetchedAt, stale: false };
  }

  // Dogpile guard: concurrent requests on a cold cache share one fetch
  if (!inflight) {
    inflight = fetchNewsFromPerplexity()
      .then((items) => {
        cache = { dateKey, items, fetchedAt: new Date().toISOString() };
        return items;
      })
      .finally(() => { inflight = null; });
  }

  try {
    const items = await inflight;
    return { items, date: dateKey, fetchedAt: cache.fetchedAt, stale: false };
  } catch (error) {
    if (cache.items) {
      log.warn(`Daily news refresh failed, serving stale items: ${error.message}`);
      return { items: cache.items, date: cache.dateKey, fetchedAt: cache.fetchedAt, stale: true };
    }
    throw error;
  }
}

// Test hooks
export function resetNewsCache() {
  cache = { dateKey: null, items: null, fetchedAt: null };
  inflight = null;
}

export function seedNewsCache(dateKey, items) {
  cache = { dateKey, items, fetchedAt: new Date().toISOString() };
  inflight = null;
}
