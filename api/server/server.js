// api/server/server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { completeText, streamText } from './share.llm.js';
import { TOP_PROMPTS } from './prompts.js';
import { getNews } from './news.js';
import { getTips } from './tips.js';

// In‑memory caches for news and tips.  Each cache stores the items
// array and the timestamp when it was last refreshed.  These caches
// prevent expensive refreshes on every request and enable a
// stale‑while‑revalidate strategy.  Prefetching on startup warms the
// caches so the first user sees content immediately.
const newsCache = { items: [], fetched: 0 };
const tipsCache = { items: [], fetched: 0 };

// Helpers to fetch curated news and tips.  If the underlying
// providers throw an error (e.g. network or parsing issues) an empty
// array is returned to avoid breaking the API.  You can augment
// getNews()/getTips() to call external feeds; here they return
// statically curated content stored in news.js and tips.js.
async function fetchNews() {
  try {
    const items = await getNews();
    return Array.isArray(items) ? items : [];
  } catch (err) {
    console.error('[news] fetch failed', err);
    return [];
  }
}
async function fetchTips() {
  try {
    const items = await getTips();
    return Array.isArray(items) ? items : [];
  } catch (err) {
    console.error('[tips] fetch failed', err);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Replicate helper functions.  These functions interface with the Replicate
// API to perform image generation, image analysis and music synthesis.  They
// poll the prediction endpoint until the status becomes `succeeded` or
// terminates on failure.  See https://replicate.com/docs/reference/http

/**
 * Create a new Replicate prediction and wait until it completes.
 *
 * @param {string} version The model version identifier (e.g. "black-forest-labs/flux-1.1-pro")
 * @param {Object} input The input object as required by the model
 * @returns {Promise<Object>} The prediction object when finished
 */
async function runReplicate(version, input) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('replicate_token_missing');
  const create = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ version, input })
  });
  if (!create.ok) throw new Error('replicate_create_failed');
  const prediction = await create.json();
  const statusUrl = prediction?.urls?.get;
  if (!statusUrl) return prediction;
  let status = prediction.status;
  let result = prediction;
  // Poll every 2 seconds until the prediction completes
  while (status !== 'succeeded' && status !== 'failed' && status !== 'canceled') {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const res = await fetch(statusUrl, {
      headers: { 'Authorization': `Token ${token}` }
    });
    result = await res.json();
    status = result.status;
  }
  return result;
}

/**
 * Generate an image using the configured Replicate model.  Returns the URL
 * of the first output image or null on failure.
 * @param {string} prompt Description of the desired image
 */
async function generateImage(prompt) {
  const version = process.env.REPLICATE_MODEL_VERSION || 'black-forest-labs/flux-1.1-pro';
  const prediction = await runReplicate(version, { prompt });
  const output = prediction?.output;
  if (Array.isArray(output) && output.length > 0) return output[0];
  if (typeof output === 'string') return output;
  return null;
}

/**
 * Analyze an image via the LLaVA model.  Expects a base64 encoded image
 * string (without data URI prefix).  Returns the description text.
 * @param {string} imageData Base64 encoded image
 */
async function analyzeImage(imageData) {
  const version = process.env.REPLICATE_LLAVA_VERSION || 'liuhaotian/llava-13b';
  // LLaVA expects an image URL or base64 data.  Use the base64 string
  // directly and rely on Replicate to handle it.  The model may also
  // support additional parameters (e.g. prompt) but we omit them here.
  const prediction = await runReplicate(version, { image: imageData });
  const output = prediction?.output;
  if (Array.isArray(output) && output.length > 0) return String(output[0]);
  if (typeof output === 'string') return output;
  return 'Keine Beschreibung.';
}

/**
 * Generate a short music clip using the MusicGen model.  Returns the URL
 * of the generated audio file or null.
 * @param {string} prompt Description of the desired mood or scene
 */
async function generateMusic(prompt) {
  const version = process.env.REPLICATE_MUSICGEN_VERSION || 'facebook/musicgen';
  const prediction = await runReplicate(version, { prompt });
  const output = prediction?.output;
  if (Array.isArray(output) && output.length > 0) return output[0];
  if (typeof output === 'string') return output;
  return null;
}

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

