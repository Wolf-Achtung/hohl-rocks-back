/* hohl.rocks API – v3.0.0 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import newsRouter from './news.js';
import bubbleRouter from './router.bubbles.js';

const app = express();
app.set('trust proxy', 1);

const NODE_ENV = process.env.NODE_ENV || 'production';
const PORT = process.env.PORT || 8080;
const ALLOWED = String(process.env.ALLOWED_ORIGINS || 'http://localhost:8888,https://hohl.rocks,https://www.hohl.rocks')
  .split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '2mb' }));
app.use(compression());
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS allowlist
const corsOpts = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    try { const o = new URL(origin).origin.replace(/\/$/, ''); cb(null, ALLOWED.includes(o)); }
    catch { cb(null, false); }
  },
  methods: ['GET','HEAD','POST','OPTIONS'],
  credentials: false
};
app.use(cors(corsOpts));
app.use((_, res, next) => { res.set('Vary','Origin'); next(); });

// health
app.get('/healthz', (_req,res)=>res.json({ ok:true, ts: new Date().toISOString() }));
app.get('/readyz', (_req,res)=>res.json({ ready:true }));

// API
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }));
app.use('/api/news', newsRouter);
app.use('/api/bubble', bubbleRouter);

// 404 under api
app.use('/api', (_req,res)=>res.status(404).json({ ok:false, error:'not_found' }));

// error
app.use((err,_req,res,_next)=>{
  console.error('[API] error:', err?.stack||err?.message||err);
  res.status(500).json({ ok:false, error:'internal_error' });
});

app.listen(PORT, ()=>{
  console.log(`[hohl.rocks API] listening :${PORT}`);
  console.log(`[hohl.rocks API] allowed origins:`, ALLOWED.join(', '));
});
