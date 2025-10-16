/* hohl.rocks API – v5.1.1 (Gold, Ready) */
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

const {
  ANTHROPIC_API_KEY = '', OPENAI_API_KEY = '', OPENROUTER_API_KEY = '',
  TAVILY_API_KEY = '', PERPLEXITY_API_KEY = '', REPLICATE_API_TOKEN = ''
} = process.env;

// --- CORS ---
const DEFAULT_ORIGINS = [
  'http://localhost:3000','http://localhost:5173','http://localhost:8080',
  'https://localhost:3000','https://localhost:5173','https://localhost:8080',
  'https://hohl.rocks','https://www.hohl.rocks'
];
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
const ORIGINS = ALLOWED.length ? ALLOWED : DEFAULT_ORIGINS;

app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    const ok = ORIGINS.some(o => origin.endsWith(o) || origin === o);
    return ok ? cb(null, true) : cb(new Error('CORS blocked: ' + origin));
  }, credentials: true,
}));

// --- Hardening & perf ---
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan(NODE_ENV==='production' ? 'combined' : 'dev'));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// --- Rate limit ---
const limiter = rateLimit({
  windowMs: 60 * 1000, max: Number(process.env.RATE_LIMIT_PER_MIN || 60),
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api', limiter);

// --- Healthz & Readyz ---
app.get('/healthz', (_req,res)=> res.type('application/json; charset=utf-8').json({ ok: true, now: Date.now(), env: NODE_ENV }));

function withTimeout(promiseFn, ms){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), ms);
  return Promise.race([ promiseFn(ctrl.signal), new Promise((_,rej)=>rej(new Error('timeout'))) ]).finally(()=>clearTimeout(t));
}
async function pingAnthropic(signal){ if(!ANTHROPIC_API_KEY) return 'skipped'; try{ const r=await fetch('https://api.anthropic.com/v1/models',{ headers:{'x-api-key':ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'}, signal }); return r.ok?'ok':'http_'+r.status; }catch{ return 'err'; } }
async function pingOpenAI(signal){ if(!OPENAI_API_KEY) return 'skipped'; try{ const r=await fetch('https://api.openai.com/v1/models',{ headers:{'Authorization':'Bearer '+OPENAI_API_KEY}, signal}); return r.ok?'ok':'http_'+r.status; }catch{ return 'err'; } }
async function pingTavily(signal){ if(!TAVILY_API_KEY) return 'skipped'; try{ const r=await fetch('https://api.tavily.com/search',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ api_key:TAVILY_API_KEY, query:'ping', max_results:1 }), signal}); return r.ok?'ok':'http_'+r.status; }catch{ return 'err'; } }

app.get('/readyz', async (_req,res)=>{
  try{
    const result = {
      ok: true, now: Date.now(), env: NODE_ENV,
      keys: {
        llm: !!(ANTHROPIC_API_KEY || OPENAI_API_KEY || OPENROUTER_API_KEY),
        anthropic: !!ANTHROPIC_API_KEY, openai: !!OPENAI_API_KEY, openrouter: !!OPENROUTER_API_KEY,
        tavily: !!TAVILY_API_KEY, perplexity: !!PERPLEXITY_API_KEY, replicate: !!REPLICATE_API_TOKEN
      }, external: {}
    };
    const anthropic = await withTimeout((signal)=>pingAnthropic(signal), 1500).catch(()=> 'err');
    const openai    = await withTimeout((signal)=>pingOpenAI(signal), 1500).catch(()=> 'err');
    const tavily    = await withTimeout((signal)=>pingTavily(signal), 1500).catch(()=> 'err');
    result.external = { anthropic, openai, tavily };
    if(!result.keys.llm) result.ok=false;
    res.type('application/json; charset=utf-8').json(result);
  }catch(e){ res.status(500).json({ ok:false, error:e?.message||'ready_failed' }); }
});

// --- Routes ---
app.use('/api/news', newsRouter);
app.use('/api/research', researchRouter);
app.use('/api', bubbleRouter);

app.use('/api', (_req,res)=>res.status(404).json({ ok:false, error:'not_found' }));
app.use((err,_req,res,_next)=>{ console.error('[API] error:', err?.stack||err?.message||err); res.status(500).json({ ok:false, error:'internal_error' }); });

app.listen(PORT, ()=>{
  console.log(`[hohl.rocks API] listening :${PORT}`);
  console.log(`[hohl.rocks API] allowed origins:`, ORIGINS.join(', '));
});
