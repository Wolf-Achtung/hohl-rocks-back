// api/server/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { completeText, streamText } = require('./share.llm.js');
const { TOP_PROMPTS } = require('./prompts.js');

const app = express();
const PORT = process.env.PORT || 8080;

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

// In-memory caches for news and tips.  Entries are refreshed based on TTL settings in hours.
const newsCache = { items: [], fetched: 0 };
const tipsCache = { items: [], fetched: 0 };

// Fetch latest news items.  In a production implementation this could call an external search API (e.g. Tavily) filtered
// by NEWS_DOMAINS.  Here we return an empty list by default to ensure the endpoint always resolves.
async function fetchNews() {
  try {
    // TODO: implement fetch from external provider using process.env.TAVILY_API_KEY and NEWS_DOMAINS
    return [];
  } catch (e) {
    console.error('[news] fetch failed', e);
    return [];
  }
}

// Fetch latest tips.  This could source from a curated database or summary service.  Defaults to empty.
async function fetchTips() {
  try {
    // TODO: implement fetch from external provider or file
    return [];
  } catch (e) {
    console.error('[tips] fetch failed', e);
    return [];
  }
}

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/readyz', (_req, res) => res.json({ ok: !!process.env.TAVILY_API_KEY }));

// ---------- Helpers for Bubble Prompts ----------
function parseBubbleEnvelope(input){
  // Format: [Bubble <id> | <iso>]\n{ "payload": {...}, "thread": [...] }
  const m = input.match(/^\[Bubble\s+(\d+)\s*\|[^\]]*\]\s*([\s\S]*)$/);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  let j = {}; try { j = JSON.parse(m[2] || '{}'); } catch { j = {}; }
  const payload = j.payload || {};
  const thread = Array.isArray(j.thread) ? j.thread : [];
  return { id, payload, thread };
}
function mergePrompt(tpl, payload){
  let out = String(tpl||'');
  const keys = Object.keys(payload||{});
  for (const k of keys){
    const v = payload[k];
    if (v && typeof v === 'object' && v.data){
      out = out.replaceAll(`[${k}]`, `(Datei: ${v.name||'ohne Namen'}, Typ: ${v.type||'unbekannt'})`);
    } else {
      out = out.replaceAll(`[${k}]`, String(v));
    }
  }
  if (/\:\s*$/.test(out) && keys.length){
    const textKey = keys.find(k => typeof payload[k] === 'string');
    if (textKey) out += payload[textKey];
  }
  return out;
}
function buildUserPromptFromBubble(envelope){
  const base = TOP_PROMPTS.find(p => String(p.id) === String(envelope.id));
  if (!base) return null;
  return mergePrompt(base.prompt, envelope.payload);
}

// ------------- NEWS/TIPS endpoints (unchanged skeleton, assume already present in your repo) -------------
// Serve curated news and tips.  Use stale‑while‑revalidate caching based on NEWS_TTL_HOURS and TIPS_TTL_HOURS environment
// variables (defaults to 24 hours).  If the cache is stale or empty, fetch fresh data; otherwise return cached content.
app.get('/api/news', async (req, res) => {
  const ttlHours = parseInt(process.env.NEWS_TTL_HOURS || '24', 10);
  if (!Array.isArray(newsCache.items) || (Date.now() - newsCache.fetched) > ttlHours * 3600 * 1000) {
    newsCache.items = await fetchNews();
    newsCache.fetched = Date.now();
  }
  res.json({ items: newsCache.items || [] });
});

app.get('/api/tips', async (req, res) => {
  const ttlHours = parseInt(process.env.TIPS_TTL_HOURS || '24', 10);
  if (!Array.isArray(tipsCache.items) || (Date.now() - tipsCache.fetched) > ttlHours * 3600 * 1000) {
    tipsCache.items = await fetchTips();
    tipsCache.fetched = Date.now();
  }
  res.json({ items: tipsCache.items || [] });
});

// Metrics endpoint captures simple usage events from the front‑end.  It logs the event type and attached metadata
// to stdout.  This can later be integrated with a real analytics pipeline.
app.post('/api/metrics', (req, res) => {
  try {
    const { type = 'unknown', ...meta } = req.body || {};
    console.log(JSON.stringify({ level: 'info', app: 'hohl.rocks-back', event: 'metrics', type, meta }));
    res.json({ ok: true });
  } catch (e) {
    console.error('[metrics]', e);
    res.status(500).json({ ok: false, error: 'metrics_failed' });
  }
});

// ------------- RUN: text + stream -------------
app.post('/api/run', async (req, res) => {
  try{
    const raw = (req.body?.input || '').toString().trim();
    const euOnly = String(req.query?.eu || req.body?.eu || process.env.EU_ONLY) === '1';
    const bubble = parseBubbleEnvelope(raw);
    const system = 'Du bist ein prägnanter, hilfreicher Assistent. Antworte auf Deutsch, kurz und konkret.';
    const userPrompt = bubble ? buildUserPromptFromBubble(bubble) : raw;
    if (!userPrompt) return res.status(400).json({ ok:false, error:'missing_input' });
    const text = await completeText(userPrompt, { system, euOnly });
    res.json({ ok:true, result:text });
  } catch(e){ console.error('[run]', e); res.status(500).json({ ok:false, error:'run_failed' }); }
});

app.get('/api/run/stream', async (req, res) => {
  try{
    const raw = (req.query?.q || '').toString().trim();
    const euOnly = String(req.query?.eu || process.env.EU_ONLY) === '1';
    const bubble = parseBubbleEnvelope(raw);
    const system = 'Du bist ein prägnanter, hilfreicher Assistent. Antworte auf Deutsch, kurz und konkret.';
    const userPrompt = bubble ? buildUserPromptFromBubble(bubble) : raw;
    if (!userPrompt){ res.writeHead(400); return res.end('missing q'); }

    res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':'*' });
    await streamText(userPrompt, { system, euOnly }, (tok)=> res.write(`data: ${tok}\n\n`));
    res.write('data: [DONE]\n\n'); res.end();
  } catch(e){ console.error('[run/stream]', e); try{ res.write('data: [ERROR]\n\n'); res.end(); } catch{} }
});

// Alias /_api
app.use('/_api', (req,res,next)=>{ req.url = req.originalUrl.replace(/^\/_api/, '/api'); next(); }, app._router);

// 404
app.use((_req,res)=> res.status(404).json({ ok:false, error:'not_found' }));

app.listen(PORT, ()=> console.log(`[hohl.rocks-back] :${PORT}`));