// ------------- NEWS/TIPS endpoints -------------
// Serve curated news and tips with stale‑while‑revalidate caching.  TTLs are
// configured via NEWS_TTL_HOURS and TIPS_TTL_HOURS environment variables
// (defaults to 24 hours).  When the cache is empty or stale the
// respective fetch functions are called; otherwise cached items are
// returned immediately.
app.get('/api/news', async (req, res) => {
  const ttlHours = parseInt(process.env.NEWS_TTL_HOURS || '24', 10);
  if (!Array.isArray(newsCache.items) || (Date.now() - newsCache.fetched) > ttlHours * 3600 * 1000) {
    newsCache.items = await fetchNews();
    newsCache.fetched = Date.now();
  }
  res.json({ items: newsCache.items || [] });
});

// Search for news dynamically via configured external providers.
// Clients may supply a query string parameter `q` or `query`.
// Results come from Tavily or Perplexity and are returned unsorted.
app.get('/api/news/search', async (req, res) => {
  const q = String(req.query?.q || req.query?.query || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: 'missing_query' });
  try {
    // Import search function lazily to avoid circular dependencies.
    const { searchNews } = await import('./news.js');
    const items = await searchNews(q);
    res.json({ items: Array.isArray(items) ? items : [] });
  } catch (err) {
    console.error('[news/search] search failed', err);
    res.status(500).json({ ok: false, error: 'search_failed' });
  }
});

app.get('/api/tips', async (req, res) => {
  const ttlHours = parseInt(process.env.TIPS_TTL_HOURS || '24', 10);
  if (!Array.isArray(tipsCache.items) || (Date.now() - tipsCache.fetched) > ttlHours * 3600 * 1000) {
    tipsCache.items = await fetchTips();
    tipsCache.fetched = Date.now();
  }
  res.json({ items: tipsCache.items || [] });
});

