const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const router = express.Router();

// simple in-memory cache for 12 hours
const CACHE_MS = 12 * 60 * 60 * 1000;
let cache = { ts: 0, items: [] };

const DEFAULT_DOMAINS = (process.env.NEWS_DOMAINS || 'heise.de,zeit.de,srf.ch,tagesschau.de,the-decoder.de,zdf.de,20min.ch').split(',').map(s => s.trim());

async function tavilySearch(query, domains = DEFAULT_DOMAINS) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('missing_tavily_key');

  const body = {
    api_key: key,
    query,
    include_answer: false,
    max_results: 12,
    include_domains: domains
  };

  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`tavily_upstream: ${txt.slice(0, 200)}`);
  }

  const data = await r.json();
  const items = (data?.results || []).map(it => ({
    title: it.title?.trim() || it.url,
    url: it.url
  }));

  return items;
}

router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    if (now - cache.ts < CACHE_MS && cache.items.length) {
      return res.json({ ok: true, items: cache.items, cached: true });
    }
    const items = await tavilySearch('aktuelle Nachrichten zu KI, AI, LLM, Sicherheit, EU AI Act, DSGVO', DEFAULT_DOMAINS);
    cache = { ts: now, items };
    return res.json({ ok: true, items, cached: false });
  } catch (err) {
    console.error('news error', err?.message || err);
    return res.status(502).json({ ok: false, error: err.message || 'news_failed' });
  }
});

// Ticker helper provides one rotating item
async function getTicker() {
  // refresh cache if needed
  const now = Date.now();
  if (now - cache.ts > CACHE_MS || cache.items.length === 0) {
    try {
      const items = await tavilySearch('KI News heute', DEFAULT_DOMAINS);
      cache = { ts: now, items };
    } catch (e) {
      // ignore, keep old cache
    }
  }
  if (!cache.items.length) return { title: 'Heute neu – n/a', url: 'https://hohl.rocks' };
  const idx = Math.floor((now / (60 * 60 * 1000)) % cache.items.length);
  return cache.items[idx];
}

module.exports = { router, getTicker };