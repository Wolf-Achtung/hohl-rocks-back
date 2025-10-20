'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const { makeCorsOptions } = require('./utils/cors');
const { createSWRCache, hours } = require('./utils/cache');
const { getNews } = require('./services/news');
const { getTips } = require('./services/tips');
const { completeText, streamText } = require('./share.llm');

// ---- Env & Config ----
const PORT = Number(process.env.PORT || 8080);
const NODE_ENV = process.env.NODE_ENV || 'production';
const CORS_ALLOWLIST = process.env.CORS_ALLOWLIST || process.env.ALLOWED_ORIGINS || 'https://hohl.rocks,https://www.hohl.rocks';
const NEWS_DOMAINS = process.env.NEWS_DOMAINS || 'heise.de,zeit.de,tagesschau.de';
const NEWS_TTL_HOURS = Number(process.env.NEWS_TTL_HOURS || 24);
const TIPS_TTL_HOURS = Number(process.env.TIPS_TTL_HOURS || 24);
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const REPLICATE_MODEL_VERSION = process.env.REPLICATE_MODEL_VERSION || 'black-forest-labs/flux-1.1-pro';
const REPLICATE_LLAVA_VERSION = process.env.REPLICATE_LLAVA_VERSION || 'liuhaotian/llava-13b';
const REPLICATE_MUSICGEN_VERSION = process.env.REPLICATE_MUSICGEN_VERSION || 'facebook/musicgen';

// ---- App ----
const app = express();
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

app.use(cors(makeCorsOptions(CORS_ALLOWLIST)));

// JSON Logging via morgan
morgan.token('remote-addr', req => req.ip);
morgan.token('len', (req, res) => (res.getHeader('content-length') || 0));
app.use(morgan(function (tokens, req, res) {
  const rec = {
    time: new Date().toISOString(),
    level: 'info',
    app: 'hohl.rocks-back',
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: Number(tokens.status(req, res)),
    length: Number(tokens['len'](req, res)),
    duration_ms: Number(tokens['response-time'](req, res))
  };
  return JSON.stringify(rec);
}, {
  skip: (req) => req.path === '/healthz' || req.path === '/readyz'
}));

// ---- Health ----
app.get('/healthz', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});
app.get('/readyz', (req, res) => {
  res.status(200).json({ ok: true, env: NODE_ENV });
});

// ---- SWR Caches ----
const newsCache = createSWRCache(hours(NEWS_TTL_HOURS));
const tipsCache = createSWRCache(hours(TIPS_TTL_HOURS));

// ---- Helpers ----
function parseBubbleEnvelope(input) {
  // Erwartet z.B.: "[Bubble 18] ..." oder "[Bubble 18] {payload...}"
  const m = String(input || '').match(/^\[\s*Bubble\s+(\d+)\s*\]/i);
  if (!m) return null;
  const id = Number(m[1]);
  // payload separat über Body-Objekt erlaubt
  return { id };
}

function sendJson(res, obj) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.status(200).send(JSON.stringify(obj));
}

// ---- API ----
const router = express.Router();

// GET /api/news
router.get('/news', async (req, res) => {
  try {
    const force = req.query.prefetch === '1';
    if (force) {
      const items = await getNews({ tavilyKey: TAVILY_API_KEY, domainsCsv: NEWS_DOMAINS });
      newsCache.forceSet(items);
      return sendJson(res, { items, cached_age_ms: 0 });
    }
    const items = await newsCache.get(() => getNews({ tavilyKey: TAVILY_API_KEY, domainsCsv: NEWS_DOMAINS }));
    return sendJson(res, { items, cached_age_ms: newsCache.ageMs() });
  } catch (e) {
    console.error(JSON.stringify({ level:'error', app:'hohl.rocks-back', event:'news_failed', message: e.message }));
    res.status(200).json({ items: [], error: 'news_failed' });
  }
});

// GET /api/tips
router.get('/tips', async (req, res) => {
  try {
    const force = req.query.prefetch === '1';
    if (force) {
      const items = await getTips();
      tipsCache.forceSet(items);
      return sendJson(res, { items, cached_age_ms: 0 });
    }
    const items = await tipsCache.get(getTips);
    return sendJson(res, { items, cached_age_ms: tipsCache.ageMs() });
  } catch (e) {
    console.error(JSON.stringify({ level:'error', app:'hohl.rocks-back', event:'tips_failed', message: e.message }));
    res.status(200).json({ items: [], error: 'tips_failed' });
  }
});

// POST /api/metrics
router.post('/metrics', async (req, res) => {
  const { type, meta } = req.body || {};
  console.log(JSON.stringify({ level:'info', app:'hohl.rocks-back', event:'metrics', type, meta }));
  res.json({ ok: true });
});

