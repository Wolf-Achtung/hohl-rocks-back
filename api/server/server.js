// api/server/server.js
/**
 * hohl.rocks Backend – v2.5
 * - Robust /api with SWR-style caches for /news and /tips
 * - SSE streaming for /run/stream
 * - Bubble-aware /run with special handlers (image, vision, audio, simple decision)
 * - Structured logging (morgan JSON), strict CORS, Helmet, compression
 *
 * Node >= 20 (global fetch)
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { completeText, streamText } from './share.llm.js';
import { TOP_PROMPTS } from './prompts.js';

const app = express();
const PORT = process.env.PORT || 8080;

// ---- Security & CORS --------------------------------------------------------
app.set('trust proxy', 1);
app.disable('x-powered-by');

const allowlist = new Set(
  String(process.env.CORS_ALLOWLIST || process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);
const corsOptions = {
  origin(origin, cb) {
    // Allow same-origin or no-origin (curl, healthchecks)
    if (!origin || allowlist.has(origin)) return cb(null, true);
    // Also allow subdomain variants of SITE_URL if configured
    const site = String(process.env.SITE_URL || '').replace(/\/+$/,''); 
    if (site && origin && (origin === site || origin.endsWith('.' + site.replace(/^https?:\/\//,'')))) {
      return cb(null, true);
    }
    return cb(new Error('CORS: origin not allowed'), false);
  },
  credentials: true
};

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.use(compression());

// Body parsing (images can be base64 in JSON payloads)
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// ---- Logging (JSON) ---------------------------------------------------------
morgan.token('unix', () => Date.now());
morgan.token('len', (req, res) => res.getHeader('content-length') || 0);
app.use(morgan((tokens, req, res) => {
  const j = {
    time: new Date().toISOString(),
    ts: Number(tokens.unix(req, res)),
    app: 'hohl.rocks-back',
    level: 'info',
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: Number(tokens.status(req, res)),
    length: Number(tokens.len(req, res) || 0),
    duration_ms: Number(tokens['response-time'](req, res))
  };
  return JSON.stringify(j);
}));

// ---- Helpers ----------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;

function ok(res, obj={}){ res.json({ ok: true, ...obj }); }
function err(res, code=500, message='error'){ res.status(code).json({ ok:false, error: message }); }

function bool(x){ return x === true || x === '1' || x === 'true'; }

function parseBubbleEnvelope(input){
  // Header: [Bubble <id> | ISO | ...]\n{ json payload }
  const m = input.match(/^\s*\[Bubble\s+(\d+)[^\]]*\]\s*([\s\S]*)$/i);
  if (!m) return null;
  const id = Number(m[1]);
  let payload = {};
  try{
    const tail = m[2] || '';
    const jstart = tail.indexOf('{');
    if (jstart >= 0){
      const jsonStr = tail.slice(jstart);
      const obj = JSON.parse(jsonStr);
      payload = (obj && obj.payload) ? obj.payload : obj;
    }
  } catch{}
  return { id, payload, header: m[0] };
}

function payloadToText(basePrompt, payload={}){
  // Replace [KEY] placeholders; if a File-like object with {name,type,data}, render meta only.
  let out = String(basePrompt || '');
  const keys = Object.keys(payload);
  for (const k of keys){
    const v = payload[k];
    if (v && typeof v === 'object' && 'data' in v){
      out = out.replaceAll(`[${k}]`, `(Datei: ${v.name || 'ohne Namen'}, Typ: ${v.type || 'unbekannt'})`);
    } else {
      out = out.replaceAll(`[${k}]`, String(v ?? ''));
    }
  }
  // If prompt ends with ':' and there is at least one string key, append first string as continuation
  if (/\:\s*$/.test(out) && keys.length){
    const textKey = keys.find(k => typeof payload[k] === 'string' && payload[k]);
    if (textKey) out += String(payload[textKey]);
  }
  return out;
}

// ---- Caches -----------------------------------------------------------------
const newsCache = { items: [], fetched: 0 };
const tipsCache = { items: [], fetched: 0 };

// ---- External fetchers ------------------------------------------------------
async function fetchNews(){
  // Prefer Tavily if available; fall back to Perplexity style prompt search if needed
  const domains = String(process.env.NEWS_DOMAINS || '').split(',').map(s=>s.trim()).filter(Boolean);
  const allow = String(process.env.RESEARCH_ALLOW || '').split(',').map(s=>s.trim()).filter(Boolean);
  const block = String(process.env.RESEARCH_BLOCK || '').split(',').map(s=>s.trim()).filter(Boolean);

  const items = [];

  if (process.env.TAVILY_API_KEY){
    try{
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: 'Neueste Nachrichten zu Künstlicher Intelligenz in DACH (Deutschland, Österreich, Schweiz).',
          search_depth: 'advanced',
          time_range: 'month',
          include_domains: domains.length ? domains : undefined,
          max_results: 10
        })
      });
      const j = await r.json();
      const results = j?.results || j?.results?.results || [];
      for (const it of results){
        if (!it?.title || !it?.url) continue;
        const host = (new URL(it.url)).hostname.replace(/^www\./,'');
        if (block.includes(host)) continue;
        if (allow.length && !allow.some(a => host.endsWith(a))) continue;
        items.push({ title: it.title, url: it.url, source: host, summary: it.content?.slice?.(0, 220) || it.snippet || '' });
      }
      if (items.length) return items.slice(0, 10);
    } catch(e){ console.error('[news.tavily]', e?.message || e); }
  }

  // Fallback: empty list (UI can still load)
  return items;
}

async function fetchTips(){
  // Map TOP_PROMPTS -> minimal tip cards
  try{
    const items = TOP_PROMPTS.slice(0, 12).map(p => ({
      id: p.id,
      title: p.question,
      why: p.desc || 'Kurzer, alltagsnaher Tipp.',
      category: (p.tags && p.tags[0]) || 'Alltag'
    }));
    return items;
  } catch(e){
    console.error('[tips.fetch]', e?.message || e);
    return [];
  }
}

// ---- Routes -----------------------------------------------------------------
app.get('/healthz', (_req, res) => ok(res, { ts: Date.now() }));
app.get('/readyz', (_req, res) => ok(res, { ts: Date.now() }));

// GET /api/news[?prefetch=1]
app.get('/api/news', async (req, res) => {
  try{
    const prefetch = bool(req.query.prefetch);
    const stale = (Date.now() - newsCache.fetched) > DAY_MS;
    if (prefetch || stale){
      newsCache.items = await fetchNews();
      newsCache.fetched = Date.now();
    }
    res.json({ items: newsCache.items || [] });
  } catch(e){ console.error('[api.news]', e); err(res, 500, 'news_failed'); }
});

// GET /api/tips[?prefetch=1]
app.get('/api/tips', async (req, res) => {
  try{
    const prefetch = bool(req.query.prefetch);
    const stale = (Date.now() - tipsCache.fetched) > DAY_MS;
    if (prefetch || stale){
      tipsCache.items = await fetchTips();
      tipsCache.fetched = Date.now();
    }
    res.json({ items: tipsCache.items || [] });
  } catch(e){ console.error('[api.tips]', e); err(res, 500, 'tips_failed'); }
});

// Placeholder for daily rollup if needed
app.get('/api/daily', async (_req, res) => {
  res.json({ items: [] });
});

// POST /api/metrics
app.post('/api/metrics', (req, res) => {
  const { type, meta } = req.body || {};
  const entry = { time:new Date().toISOString(), event:'metrics', type: String(type||'') || 'unknown', meta: meta || {} };
  console.log(JSON.stringify({ level:'info', app:'hohl.rocks-back', ...entry }));
  ok(res);
});

// POST /api/run
app.post('/api/run', async (req, res) => {
  try{
    const raw = String(req.body?.input || '').trim();
    const euOnly = bool(req.query.eu);
    if (!raw) return err(res, 400, 'missing_input');

    const bubble = parseBubbleEnvelope(raw);
    if (bubble){
      const { id, payload } = bubble;

      // Bubble 18: Bild generieren (Replicate Flux)
      if (id === 18){
        const text = payloadToText(payload?.BESCHREIBUNG || payload?.text || '', {});
        if (!text) return err(res, 400, 'missing_description');
        const out = await generateImageViaReplicate(text);
        return ok(res, { result: out ? `__HTML__<img src="${out}" alt="AI‑Bild" style="max-width:100%;height:auto;border-radius:12px"/>` : 'Keine Antwort.' });
      }

      // Bubble 19: Bildanalyse (Replicate LLaVA)
      if (id === 19){
        const file = payload?.BILD;
        if (!file?.data) return err(res, 400, 'missing_image');
        const desc = await describeImageViaReplicate(file);
        return ok(res, { result: desc || 'Keine Antwort.' });
      }

      // Bubble 20: Entscheidung (Witz Ja/Nein)
      if (id === 20){
        const a = String(payload?.ANTWORT || '').trim().toLowerCase();
        if (['ja','yes','y','j'].includes(a)){
          const joke = await completeText('Erzähle einen sehr kurzen, freundlichen Witz über KI in 1–2 Sätzen. Kein Zynismus.');
          return ok(res, { result: joke || 'Keine Antwort.' });
        }
        return ok(res, { result: 'Alles klar – kein Witz. Sag Bescheid, wenn du es dir anders überlegst.' });
      }

      // Bubble 21: Musik generieren (Replicate MusicGen)
      if (id === 21){
        const text = payloadToText(payload?.BESCHREIBUNG || payload?.text || '', {});
        if (!text) return err(res, 400, 'missing_description');
        const audioUrl = await generateMusicViaReplicate(text);
        return ok(res, { result: audioUrl ? `__HTML__<audio controls src="${audioUrl}" style="width:100%"></audio>` : 'Keine Antwort.' });
      }

      // Default: Normaler Promptlauf über LLM
      const userPrompt = payloadToText(raw, payload || {});
      const text = await completeText(userPrompt, { euOnly });
      return ok(res, { result: text || '' });
    }

    // Kein Bubble-Header – direkter Prompt
    const text = await completeText(raw, { euOnly });
    ok(res, { result: text || '' });
  } catch(e){ console.error('[api.run]', e); err(res, 500, 'run_failed'); }
});

// GET /api/run/stream
app.get('/api/run/stream', async (req, res) => {
  try{
    const q = String(req.query.q || '').trim();
    const euOnly = bool(req.query.eu);
    if (!q) return err(res, 400, 'missing_input');

    res.writeHead(200, {
      'Content-Type':'text/event-stream',
      'Cache-Control':'no-cache, no-transform',
      'Connection':'keep-alive',
      'Access-Control-Allow-Origin':'*'
    });

    await streamText(q, { euOnly }, tok => {
      try{ res.write(`data: ${String(tok).replace(/\n/g, '\\n')}\n\n`); } catch {}
    });
    res.write('data: [DONE]\n\n'); res.end();
  } catch(e){
    console.error('[api.run.stream]', e);
    try{ res.write('data: [ERROR]\n\n'); res.end(); } catch {}
  }
});

// ---- Replicate helpers ------------------------------------------------------
async function generateImageViaReplicate(prompt){
  const token = process.env.REPLICATE_API_TOKEN;
  const version = process.env.REPLICATE_MODEL_VERSION || 'black-forest-labs/flux-1.1-pro';
  if (!token) return null;
  try{
    const r = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}`, 'Prefer':'wait' },
      body: JSON.stringify({ version, input: { prompt, guidance: 3 } })
    });
    const j = await r.json();
    const out = j?.output;
    if (Array.isArray(out)) return out[0];
    if (typeof out === 'string') return out;
  } catch(e){ console.error('[replicate.image]', e?.message || e); }
  return null;
}

async function describeImageViaReplicate(file){
  const token = process.env.REPLICATE_API_TOKEN;
  const version = process.env.REPLICATE_LLAVA_VERSION || 'liuhaotian/llava-13b';
  if (!token) return 'Kein Replicate‑Token konfiguriert.';
  try{
    const r = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}`, 'Prefer':'wait' },
      body: JSON.stringify({
        version,
        input: { image: file.data, prompt: 'Beschreibe das Bild prägnant auf Deutsch.' }
      })
    });
    const j = await r.json();
    const out = j?.output;
    if (typeof out === 'string') return out;
    if (Array.isArray(out)) return out.join('\n');
  } catch(e){ console.error('[replicate.llava]', e?.message || e); }
  return null;
}

async function generateMusicViaReplicate(prompt){
  const token = process.env.REPLICATE_API_TOKEN;
  const version = process.env.REPLICATE_MUSICGEN_VERSION || 'facebook/musicgen';
  if (!token) return null;
  try{
    const r = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}`, 'Prefer':'wait' },
      body: JSON.stringify({
        version,
        input: { prompt, duration: 12 }
      })
    });
    const j = await r.json();
    const out = j?.output;
    if (Array.isArray(out)) return out[0];
    if (typeof out === 'string') return out;
  } catch(e){ console.error('[replicate.music]', e?.message || e); }
  return null;
}

// ---- Alias /_api ------------------------------------------------------------
app.use('/_api', (req, _res, next) => { req.url = req.originalUrl.replace(/^\/_api/, '/api'); next(); }, app._router);

// ---- 404 --------------------------------------------------------------------
app.use((_req, res) => res.status(404).json({ ok:false, error:'not_found' }));

// ---- Start ------------------------------------------------------------------
app.listen(PORT, () => console.log(`[hohl.rocks-back] :${PORT}`));
