/* hohl.rocks API – integrated in back repo – v1.5.0 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import newsRouter from './news.js';

const app = express();
app.set('trust proxy', 1);

const ALLOWED = String(process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);

const isAllowed = (origin) => {
  if (!origin) return true; // server-to-server, curl, health checks
  try { return ALLOWED.includes(new URL(origin).origin); } catch { return false; }
};

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));
app.use(compression());
app.use(cors({
  origin: (origin, cb) => cb(null, isAllowed(origin)),
  methods: ['GET','HEAD','OPTIONS'],
  credentials: false
}));
app.use((_, res, next) => { res.set('Vary','Origin'); next(); });

// Health (root + alias under /api)
const health = (_req, res) => res.json({ ok: true, version: '1.5.0' });
app.get('/healthz', health);
app.get('/api/healthz', health);

// Diagnostics
app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, tavily: !!process.env.TAVILY_API_KEY, allowed: ALLOWED });
});

// Rate limit only for api
app.use('/api', rateLimit({ windowMs: 60_000, max: 90 }));
app.use('/api', newsRouter);

// Not found (api only)
app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err?.message || err);
  res.status(500).json({ ok: false, error: 'internal_error' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`hohl.rocks API up on :${PORT}`));
