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

/* ---------------- Tavily helpers (DACH) ---------------- */
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
function dedupe(items){
  const seen = new Set(); const out = [];
  for (const it of items){
    const k = hostOf(it.url)+'|'+(it.title||'').slice(0,120);
    if (!seen.has(k)){ seen.add(k); out.push(it); }
  }
  return out;
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

/* ---------------- Scoring / Filtering ---------------- */
function scoreTips(it){
  const h = hostOf(it.url);
  const weights = new Map([
    ['the-decoder.de', 9], ['heise.de', 8], ['golem.de', 8], ['t3n.de', 7],
    ['computerbase.de', 7], ['chip.de', 6], ['computerwoche.de', 6], ['datenschutz-notizen.de', 6]
  ]);
  const title = (it.title||'').toLowerCase();
  const bonus = [
    /tipps|tricks|how[- ]?to|anleitung|praxis|leitfaden|guide|so geht/,
    /chatgpt|claude|mistral|llama|prompt|prompts/
  ].reduce((acc, re) => acc + (re.test(title) ? 2 : 0), 0);
  return (weights.get(h) || 1) + bonus;
}
function scoreNews(it){
  const h = hostOf(it.url);
  const weights = new Map([
    ['heise.de', 9], ['golem.de', 8], ['t3n.de', 7], ['netzpolitik.org', 7],
    ['tagesschau.de', 7], ['zdf.de', 7], ['spiegel.de', 6], ['faz.net', 6],
    ['zeit.de', 6], ['nzz.ch', 6], ['srf.ch', 6], ['handelsblatt.com', 6], ['wiwo.de', 6]
  ]);
  const title = (it.title||'').toLowerCase();
  const bonus = [
    /eu ai act|gesetz|regulierung|sicherheit|security|risiko|update|release|neues modell|modell[- ]?update|schutz/,
    /ki|künstliche intelligenz|chatgpt|claude|mistral|llama/
  ].reduce((acc, re) => acc + (re.test(title) ? 2 : 0), 0);
  return (weights.get(h) || 1) + bonus;
}
function containsAI(title){
  return /ki|künstliche intelligenz|chatgpt|claude|mistral|llama|prompt|prompts/i.test(title||'');
}

/* ---------------- SWR caches ---------------- */
const newsState = { cache:{ ts:0, key:'', items:[] }, refreshing:false };
const tipsState = { cache:{ ts:0, key:'', items:[] }, refreshing:false };

async function refreshGeneric({ queries, domains, scoreFn, stateRef }){
  if (stateRef.refreshing) return;
  stateRef.refreshing = true;
  try{
    const results = await Promise.all(queries.map(q => tavily(q, domains, 8)));
    let merged = results.flat();
    merged = dedupe(merged).filter(it => containsAI(it.title));
    merged.sort((a,b)=> scoreFn(b)-scoreFn(a));
    stateRef.cache = { ts: Date.now(), key: domains.join(','), items: merged.slice(0, 20) };
  } catch(e){ console.error('[refreshGeneric]', e); }
  finally { stateRef.refreshing = false; }
}

/* ---------------- Routes ---------------- */
app.get('/api/tips', async (req, res) => {
  try{
    const doms = (process.env.TIPS_DOMAINS || 'the-decoder.de,heise.de,golem.de,t3n.de,computerbase.de,chip.de,computerwoche.de,datenschutz-notizen.de').split(',').map(s=>s.trim()).filter(Boolean);
    const ttlHours = Math.max(1, parseInt(process.env.TIPS_TTL_HOURS || '24', 10));
    const cacheMs = ttlHours * 60 * 60 * 1000;
    const prefetch = String(req.query.prefetch||'0') === '1';
    const now = Date.now();
    const fresh = tipsState.cache.items.length && (now - tipsState.cache.ts) < cacheMs && tipsState.cache.key === doms.join(',');
    const queries = [
      'deutsch Tipps Tricks ChatGPT Prompts Praxis produktiver arbeiten Beispiele',
      'deutsch Anleitung How-to Claude Prompting Sicherheit Datenschutz',
      'deutsch Mistral LLM Einsatz im Alltag Best Practices',
      'deutsch Llama Open-Source KI lokal Tipps Datenschutz',
      'deutsch Praxis KI im Büro Automatisierung E-Mail Texte Tabellen'
    ];

    if (!fresh && !tipsState.refreshing) refreshGeneric({ queries, domains: doms, scoreFn: scoreTips, stateRef: tipsState });
    if (prefetch) return res.json({ ok:true, cached: !!tipsState.cache.items.length, stale: !fresh, items: tipsState.cache.items });

    if (tipsState.cache.items.length) return res.json({ ok:true, items: tipsState.cache.items, cached:fresh });

    const start = Date.now();
    while (!tipsState.cache.items.length && (Date.now() - start) < 6000){ await new Promise(r => setTimeout(r, 120)); }
    return res.json({ ok:true, items: tipsState.cache.items || [], cached:false });
  } catch(e){ console.error('[tips]', e); res.json({ ok:true, items:[] }); }
});

app.get('/api/news', async (req, res) => {
  try{
    const doms = (process.env.NEWS_DOMAINS || 'heise.de,golem.de,t3n.de,netzpolitik.org,tagesschau.de,zdf.de,spiegel.de,faz.net,zeit.de,nzz.ch,srf.ch,handelsblatt.com,wiwo.de').split(',').map(s=>s.trim()).filter(Boolean);
    const ttlHours = Math.max(1, parseInt(process.env.NEWS_TTL_HOURS || '24', 10));
    const cacheMs = ttlHours * 60 * 60 * 1000;
    const prefetch = String(req.query.prefetch||'0') === '1';
    const now = Date.now();
    const fresh = newsState.cache.items.length && (now - newsState.cache.ts) < cacheMs && newsState.cache.key === doms.join(',');
    const queries = [
      'deutsch KI Regulierung EU AI Act Datenschutz Sicherheit aktuell',
      'deutsch KI Nachrichten neue Modelle Releases OpenAI Claude Mistral',
      'deutsch KI Sicherheit Prompt Injection Data Leakage Warnungen',
      'deutsch Behörden Politik Wirtschaft KI Einschätzungen Deutschland'
    ];

    if (!fresh && !newsState.refreshing) refreshGeneric({ queries, domains: doms, scoreFn: scoreNews, stateRef: newsState });
    if (prefetch) return res.json({ ok:true, cached: !!newsState.cache.items.length, stale: !fresh, items: newsState.cache.items });

    if (newsState.cache.items.length) return res.json({ ok:true, items: newsState.cache.items, cached:fresh });

    const start = Date.now();
    while (!newsState.cache.items.length && (Date.now() - start) < 6000){ await new Promise(r => setTimeout(r, 120)); }
    return res.json({ ok:true, items: newsState.cache.items || [], cached:false });
  } catch(e){ console.error('[news]', e); res.json({ ok:true, items:[] }); }
});

app.get('/api/daily', async (_req, res) => {
  try {
    // Daily priorisiert Tipps (Praxisnutzen)
    if (!tipsState.cache.items?.length) {
      const doms = (process.env.TIPS_DOMAINS || 'the-decoder.de,heise.de,golem.de,t3n.de,computerbase.de,chip.de,computerwoche.de,datenschutz-notizen.de').split(',').map(s=>s.trim()).filter(Boolean);
      await refreshGeneric({ queries: ['deutsch ChatGPT Tipps Tricks Praxis', 'deutsch Claude Prompting How-to', 'deutsch Mistral LLM Alltag Tipps'], domains: doms, scoreFn: scoreTips, stateRef: tipsState });
    }
    const picks = tipsState.cache.items.slice(0, 6).map((it, i) => ({ title: i === 0 ? 'Spotlight' : `Tipp ${i}`, url: it.url }));
    res.json({ ok: true, items: picks });
  } catch(e){ console.error('[daily]', e); res.json({ ok:true, items:[] }); }
});

/* --- LLM --- */
app.post('/api/run', async (req, res) => {
  try{
    const input = (req.body?.input || '').toString().trim();
    const euOnly = String(req.query?.eu || req.body?.eu || process.env.EU_ONLY) === '1';
    if (!input) return res.status(400).json({ ok:false, error:'missing_input' });
    const system = 'Du bist ein prägnanter, hilfreicher Assistent. Antworte auf Deutsch, kurz und konkret.';
    const text = await completeText(input, { system, euOnly });
    res.json({ ok:true, result:text });
  } catch(e){ console.error('[run]', e); res.status(500).json({ ok:false, error:'run_failed' }); }
});

app.get('/api/run/stream', async (req, res) => {
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

app.post('/api/metrics', (req,res)=>{ if (process.env.METRICS==='console'){ console.log('[metrics]', req.body?.type, req.body?.meta||{}); } res.json({ok:true}); });

// Alias
app.use('/_api', (req,res,next)=>{ req.url = req.originalUrl.replace(/^\/_api/, '/api'); next(); }, app._router);

app.use((req,res)=> res.status(404).json({ ok:false, error:'not_found' }));
app.listen(PORT, ()=> console.log(`[hohl.rocks-back] :${PORT}`));
