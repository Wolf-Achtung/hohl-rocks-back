import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import fetch from 'node-fetch';
import { getNews, getDaily } from './news.js';
import { runLLM } from './share.llm.js';
import { prompts } from './prompts.js';

const app = express();
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Helmet with a permissive CSP for inline styles used in bubbles; netlify/_headers should still set CSP for static site
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'), false);
  },
  credentials: false
}));

if (NODE_ENV !== 'test') {
  app.use(morgan('tiny'));
}

// Health & Ready
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    env: NODE_ENV,
    version: '2025.10',
    features: {
      eu_host_check: true,
      idempotency: true,
      quality: true,
      queue_enabled: false,
      pdf_service: true
    }
  });
});

app.get('/readyz', (req, res) => {
  const envs = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'TAVILY_API_KEY'
  ];
  const missing = envs.filter(k => !process.env[k]);
  res.json({ ok: missing.length === 0, missing });
});

// API namespace
const api = express.Router();

api.get('/version', (req, res) => res.json({ ok: true, version: '2.0.0' }));

// Prompts (static curated list used by bubbles and prompts modal)
api.get('/prompts', (req, res) => {
  res.json({ ok: true, items: prompts });
});

// News & Daily (12h cache handled in module)
api.get('/news', async (req, res) => {
  try {
    const region = (req.query.region || 'de').toLowerCase();
    const data = await getNews({ region });
    res.json({ ok: true, items: data });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'news_unavailable', detail: String(e) });
  }
});

api.get('/daily', async (req, res) => {
  try {
    const region = (req.query.region || 'de').toLowerCase();
    const data = await getDaily({ region });
    res.json({ ok: true, items: data });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'daily_unavailable', detail: String(e) });
  }
});

// LLM streaming run
api.post('/run', async (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
  };

  try {
    const body = req.body || {};
    const { prompt, system, temperature, model, provider } = body;
    if (!prompt || typeof prompt !== 'string') {
      send('error', { message: 'missing_prompt' });
      return res.end();
    }
    await runLLM({
      prompt,
      system,
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      model,
      provider,
      onToken: (t) => send('chunk', t),
      onDone: (meta) => {
        send('done', meta || { ok: true });
        res.end();
      },
      onError: (err) => {
        send('error', { message: String(err) });
        res.end();
      }
    });
  } catch (e) {
    send('error', { message: String(e) });
    res.end();
  }
});

app.use('/api', api);

// 404
app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

app.listen(PORT, () => {
  console.log(`[hohl.rocks-back] listening on :${PORT}`);
});
