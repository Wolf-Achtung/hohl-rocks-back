import fetch from 'node-fetch';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

// Simple memory cache
const cache = new Map();
const TTL = 12 * 60 * 60 * 1000; // 12h

const FALLBACK_SOURCES = [
  { title: "Tagesschau – Künstliche Intelligenz", url: "https://www.tagesschau.de/thema/kuenstliche_intelligenz" },
  { title: "heise online – KI", url: "https://www.heise.de/thema/Kuenstliche-Intelligenz" },
  { title: "ZEIT – Künstliche Intelligenz", url: "https://www.zeit.de/thema/kuenstliche-intelligenz" },
  { title: "SRF Wissen – KI", url: "https://www.srf.ch/wissen/kuenstliche-intelligenz" },
  { title: "The Decoder – KI News", url: "https://the-decoder.de/" }
];

function setCache(key, data) {
  cache.set(key, { t: Date.now(), data });
}
function getCache(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.t > TTL) { cache.delete(key); return null; }
  return v.data;
}

function domainsForRegion(region) {
  // prefer DE/AT/CH
  const base = ["tagesschau.de", "heise.de", "zeit.de", "srf.ch", "the-decoder.de", "spiegel.de", "faz.net", "sueddeutsche.de", "nzz.ch", "t3n.de"];
  return base;
}

export async function getNews({ region = 'de' } = {}) {
  const key = `news:${region}`;
  const hit = getCache(key);
  if (hit) return hit;

  try {
    if (!TAVILY_API_KEY) throw new Error('missing tavily key');
    const q = "Aktuelle Nachrichten Künstliche Intelligenz Deutschland Österreich Schweiz seriöse Quellen";
    const body = {
      api_key: TAVILY_API_KEY,
      query: q,
      search_depth: "advanced",
      include_answer: false,
      include_images: false,
      include_domains: domainsForRegion(region),
      max_results: 10
    };
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error(`tavily_http_${resp.status}`);
    const j = await resp.json();
    const items = (j.results || [])
      .map(r => ({ title: r.title, url: r.url }))
      .filter(x => x.title && x.url);
    const out = items.length ? items : FALLBACK_SOURCES;
    setCache(key, out);
    return out;
  } catch (e) {
    // fallback
    setCache(key, FALLBACK_SOURCES);
    return FALLBACK_SOURCES;
  }
}

export async function getDaily({ region = 'de' } = {}) {
  // rotate a subset of news
  const items = await getNews({ region });
  // pick first 6
  return items.slice(0, 6);
}
