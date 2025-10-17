/**
 * hohl.rocks backend (v1.8)
 * Express API with CORS, Health/Ready checks, SSE /api/run, and /api/news with 12h cache (Tavily).
 * Provider: OpenRouter (streaming) if OPENROUTER_API_KEY is set, else Anthropic/OpenAI fallbacks (non-stream).
 *
 * Environment (set on Railway):
 *  PORT=8080
 *  NODE_ENV=production
 *  OPENROUTER_API_KEY=xxx           (preferred streaming provider)
 *  OPENAI_API_KEY=xxx               (optional fallback)
 *  ANTHROPIC_API_KEY=xxx            (optional fallback)
 *  TAVILY_API_KEY=xxx               (for /api/news)
 *  NEWS_DOMAINS=heise.de,zeit.de,srf.ch,tagesschau.de,the-decoder.de,zdf.de
 *  CORS_ALLOWLIST=https://hohl.rocks,https://www.hohl.rocks,https://steady-pixie-8f36d7.netlify.app
 */
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const { router: newsRouter, getTicker } = require('./news');

const app = express();
const PORT = process.env.PORT || 8080;

// ----- CORS (allowlist) -----
const allowlist = (process.env.CORS_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOptions = {
  origin: function (origin, cb) {
    if (!origin) return cb(null, true); // allow curl/postman
    if (allowlist.length === 0) return cb(null, true);
    const ok = allowlist.some(a => origin === a);
    cb(ok ? null : new Error('CORS blocked'), ok);
  },
  credentials: false
};

app.use(morgan('tiny'));
app.use(express.json({ limit: '1mb' }));
app.use(cors(corsOptions));

// ----- Health / Ready -----
app.get('/healthz', (req, res) => {
  return res.json({
    ok: true,
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'dev',
    version: process.env.BUILD_VERSION || '2025.10',
    features: {
      eu_host_check: true,
      idempotency: true,
      quality: true,
      queue_enabled: false,
      pdf_service: !!process.env.PDF_SERVICE_URL
    }
  });
});

app.get('/readyz', (req, res) => {
  return res.json({ ok: true, now: Date.now(), env: process.env.NODE_ENV || 'dev' });
});

// ----- API routers -----
app.use('/api/news', newsRouter);

// simple 12h-rotating ticker (server-side) using the news cache
app.get('/api/daily', async (req, res) => {
  try {
    const item = await getTicker();
    return res.json({ ok: true, item });
  } catch (err) {
    console.error('ticker error', err);
    return res.status(500).json({ ok: false, error: 'ticker_failed' });
  }
});

/**
 * SSE run endpoint
 * POST /api/run  { prompt, system?, model? }
 * Streams tokens from OpenRouter if available, otherwise returns 501.
 */
app.post('/api/run', async (req, res) => {
  const { prompt, system = '', model = 'openrouter/auto' } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ ok: false, error: 'missing_prompt' });
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    // no provider configured
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`event: meta\ndata: ${JSON.stringify({ provider: 'none' })}\n\n`);
    res.write(`event: delta\ndata: ${JSON.stringify({ content: '[Demo] Backend ohne LLM‑Key. Bitte OPENROUTER_API_KEY setzen.' })}\n\n`);
    res.write(`event: done\ndata: {}\n\n`);
    return res.end();
  }

  try {
    // stream from OpenRouter
    const body = {
      model,
      stream: true,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt }
      ]
    };

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hohl.rocks',
        'X-Title': 'hohl.rocks'
      },
      body: JSON.stringify(body)
    });

    if (!r.ok || !r.body) {
      const txt = await r.text().catch(() => '');
      return res.status(502).json({ ok: false, error: 'upstream_error', detail: txt.slice(0, 500) });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    res.write(`event: meta\ndata: ${JSON.stringify({ provider: 'openrouter', model })}\n\n`);

    const reader = r.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // OpenRouter returns Server-Sent-Events lines prefixed by "data: {...}"
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const chunk of parts) {
        const line = chunk.split('\n').find(l => l.startsWith('data:'));
        if (!line) continue;
        const data = line.replace(/^data:\s?/, '');
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const token = json?.choices?.[0]?.delta?.content;
          if (typeof token === 'string' && token.length) {
            res.write(`event: delta\ndata: ${JSON.stringify({ content: token })}\n\n`);
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }

    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (err) {
    console.error('sse error', err);
    res.status(500).json({ ok: false, error: 'sse_failed' });
  }
});

// 404 handler (JSON)
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'not_found' });
});

app.listen(PORT, () => {
  console.log(`[hohl.rocks-back] listening on :${PORT}`);
});

module.exports = app;