// POST /api/run – non-streaming
router.post('/run', async (req, res) => {
  try {
    const input = String(req.body?.input || '').trim();
    const payload = req.body?.payload || {};
    const bubble = parseBubbleEnvelope(input);
    if (!input) return res.status(400).json({ ok:false, error:'missing_input' });

    if (bubble) {
      const id = bubble.id;
      if (id === 18) {
        // Bild generieren (Replicate Flux 1.1 pro)
        const text = payload?.BESCHREIBUNG || '';
        if (!REPLICATE_API_TOKEN) return res.json({ ok:true, result: "Replicate nicht konfiguriert." });
        const imageUrl = await replicateImageGenerate(text);
        return res.json({ ok:true, result: imageUrl ? `__HTML__<img src="${imageUrl}" alt="AI Bild" />` : "Keine Ausgabe." });
      }
      if (id === 19) {
        // Bildanalyse (LLaVA)
        const imageB64 = payload?.BILD?.data || '';
        if (!REPLICATE_API_TOKEN) return res.json({ ok:true, result: "Replicate nicht konfiguriert." });
        const desc = await replicateImageDescribe(imageB64);
        return res.json({ ok:true, result: desc || "Keine Beschreibung." });
      }
      if (id === 20) {
        const answer = String(payload?.ANTWORT || '').trim().toLowerCase();
        if (['ja','yes','y','j'].includes(answer)) {
          const joke = await completeText('Erzähle einen kurzen KI-bezogenen Witz (max. 30 Wörter).');
          return res.json({ ok:true, result: joke || "Keine Antwort." });
        }
        return res.json({ ok:true, result: "Alles klar, vielleicht später." });
      }
      if (id === 21) {
        const text = payload?.BESCHREIBUNG || '';
        if (!REPLICATE_API_TOKEN) return res.json({ ok:true, result: "Replicate nicht konfiguriert." });
        const audioUrl = await replicateMusicGenerate(text);
        return res.json({ ok:true, result: audioUrl ? `__HTML__<audio controls src="${audioUrl}"></audio>` : "Keine Ausgabe." });
      }
    }

    // Fallback: normaler LLM-Run
    const text = await completeText(input);
    return res.json({ ok:true, result: text || "" });
  } catch (e) {
    console.error(JSON.stringify({ level:'error', app:'hohl.rocks-back', event:'run_failed', message: e.message }));
    res.status(500).json({ ok:false, error:'run_failed' });
  }
});

// GET /api/run/stream – SSE
router.get('/run/stream', async (req, res) => {
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');

  const input = String(req.query?.input || req.query?.q || '').trim();
  if (!input) {
    res.write(`data: ${JSON.stringify({ error:'missing_input' })}\n\n`);
    return res.end();
  }

  // Bubble parsing ist hier bewusst minimal – für echte Medienflows eher POST verwenden
  try {
    for await (const tok of streamText(input)) {
      res.write("data: " + JSON.stringify(tok) + "\n\n");
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e) {
    console.error(JSON.stringify({ level:'error', app:'hohl.rocks-back', event:'stream_failed', message: e.message }));
    res.write(`data: ${JSON.stringify({ error:'stream_failed' })}\n\n`);
    res.end();
  }
});

app.use('/api', router);
app.use('/_api', router); // Alias

// ---- Replicate helpers ----
async function replicateImageGenerate(promptText) {
  const resp = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      version: REPLICATE_MODEL_VERSION,
      input: { prompt: promptText }
    })
  });
  if (!resp.ok) {
    const t = await resp.text().catch(()=>'');
    throw new Error('replicate image ' + resp.status + ' ' + t.slice(0,200));
  }
  const data = await resp.json();
  // Output kann array oder single sein
  const out = Array.isArray(data.output) ? data.output[0] : data.output;
  return typeof out === 'string' ? out : '';
}

async function replicateImageDescribe(imageBase64) {
  const resp = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      version: REPLICATE_LLAVA_VERSION,
      input: { image: imageBase64, task: 'describe' }
    })
  });
  if (!resp.ok) {
    const t = await resp.text().catch(()=>'');
    throw new Error('replicate llava ' + resp.status + ' ' + t.slice(0,200));
  }
  const data = await resp.json();
  const out = Array.isArray(data.output) ? data.output[0] : data.output;
  return typeof out === 'string' ? out : '';
}

async function replicateMusicGenerate(text) {
  const resp = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      version: REPLICATE_MUSICGEN_VERSION,
      input: { prompt: text, duration: 12 }
    })
  });
  if (!resp.ok) {
    const t = await resp.text().catch(()=>'');
    throw new Error('replicate music ' + resp.status + ' ' + t.slice(0,200));
  }
  const data = await resp.json();
  const out = Array.isArray(data.output) ? data.output[0] : data.output;
  return typeof out === 'string' ? out : '';
}

// ---- Server start ----
app.listen(PORT, () => {
  console.log(`:8080 hohl.rocks-back listening on ${PORT}`);
});
