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

/* ---------------- Tavily helpers (DACH Tipps/How-To Bias) ---------------- */
const DEFAULT_DOMAINS = (process.env.NEWS_DOMAINS || 'the-decoder.de,heise.de,golem.de,t3n.de,computerbase.de,chip.de,netzpolitik.org').split(',').map(s=>s.trim()).filter(Boolean);
const TTL_HOURS = Math.max(1, parseInt(process.env.NEWS_TTL_HOURS || '24', 10));
const CACHE_MS = TTL_HOURS * 60 * 60 * 1000;

const state = {
  cache: { ts: 0, key: '', items: [] },
  refreshing: false
};

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
function scoreItem(it){
  const h = hostOf(it.url);
  const weights = new Map([
    ['the-decoder.de', 9], ['heise.de', 8], ['golem.de', 8], ['t3n.de', 7],
    ['computerbase.de', 7], ['chip.de', 6], ['netzpolitik.org', 6],
    ['zeit.de', 5], ['handelsblatt.com', 5], ['wiwo.de', 5], ['spiegel.de', 5], ['faz.net', 5], ['nzz.ch', 5],
    ['computerwoche.de', 6], ['datenschutz-notizen.de', 6]
  ]);
  const title = (it.title||'').toLowerCase();
  const bonus = [
    /tipps|tricks|how[- ]?to|anleitung|praxis|so geht|leitfaden|guide/,
    /chatgpt|claude|mistral|llama|prompt/
  ].reduce((acc, re) => acc + (re.test(title) ? 2 : 0), 0);
  return (weights.get(h) || 1) + bonus;
}

async function tavily(query, domains, maxResults=8, ms=8000){
  const key = process.env.TAVILY_API_KEY; if (!key) return [];
  const { signal, cancel } = withTimeout(ms);
  try{
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key:key, query, search_depth:'advanced', include_domains:domains, max_results:Math.min(Math.max(maxResults,1),20), topic:'news', time_range:'w', include_answer:false }),
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
    const k = hostOf(it.url)+'|'+(it.title||'').slice(0,100);
    if (!seen.has(k)){ seen.add(k); out.push(it); }
  }
  return out;
}

async function refreshNews(doms){
  if (state.refreshing) return;
  state.refreshing = true;
  try{
    const queries = [
      'deutsch Tipps Tricks ChatGPT Prompts Praxis produktiver arbeiten Beispiele',
      'deutsch Anleitung How-to Claude Prompting Sicherheit Datenschutz',
      'deutsch Mistral LLM Einsatz im Alltag Best Practices',
      'deutsch Llama Open-Source KI lokal Tipps Datenschutz',
      'deutsch Praxis KI im Büro Automatisierung E-Mail Texte Tabellen'
    ];
    let merged = [];
    for (const q of queries){ const chunk = await tavily(q, doms, 8); merged = merged.concat(chunk); }
    let items = dedupe(merged);
    items.sort((a,b)=> scoreItem(b) - scoreItem(a));
    items = items.filter(it => /ki|künstliche intelligenz|chatgpt|claude|mistral|llama|prompt/i.test(it.title||''));
    items = items.slice(0, 18);
    state.cache = { ts: Date.now(), key: doms.join(','), items };
  } catch(e){ console.error('[news.refresh]', e); }
  finally { state.refreshing = false; }
}

const api = express.Router();

api.get('/news', async (req, res) => {
  try{
    const doms = (req.query.domains ? String(req.query.domains).split(',') : DEFAULT_DOMAINS).map(s=>s.trim()).filter(Boolean);
    const prefetch = String(req.query.prefetch||'0') === '1';
    const now = Date.now();
    const fresh = state.cache.items.length && (now - state.cache.ts) < CACHE_MS && state.cache.key === doms.join(',');

    if (!fresh && !state.refreshing){
      // Stale-While-Revalidate: starte Aktualisierung nebenläufig
      refreshNews(doms);
    }

    if (prefetch){
      // Prefetch-Antwort immer schnell; UI muss nicht warten
      return res.json({ ok: true, cached: !!state.cache.items.length, stale: !fresh, items: state.cache.items || [] });
    }

    // Normale Anforderung: Wenn wir Daten haben, liefere sofort; sonst kurze Wartezeit bis 6s
    if (state.cache.items.length){
      return res.json({ ok:true, items: state.cache.items, cached: fresh });
    }

    // Kalter Start: einmalig kurz warten
    const start = Date.now();
    while (!state.cache.items.length && (Date.now() - start) < 6000){
      await new Promise(r => setTimeout(r, 120));
    }
    return res.json({ ok:true, items: state.cache.items || [], cached: false });
  } catch(e){ console.error('[news]', e); res.json({ ok:true, items:[] }); }
});

api.get('/daily', async (_req, res) => {
  try {
    if (!state.cache.items?.length) {
      await refreshNews(DEFAULT_DOMAINS);
    }
    const picks = state.cache.items.slice(0, 6).map((it, i) => ({ title: i === 0 ? 'Spotlight' : `Lesenswert ${i}`, url: it.url }));
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
