// api/server/news.js - OPTIMIERT v2.0
const { XMLParser } = require("fast-xml-parser");
const cache = require('./cache');

const TTL_HOURS = Number(process.env.NEWS_TTL_HOURS || "24");
const MIN_ITEMS = Number(process.env.NEWS_MIN_ITEMS || "5");
const CACHE_KEY = 'news:all';

const ALLOWED = (process.env.NEWS_DOMAINS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// ===== CONFIGURATION =====

function getEnvFeeds() {
  const raw = process.env.NEWS_FEEDS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const feeds = {};
    for (const [domain, arr] of Object.entries(parsed)) {
      if (Array.isArray(arr) && arr.length) {
        feeds[domain.toLowerCase()] = arr;
      }
    }
    console.log('[News] Loaded', Object.keys(feeds).length, 'feeds from ENV');
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

function pickFeeds(includeAll = false) {
  const fromEnv = getEnvFeeds();
  let feeds = fromEnv || DEFAULT_FEEDS;
  
  if (!includeAll && ALLOWED.length) {
    feeds = Object.fromEntries(
      Object.entries(feeds).filter(([d]) => ALLOWED.includes(d))
    );
  }
  
  console.log('[News] Using', Object.keys(feeds).length, 'feeds', includeAll ? '(all)' : '(filtered)');
  return feeds;
}

// ===== XML PARSER =====

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
  trimValues: true
});

// ===== FEED PROCESSING =====

function normalizeItem(domain, raw) {
  const title = (raw?.title && (raw.title.text || raw.title)) || "";
  const linkVal = raw?.link;
  
  const url = typeof linkVal === "string"
    ? linkVal
    : (Array.isArray(linkVal) 
        ? (linkVal[0]?.href || linkVal[0]) 
        : (raw?.guid?.text || ""));
  
  const desc = (raw?.description && (raw.description.text || raw.description)) || 
               (raw?.summary?.text || raw?.contentSnippet || raw?.content || "");
  
  const dateRaw = raw?.pubDate || raw?.published || raw?.updated || "";
  const date = dateRaw ? new Date(dateRaw).toISOString() : null;
  
  return { 
    title: String(title || "").trim(), 
    url: String(url || "").trim(), 
    summary: String(desc || "").replace(/<[^>]+>/g, "").trim().substring(0, 300),
    date, 
    source: domain 
  };
}

async function fetchFeed(domain, feedUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  
  try {
    console.log('[News] Fetching:', domain, feedUrl);
    
    const res = await fetch(feedUrl, { 
      signal: controller.signal, 
      headers: { 
        "User-Agent": "hohl.rocks-news/2.0",
        "Accept": "application/rss+xml, application/xml, text/xml"
      } 
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const text = await res.text();
    const data = xml.parse(text);
    const channel = data?.rss?.channel || data?.feed;
    const items = channel?.item || channel?.entry || [];
    const list = Array.isArray(items) ? items : (items ? [items] : []);
    
    const normalized = list
      .map((it) => normalizeItem(domain, it))
      .filter(x => x.title && x.url);
    
    console.log('[News] Got', normalized.length, 'items from', domain);
    
    return normalized;
  } catch (error) {
    console.error('[News] Error fetching', domain, ':', error.message);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function aggregateNews(feeds) {
  const tasks = [];
  
  for (const [domain, urls] of Object.entries(feeds)) {
    for (const url of urls) {
      tasks.push(fetchFeed(domain, url));
    }
  }
  
  console.log('[News] Fetching', tasks.length, 'feeds...');
  
  const results = await Promise.allSettled(tasks);
  const all = [];
  
  for (const r of results) {
    if (r.status === "fulfilled") {
      all.push(...r.value);
    } else {
      console.warn("[News] Feed error:", r.reason?.message || r.reason);
    }
  }
  
  // Sort by date (newest first)
  all.sort((a, b) => (b.date || "").localeCompare((a.date || "")));
  
  console.log('[News] Aggregated', all.length, 'total items');
  
  return all;
}

// ===== MAIN NEWS FUNCTION =====

async function getNews() {
  try {
    // Check cache first
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      console.log('[News] Returning cached data');
      return cached;
    }
    
    console.log('[News] Cache miss, fetching fresh data...');
    
    // Try with allowed domains first
    let items = await aggregateNews(pickFeeds(false));
    
    // If not enough items, try all feeds
    if (items.length < MIN_ITEMS) {
      console.warn(`[News] Only ${items.length} items with allowed domains; trying full curated set...`);
      items = await aggregateNews(pickFeeds(true));
    }
    
    // Take top 40 most recent
    const result = items.slice(0, 40);
    
    // Cache for TTL_HOURS
    const ttl = TTL_HOURS * 60 * 60 * 1000;
    cache.set(CACHE_KEY, result, ttl);
    
    console.log('[News] Cached', result.length, 'items for', TTL_HOURS, 'hours');
    
    return result;
  } catch (error) {
    console.error("[News] Error in getNews:", error);
    // Return empty array instead of throwing
    return [];
  }
}

// ===== ROUTE REGISTRATION =====

function registerNewsRoutes(app) {
  app.get("/api/news", async (req, res) => {
    try {
      const prefetch = req.query.prefetch === '1';
      
      if (prefetch) {
        // Prefetch: trigger cache update but don't wait
        getNews().catch(err => console.error('[News] Prefetch error:', err));
        return res.json({ 
          items: [],
          prefetch: true,
          message: 'News prefetch initiated'
        });
      }
      
      const items = await getNews();
      
      res.json({ 
        items,
        cached: cache.has(CACHE_KEY),
        count: items.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[News] API error:", error);
      res.status(500).json({ 
        error: "news_failed",
        message: error.message,
        items: []
      });
    }
  });
  
  // Clear cache endpoint (for manual refresh)
  app.post("/api/news/refresh", async (req, res) => {
    try {
      cache.del(CACHE_KEY);
      console.log('[News] Cache cleared manually');
      
      const items = await getNews();
      
      res.json({ 
        items,
        refreshed: true,
        count: items.length
      });
    } catch (error) {
      console.error("[News] Refresh error:", error);
      res.status(500).json({ 
        error: "refresh_failed",
        message: error.message
      });
    }
  });
}

// ===== EXPORTS =====

module.exports = registerNewsRoutes;
module.exports.registerNewsRoutes = registerNewsRoutes;
module.exports.getNews = getNews;