// Simple metrics endpoint.  Logs events emitted by the front‑end for
// tracking usage patterns.  Can be extended to persist events.
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
    // If a Bubble is provided and its ID corresponds to a media or decision
    // prompt, handle it specially.  Otherwise build the user prompt and
    // complete it via the selected language model.
    if (bubble && typeof bubble.id === 'number') {
      const id = bubble.id;
      // Generate an image (Flux) – prompt comes from payload.BESCHREIBUNG
      if (id === 18) {
        const desc = String(bubble.payload?.BESCHREIBUNG || '').trim();
        if (!desc) return res.status(400).json({ ok:false, error:'missing_input' });
        try {
          const imageUrl = await generateImage(desc);
          if (imageUrl) return res.json({ ok: true, result: `__HTML__<img src="${imageUrl}" alt="AI Bild" />` });
          return res.json({ ok: true, result: 'Keine Antwort.' });
        } catch (err) {
          console.error('[bubble18]', err);
          return res.status(500).json({ ok:false, error:'image_failed' });
        }
      }
      // Analyze an uploaded image (LLaVA) – expects base64 in payload.BILD.data
      if (id === 19) {
        const data = bubble.payload?.BILD?.data;
        if (!data) return res.status(400).json({ ok:false, error:'missing_image' });
        try {
          const description = await analyzeImage(data);
          return res.json({ ok: true, result: description || 'Keine Antwort.' });
        } catch (err) {
          console.error('[bubble19]', err);
          return res.status(500).json({ ok:false, error:'image_analyze_failed' });
        }
      }
      // Yes/No joke decision – uses LLM to tell a joke or replies politely
      if (id === 20) {
        const ans = String(bubble.payload?.ANTWORT || '').trim().toLowerCase();
        if (['ja','j','yes','y','1','true'].includes(ans)) {
          const joke = await completeText('Erzähle einen kurzen KI‑bezogenen Witz.', { system, euOnly });
          return res.json({ ok:true, result: joke || 'Keine Antwort.' });
        } else {
          return res.json({ ok:true, result: 'Alles klar, vielleicht später.' });
        }
      }
      // Generate a short music loop – prompt comes from payload.BESCHREIBUNG
      if (id === 21) {
        const desc = String(bubble.payload?.BESCHREIBUNG || '').trim();
        if (!desc) return res.status(400).json({ ok:false, error:'missing_input' });
        try {
          const audioUrl = await generateMusic(desc);
          if (audioUrl) return res.json({ ok:true, result: `__HTML__<audio controls src="${audioUrl}"></audio>` });
          return res.json({ ok:true, result: 'Keine Antwort.' });
        } catch (err) {
          console.error('[bubble21]', err);
          return res.status(500).json({ ok:false, error:'music_failed' });
        }
      }
    }
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
    // Handle special bubble types via Replicate.  For these IDs we
    // generate the entire output before streaming it as a single event.
    if (bubble && typeof bubble.id === 'number') {
      const id = bubble.id;
      // Image generation
      if (id === 18) {
        const desc = String(bubble.payload?.BESCHREIBUNG || '').trim();
        if (!desc){ res.writeHead(400); return res.end('missing description'); }
        try {
          const url = await generateImage(desc);
          res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':'*' });
          res.write(`data: ${url ? `__HTML__<img src=\"${url}\" alt=\"AI Bild\" />` : 'Keine Antwort.'}\n\n`);
          res.write('data: [DONE]\n\n');
          return res.end();
        } catch (err) {
          console.error('[stream bubble18]', err);
          res.writeHead(500); return res.end('image_failed');
        }
      }
      // Image analysis
      if (id === 19) {
        const data = bubble.payload?.BILD?.data;
        if (!data){ res.writeHead(400); return res.end('missing image'); }
        try {
          const description = await analyzeImage(data);
          res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':'*' });
          res.write(`data: ${description || 'Keine Antwort.'}\n\n`);
          res.write('data: [DONE]\n\n');
          return res.end();
        } catch (err) {
          console.error('[stream bubble19]', err);
          res.writeHead(500); return res.end('image_analyze_failed');
        }
      }
      // Yes/No joke decision
      if (id === 20) {
        const ans = String(bubble.payload?.ANTWORT || '').trim().toLowerCase();
        res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':'*' });
        if (['ja','j','yes','y','1','true'].includes(ans)) {
          const joke = await completeText('Erzähle einen kurzen KI‑bezogenen Witz.', { system, euOnly });
          res.write(`data: ${joke || 'Keine Antwort.'}\n\n`);
        } else {
          res.write('data: Alles klar, vielleicht später.\n\n');
        }
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      // Music generation
      if (id === 21) {
        const desc = String(bubble.payload?.BESCHREIBUNG || '').trim();
        if (!desc){ res.writeHead(400); return res.end('missing description'); }
        try {
          const url = await generateMusic(desc);
          res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':'*' });
          res.write(`data: ${url ? `__HTML__<audio controls src=\"${url}\"></audio>` : 'Keine Antwort.'}\n\n`);
          res.write('data: [DONE]\n\n');
          return res.end();
        } catch (err) {
          console.error('[stream bubble21]', err);
          res.writeHead(500); return res.end('music_failed');
        }
      }
    }
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

// ---------------------------------------------------------------------------
// Prefetch news and tips at startup and on a periodic interval.  This
// warming ensures that the first client receives populated lists and
// reduces latency for the /api/news and /api/tips endpoints.  The
// interval is set to the maximum of NEWS_TTL_HOURS and TIPS_TTL_HOURS
// (defaults to 24 hours) and never less than 1 hour.

async function prefetchAll() {
  try {
    const items = await fetchNews();
    if (Array.isArray(items) && items.length) {
      newsCache.items = items;
      newsCache.fetched = Date.now();
      console.log('[Prefetch] Loaded', items.length, 'news items');
    }
  } catch (err) {
    console.error('[Prefetch] News prefetch error', err);
  }
  try {
    const items = await fetchTips();
    if (Array.isArray(items) && items.length) {
      tipsCache.items = items;
      tipsCache.fetched = Date.now();
      console.log('[Prefetch] Loaded', items.length, 'tips');
    }
  } catch (err) {
    console.error('[Prefetch] Tips prefetch error', err);
  }
}

// Perform an immediate prefetch when the server starts
prefetchAll().catch(err => console.error('[Prefetch] Startup error', err));

// Schedule periodic prefetching.  Use the greater of configured TTLs and
// ensure the interval is at least one hour to avoid spamming external
// providers.  If environment variables are unset they default to 24.
const newsTTL = parseInt(process.env.NEWS_TTL_HOURS, 10) || 24;
const tipsTTL = parseInt(process.env.TIPS_TTL_HOURS, 10) || 24;
const intervalHours = Math.max(newsTTL, tipsTTL);
setInterval(() => {
  prefetchAll().catch(err => console.error('[Prefetch] Scheduled error', err));
}, Math.max(intervalHours, 1) * 60 * 60 * 1000);
