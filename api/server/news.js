
// server/news.js
// Production-grade RSS-based KI-Digest for DACH
// - Fetches and aggregates RSS/Atom feeds from trusted sources
// - Normalizes fields to {title, url, summary, date, source}
// - Caches results with TTL (NEWS_TTL_HOURS, default 24h)
// - Never throws: always returns a safe array

const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

const DEFAULT_TTL_MS = (parseInt(process.env.NEWS_TTL_HOURS, 10) || 24) * 60 * 60 * 1000;
const USER_AGENT = 'hohl.rocks-newsbot/1.0 (+https://hohl.rocks)';

const newsCache = { data: null, timestamp: 0 };

// Curated DACH feeds; can be overridden by NEWS_FEEDS_JSON (array or map)
const FEEDS = (() => {
  try {
    if (process.env.NEWS_FEEDS_JSON) return JSON.parse(process.env.NEWS_FEEDS_JSON);
  } catch {}
  const map = {
    'heise.de': ['https://www.heise.de/rss/heise-atom.xml'],
    'the-decoder.de': ['https://the-decoder.de/feed/'],
    'tagesschau.de': ['https://www.tagesschau.de/xml/rss2'],
    'zeit.de': ['https://newsfeed.zeit.de/digital'],
    'zdf.de': ['https://www.zdf.de/rss/zdf/nachrichten'],
    'srf.ch': ['https://www.srf.ch/news/bnf/rss'], // fallback general feed
    '20min.ch': ['https://www.20min.ch/rss/view/rss'] // fallback general feed
  };
  // Restrict to allowlist if NEWS_DOMAINS is set
  if (process.env.NEWS_DOMAINS) {
    const allow = process.env.NEWS_DOMAINS.split(',').map(s => s.trim()).filter(Boolean);
    const filtered = {};
    for (const d of allow) if (map[d]) filtered[d] = map[d];
    return Object.keys(filtered).length ? filtered : map;
  }
  return map;
})();

function parseRss(xml) {
  const j = parser.parse(xml);
  const out = [];
  // RSS 2.0
  if (j?.rss?.channel?.item) {
    const items = Array.isArray(j.rss.channel.item) ? j.rss.channel.item : [j.rss.channel.item];
    for (const it of items) {
      out.push({
        title: it.title || '',
        url: it.link || it.guid || '',
        summary: (it.description || it.summary || '').replace(/<[^>]+>/g, '').trim(),
        date: new Date(it.pubDate || it.updated || Date.now()).toISOString()
      });
    }
  }
  // Atom
  if (j?.feed?.entry) {
    const items = Array.isArray(j.feed.entry) ? j.feed.entry : [j.feed.entry];
    for (const it of items) {
      const link = Array.isArray(it.link) ? (it.link.find(l => l.rel === 'alternate')?.href || it.link[0]?.href) : (it.link?.href || it.id);
      out.push({
        title: it.title || '',
        url: link || '',
        summary: (it.summary?.['#text'] || it.summary || it.content?.['#text'] || it.content || '').toString().replace(/<[^>]+>/g, '').trim(),
        date: new Date(it.updated || it.published || Date.now()).toISOString()
      });
    }
  }
  return out;
}

async function fetchFeed(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const xml = await res.text();
    return parseRss(xml);
  } catch (err) {
    console.warn('[News] Feed fetch failed:', url, String(err.message || err));
    return [];
  }
}

async function getNews() {
  try {
    const now = Date.now();
    if (newsCache.data && (now - newsCache.timestamp) < DEFAULT_TTL_MS) {
      console.log('[News] Returning cached data');
      return newsCache.data;
    }
    console.log('[News] Fetching fresh news…');
    const tasks = [];
    for (const [domain, urls] of Object.entries(FEEDS)) {
      for (const u of urls) tasks.push(fetchFeed(u).then(items => items.map(it => ({ ...it, source: domain }))));
    }
    const settled = await Promise.allSettled(tasks);
    const all = [];
    for (const s of settled) if (s.status === 'fulfilled') all.push(...s.value);
    // normalize & sort
    const norm = all
      .filter(it => it.title && it.url)
      .map(it => ({
        title: String(it.title).trim(),
        url: String(it.url).replace(/^\/\//, 'https://'),
        summary: it.summary ? String(it.summary).slice(0, 240) : '',
        date: isNaN(new Date(it.date)) ? new Date().toISOString() : new Date(it.date).toISOString(),
        source: it.source || (new URL(it.url).hostname.replace(/^www\./,''))
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 30);

    newsCache.data = norm;
    newsCache.timestamp = now;
    return norm;
  } catch (err) {
    console.error('[News] Error getting news:', err);
    return newsCache.data || [];
  }
}

// periodic invalidation
setInterval(() => {
  newsCache.data = null;
  console.log('[News] Cache cleared');
}, DEFAULT_TTL_MS).unref?.();

module.exports = { getNews };
