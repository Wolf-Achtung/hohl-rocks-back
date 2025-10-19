import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { completeText, streamText } from './share.llm.js';

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

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/readyz', (_req, res) => {
  const issues = []; if (!process.env.TAVILY_API_KEY) issues.push('TAVILY_API_KEY missing');
  res.json({ ok: issues.length === 0, issues });
});

/* Tavily helpers */
const DEFAULT_DOMAINS = (process.env.NEWS_DOMAINS || 'heise.de,golem.de,t3n.de,the-decoder.de,tagesschau.de,zeit.de').split(',').map(s=>s.trim()).filter(Boolean);
const CACHE_MS = 3 * 60 * 60 * 1000;
let newsCache = { ts: 0, key: '', items: [] };

function withTimeout(ms){
  const controller = new AbortController();
  const id = setTimeout(()=> controller.abort('timeout'), ms);
  return { signal: controller.signal, cancel: ()=> clearTimeout(id) };
}
function hostOf(u){ try{ return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } }
function filterAllowed(items, domains){
  const set = new Set(domains.map(h=>h.replace(/^www\./,'')));
  return items.filter(it => set.has(hostOf(it.url)));
}
async function tavily(query, domains, maxResults=8, ms=8000){
  const key = process.env.TAVILY_API_KEY; if (!key) return [];
  const { signal, cancel } = withTimeout(ms);
  try{
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key:key, query, search_depth:'advanced', include_domains:domains, max_results:Math.min(Math.max(maxResults,1),20), topic:'news', time_range:'d', include_answer:false }),
      signal
    });
    cancel();
    if (!r.ok) throw new Error('tavily_'+r.status);
    const j = await r.json();
    const items = (j?.results || []).map(x => ({ title: x.title || x.content || x.snippet || 'Ohne Titel', url: x.url })).filter(it => it.url);
    return filterAllowed(items, domains);
  } catch(e){ cancel(); console.error('[tavily]', e.message||e); return []; }
}

function dedupe(items){
  const seen = new Set(); const out = [];
  for (const it of items){
    const k = hostOf(it.url)+'|'+(it.title||'').slice(0,80);
    if (!seen.has(k)){ seen.add(k); out.push(it); }
  }
  return out;
}

/* API */
const api = express.Router();

api.get('/news', async (req, res) => {
  try{
    const doms = (req.query.domains ? String(req.query.domains).split(',') : DEFAULT_DOMAINS).map(s=>s.trim()).filter(Boolean);
    const cacheKey = doms.join(',') + '|DEKI';
    const now = Date.now();
    if (newsCache.items.length && now - newsCache.ts < CACHE_MS && newsCache.key === cacheKey){
      return res.json({ ok:true, items: newsCache.items, cached:true });
    }
    const queries = [
      'KI Sicherheit Deutschland aktuelle Warnungen Data Leakage Prompt Injection',
      'ChatGPT Tipps Tricks deutsch Produktivität Beispiele',
      'Claude Tipps Tricks deutsch Prompting Sicherheit',
      'Mistral KI Tipps deutsch Best Practices',
      'Llama KI Tipps deutsch Datenschutz Open-Source'
    ];
    let merged = [];
    for (const q of queries){ const chunk = await tavily(q, doms, 6); merged = merged.concat(chunk); }
    const items = dedupe(merged).slice(0, 16);
    newsCache = { ts: now, key: cacheKey, items };
    res.json({ ok:true, items });
  } catch(e){ console.error('[news]', e); res.json({ ok:true, items:[] }); }
});

api.get('/daily', async (_req, res) => {
  try {
    if (!newsCache.items?.length) {
      const doms = DEFAULT_DOMAINS;
      newsCache.items = await tavily('KI Deutschland Tipps Tricks Sicherheit', doms, 6);
      newsCache.ts = Date.now(); newsCache.key = 'daily';
    }
    const picks = newsCache.items.slice(0, 6).map((it, i) => ({ title: i === 0 ? 'Spotlight' : `Lesenswert ${i}`, url: it.url }));
    res.json({ ok: true, items: picks });
  } catch(e){ console.error('[daily]', e); res.json({ ok:true, items:[] }); }
});

api.post('/run', async (req, res) => {
  try{
    const input = (req.body?.input || '').toString().trim();
    const euOnly = String(req.query?.eu || req.body?.eu || process.env.EU_ONLY) === '1';
    if (!input) return res.status(400).json({ ok:false, error:'missing_input' });
    const system = 'Du bist ein prägnanter, hilfreicher Assistent. Antworte auf Deutsch, kurz und konkret.';
    const text = await completeText(input, { system, euOnly });
    res.json({ ok:true, result:text });
  } catch(e){ console.error('[run]', e); res.status(500).json({ ok:false, error:'run_failed' }); }
});

api.get('/run/stream', async (req, res) => {
  try{
    const input = (req.query?.q || '').toString().trim();
    const euOnly = String(req.query?.eu || process.env.EU_ONLY) === '1';
    if (!input){ res.writeHead(400); return res.end('missing q'); }
    res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':'*' });
    const system = 'Du bist ein prägnanter, hilfreicher Assistent. Antworte auf Deutsch, kurz und konkret.';
    await streamText(input, { system, euOnly }, (tok)=> res.write(`data: ${tok}\n\n`));
    res.write('data: [DONE]\n\n'); res.end();
  } catch(e){ console.error('[run/stream]', e); try{ res.write('data: [ERROR]\n\n'); res.end(); } catch{} }
});

api.post('/metrics', (req,res)=>{ if (process.env.METRICS==='console'){ console.log('[metrics]', req.body?.type, req.body?.meta||{}); } res.json({ok:true}); });

app.use('/api', api);
app.use('/_api', api);
app.use((req,res)=> res.status(404).json({ ok:false, error:'not_found' }));
app.listen(PORT, ()=> console.log(`[hohl.rocks-back] :${PORT}`));
