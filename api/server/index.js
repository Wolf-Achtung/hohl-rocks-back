import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { generate } from './share.llm.js';
import { getDachNews, getDaily } from './news.js';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
const PORT = process.env.PORT || 8080;

// CORS
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (allowed.length === 0) return cb(null, true);
    const ok = allowed.some(a => origin.endsWith(a) || origin === a || (a.includes('*') && new RegExp(a.replace('*','.*')).test(origin)));
    cb(ok ? null : new Error('CORS'), ok);
  }
}));

app.use(express.json({ limit:'1mb' }));

// health
app.get('/healthz', (req,res)=> res.json({ ok:true, now:Date.now(), env: process.env.NODE_ENV || 'production' }));
app.get('/readyz', (req,res)=>{
  const ok = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
  res.status(ok?200:503).json({ ok, provider: ok ? 'configured' : 'none' });
});

// news
function sendNews(res){
  res.json({ items: getDachNews(), updated: Date.now() });
}
app.get('/api/news', (req,res)=> sendNews(res));
app.get('/_api/news', (req,res)=> sendNews(res));

// daily ticker
function sendDaily(res){
  res.json({ items: getDaily(), updated: Date.now() });
}
app.get('/api/daily', (req,res)=> sendDaily(res));
app.get('/_api/daily', (req,res)=> sendDaily(res));

// run (SSE-like chunking)
async function handleRun(req, res){
  const { title = 'Assistent', prompt = '' } = req.body || {};
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Accel-Buffering': 'no',
    'Cache-Control': 'no-cache, no-transform',
    'Transfer-Encoding': 'chunked'
  });
  try{
    const generated = await generate({ title, prompt });
    // chunk it
    const parts = generated.split(/(\n\n)/);
    for(const p of parts){
      res.write(p);
      await new Promise(r=>setTimeout(r, 80));
    }
  }catch(err){
    log.error({ err }, 'run failed');
    res.write('Fehler: Service nicht erreichbar.');
  }finally{
    res.end();
  }
}
app.post('/api/run', handleRun);
app.post('/_api/run', handleRun);

// root
app.get('/', (req,res)=> res.send('ok'));

app.listen(PORT, ()=> log.info(`hohl.rocks back listening on ${PORT}`));
