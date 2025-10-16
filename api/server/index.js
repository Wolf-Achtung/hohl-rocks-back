import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import newsRouter, { handleDaily } from './news.js';
import researchRouter from './research.js';
import runRouter from './router.bubbles.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', 1);

// ---- CORS with wildcard support (e.g. *.netlify.app) ----
const ALLOW = (process.env.ALLOWED_ORIGINS||'')
  .split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb){
    if(!origin) return cb(null,true);
    if(ALLOW.length===0) return cb(null,true);
    const ok = ALLOW.some(a => origin===a || (a.includes('*') && new RegExp('^'+a.replaceAll('.', '\\.').replaceAll('*','.*')+'$').test(origin)));
    cb(ok?null:new Error('CORS blocked'), ok);
  }
}));

app.use(express.json({limit:'1mb'}));
app.use(morgan('tiny'));

// ---- Health / Ready ----
app.get('/healthz', (req,res)=> res.json({ok:true, now:Date.now(), env:process.env.NODE_ENV||'production'}));
app.get('/readyz', (req,res)=>{
  const ready = !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY || !!process.env.OPENROUTER_API_KEY;
  res.status(ready?200:503).json({ok:ready, model: process.env.CLAUDE_MODEL||process.env.OPENAI_MODEL||process.env.OPENROUTER_MODEL||'n/a'});
});

// ---- API Routes ----
app.use('/api/news', newsRouter);
app.get('/api/daily', handleDaily);       // alias so the front can call /api/daily
app.use('/api/research', researchRouter);
app.use('/api/run', runRouter);            // POST /api/run  (SSE)

// ---- Root ----
app.get('/', (req,res)=> res.type('text/plain').send('hohl.rocks-back up'));

app.listen(PORT, ()=> console.log('[back] listening on', PORT));
