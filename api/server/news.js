// api/server/news.js v2
import { XMLParser } from "fast-xml-parser";

const TTL_HOURS = Number(process.env.NEWS_TTL_HOURS || "24");
const MIN_ITEMS = Number(process.env.NEWS_MIN_ITEMS || "5");

const ALLOWED = (process.env.NEWS_DOMAINS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

function getEnvFeeds() {
  const raw = process.env.NEWS_FEEDS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const feeds = {};
    for (const [domain, arr] of Object.entries(parsed)) {
      if (Array.isArray(arr) && arr.length) feeds[domain.toLowerCase()] = arr;
    }
    return feeds;
  } catch (e) {
    console.error("[News] Invalid NEWS_FEEDS_JSON:", e.message);
    return null;
  }
}

const DEFAULT_FEEDS = {
  "the-decoder.de": ["https://the-decoder.de/feed/"],
  "heise.de": ["https://www.heise.de/rss/heise-atom.xml"],
  "golem.de": ["https://rss.golem.de/rss.php?feed=RSS2.0"],
  "t3n.de": ["https://t3n.de/rss.xml"],
  "therundown.ai": ["https://rss.beehiiv.com/feeds/2R3C6Bt5wj.xml"],
  "towardsdatascience.com": ["https://towardsdatascience.com/feed"],
  "promptengineeringdaily.com": ["https://promptengineeringdaily.substack.com/feed"],
  "gptforwork.com": ["https://gptforwork.com/blog/rss.xml"]
};

function pickFeeds(includeAll=false) {
  const fromEnv = getEnvFeeds();
  let feeds = fromEnv || DEFAULT_FEEDS;
  if (!includeAll && ALLOWED.length) {
    feeds = Object.fromEntries(Object.entries(feeds).filter(([d]) => ALLOWED.includes(d)));
  }
  return feeds;
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
  trimValues: true
});

function normalizeItem(domain, raw) {
  const title = raw.title?.text || raw.title || "";
  const link = raw.link?.href || raw.link || raw.guid?.text || "";
  const url = typeof link === "string" ? link : (Array.isArray(raw.link) ? (raw.link[0]?.href || raw.link[0]) : "");
  const desc = raw.description?.text || raw.summary?.text || raw.contentSnippet || raw.content || "";
  const dateRaw = raw.pubDate || raw.published || raw.updated || "";
  const date = dateRaw ? new Date(dateRaw).toISOString() : null;
  return { title: String(title||"").trim(), url: String(url||"").trim(), summary: String(desc||"").replace(/<[^>]+>/g,"").trim(), date, source: domain };
}

async function fetchFeed(domain, feedUrl) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(feedUrl, { signal: ctl.signal, headers: { "User-Agent": "hohl.rocks-news/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const data = xml.parse(text);
    const channel = data.rss?.channel || data.feed;
    const items = channel?.item || channel?.entry || [];
    const list = Array.isArray(items) ? items : [items];
    return list.map((it) => normalizeItem(domain, it)).filter(x => x.title && x.url);
  } finally {
    clearTimeout(t);
  }
}

let CACHE = { at: 0, items: [] };

export function registerNewsRoutes(app) {
  app.get("/api/news", async (_req, res) => {
    try {
      const now = Date.now();
      const ttl = TTL_HOURS * 3600 * 1000;
      if (CACHE.at && (now - CACHE.at) < ttl && CACHE.items?.length) {
        return res.json({ items: CACHE.items, cached: true });
      }

      async function aggregate(feeds) {
        const tasks = [];
        for (const [domain, arr] of Object.entries(feeds)) for (const url of arr) tasks.push(fetchFeed(domain, url));
        const results = await Promise.allSettled(tasks);
        const all = [];
        for (const r of results) {
          if (r.status === "fulfilled") all.push(...r.value);
          else console.warn("[News] feed error:", r.reason?.message || r.reason);
        }
        all.sort((a,b) => (b.date||"").localeCompare((a.date||"")));
        return all;
      }

      // Pass 1: respect ALLOWED/DOMAINS
      let items = await aggregate(pickFeeds(false));

      // Fallback: if too few, try with full curated set (ignore ALLOWED)
      if(items.length < MIN_ITEMS){
        console.warn(`[News] Only ${items.length} items with allowed domains; trying full curated set…`);
        items = await aggregate(pickFeeds(true));
      }

      CACHE = { at: now, items: items.slice(0, 40) };
      res.json({ items: CACHE.items, cached: false });
    } catch (e) {
      console.error("[News] error:", e);
      res.status(500).json({ error: "news_failed" });
    }
  });
}
