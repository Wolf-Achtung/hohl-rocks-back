/* hohl.rocks API – v5.0 (Gold) */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import newsRouter from './news.js';
import researchRouter from './research.js';
import bubbleRouter from './router.bubbles.js';

const app = express();
app.set('trust proxy', 1);

const NODE_ENV = process.env.NODE_ENV || 'production';
const PORT = process.env.PORT || 8080;

// --- CORS ---
const DEFAULT_ORIGINS = [
  'http://localhost:3000','http://localhost:5173','http://localhost:8080',
  'https://localhost:3000','https://localhost:5173','https://localhost:8080',
  'https://hohl.rocks','https://www.hohl.rocks'
];
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s=>s.trim()).filter(Boolean);
const ORIGINS = ALLOWED.length ? ALLOWED : DEFAULT_ORIGINS;

app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true); // allow curl/postman
    const ok = ORIGINS.some(o => origin.endsWith(o) || origin === o);
    return ok ? cb(null, true) : cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
}));

// --- Hardening & perf ---
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan(NODE_ENV==='production' ? 'combined' : 'dev'));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// --- Rate limit ---
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_MIN || 60),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// --- Healthz ---
app.get('/healthz', (_req,res)=> res.json({ ok: true, now: Date.now(), env: NODE_ENV }));

// --- API routes ---
app.use('/api/news', newsRouter);
app.use('/api/research', researchRouter);
app.use('/api', bubbleRouter); // /api/run + /api/bubble/:id

// 404 under /api
app.use('/api', (_req,res)=>res.status(404).json({ ok:false, error:'not_found' }));

// error
app.use((err,_req,res,_next)=>{
  console.error('[API] error:', err?.stack||err?.message||err);
  res.status(500).json({ ok:false, error:'internal_error' });
});

app.listen(PORT, ()=>{
  console.log(`[hohl.rocks API] listening :${PORT}`);
  console.log(`[hohl.rocks API] allowed origins:`, ORIGINS.join(', '));
});
