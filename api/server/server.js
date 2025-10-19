/**
 * hohl.rocks backend — v2.2
 * - Health: /healthz, /readyz
 * - API: /api/news, /api/daily, /api/run (JSON), /api/run/stream (SSE)
 * - Alias: router at /api and /_api
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { setTimeout as sleep } from 'timers/promises';

import { TOP_PROMPTS } from './prompts.js';
import { completeText } from './share.llm.js';

const app = express();
const PORT = process.env.PORT || 8080;

/* -------------------- Middleware -------------------- */
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    const allow = (process.env.CORS_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!origin) return cb(null, true);
    if (allow.length === 0) return cb(null, true);
    cb(null, allow.includes(origin));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));
app.use(compression());

/* -------------------- Health -------------------- */
app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.get('/readyz', (_req, res) => {
  const issues = [];
  if (!process.env.TAVILY_API_KEY) issues.push('TAVILY_API_KEY missing');
  res.json({ ok: issues.length === 0, issues });
});

/* -------------------- Helpers -------------------- */
const DEFAULT_DOMAINS = (process.env.NEWS_DOMAINS || 'heise.de,zeit.de,srf.ch,tagesschau.de,the-decoder.de,zdf.de,20min.ch')
  .split(',').map(s => s.trim()).filter(Boolean);

const CACHE_MS = 3 * 60 * 60 * 1000; // 3h
let newsCache = { ts: 0, key: '', items: [] };

async function tavilySearch(query, domains = DEFAULT_DOMAINS, maxResults = 10){
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const body = {
    api_key: key,
    query,
    search_depth: 'advanced',
    include_domains: domains,
    max_results: Math.min(Math.max(maxResults, 1), 20),
    topic: 'news',
    time_range: 'd',
    include_answer: false
  };
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`tavily_${r.status}`);
  const j = await r.json();
  const items = (j?.results || []).map(x => ({
    title: x.title || x.content || x.snippet || 'Ohne Titel',
    url: x.url
  })).filter(it => it.url);
  return items;
}

function dedupe(items){
  const seen = new Set();
  const out = [];
  for (const it of items){
    const key = new URL(it.url).hostname.replace(/^www\./,'') + '|' + (it.title||'').slice(0,80);
    if (!seen.has(key)){ seen.add(key); out.push(it); }
  }
  return out;
}

/* -------------------- API Router -------------------- */
const api = express.Router();

api.get('/news', async (req, res) => {
  try {
    const now = Date.now();
    const doms = (req.query.domains ? String(req.query.domains).split(',') : DEFAULT_DOMAINS);
    const cacheKey = doms.join(',') + '|DEKI';
    if (newsCache.items.length && now - newsCache.ts < CACHE_MS && newsCache.key === cacheKey){
      return res.json({ ok: true, items: newsCache.items, cached: true });
    }
    // German KI-relevant queries: Sicherheit + Praxis + Tool-Tipps
    const queries = [
      'KI Sicherheit Deutschland aktuelle Warnungen KI-Sicherheit Data Leakage Prompt Injection',
      'ChatGPT Tipps Tricks deutsch Praxis produktiver arbeiten Beispiele',
      'Claude Tipps Tricks deutsch Prompting Sicherheit',
      'Mistral KI Tipps deutsch Anleitungen Best Practices',
      'Llama KI Tipps deutsch Datenschutz Open-Source Modelle'
    ];
    let merged = [];
    for (const q of queries){
      try { merged = merged.concat(await tavilySearch(q, doms, 6)); } catch {}
    }
    const items = dedupe(merged).slice(0, 14);
    newsCache = { ts: now, key: cacheKey, items };
    res.json({ ok: true, items, cached: false });
  } catch (err) {
    console.error('[news] error', err);
    res.json({ ok: true, items: [] });
  }
});

api.get('/daily', async (_req, res) => {
  try {
    if (!newsCache.items?.length) {
      newsCache.items = await tavilySearch('KI Deutschland Tipps Tricks Sicherheit', DEFAULT_DOMAINS, 6);
      newsCache.ts = Date.now();
      newsCache.key = 'daily';
    }
    const picks = newsCache.items.slice(0, 6).map((it, i) => ({
      title: i === 0 ? 'Spotlight' : `Lesenswert ${i}`,
      url: it.url
    }));
    res.json({ ok: true, items: picks });
  } catch (err) {
    console.error('[daily] error', err);
    res.json({ ok: true, items: [] });
  }
});

api.get('/news/top', (_req, res) => {
  res.json({ ok: true, items: TOP_PROMPTS });
});

api.post('/run', async (req, res) => {
  try {
    const input = (req.body?.input || '').toString().trim();
    if (!input) return res.status(400).json({ ok: false, error: 'missing_input' });
    const system = 'Du bist ein prägnanter, hilfreicher Assistent. Antworte auf Deutsch, kurz und konkret.';
    const text = await completeText(input, { system });
    res.json({ ok: true, result: text });
  } catch (err) {
    console.error('[run] error', err);
    res.status(500).json({ ok: false, error: 'run_failed' });
  }
});

// SSE streaming endpoint (simulated chunking)
api.get('/run/stream', async (req, res) => {
  try {
    const input = (req.query?.q || '').toString().trim();
    if (!input) { res.writeHead(400); return res.end('missing q'); }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    const system = 'Du bist ein prägnanter, hilfreicher Assistent. Antworte auf Deutsch, kurz und konkret.';
    const text = await completeText(input, { system });
    // stream chunks by sentence
    const parts = text.split(/(?<=[.!?])\s+/);
    for (const p of parts){
      res.write(`data: ${p}\n\n`);
      await sleep(140);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[run/stream] error', err);
    try { res.write('data: [ERROR]\n\n'); res.end(); } catch {}
  }
});

app.use('/api', api);
app.use('/_api', api);

app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

app.listen(PORT, () => console.log(`[hohl.rocks-back] listening on :${PORT}`));
