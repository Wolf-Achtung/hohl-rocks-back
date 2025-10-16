import { Router } from 'express';

export const router = Router();
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

async function tavilySearch(query, domains = [], maxResults = 12){
  if(!TAVILY_API_KEY) return [];
  const body = { api_key: TAVILY_API_KEY, query, max_results: maxResults, include_answer: false, search_depth: 'advanced', ...(domains.length?{include_domains:domains}:{}) };
  const r = await fetch('https://api.tavily.com/search', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(!r.ok) return [];
  const j = await r.json(); return (j.results||[]).map(it=>({ title: it.title, url: it.url })).filter(it=>!!it.url);
}
function isGermanHost(url=''){ try{ const u=new URL(url); return ['.de','.at','.ch'].some(tld=> u.hostname.endsWith(tld)); }catch{ return false; } }

router.get('/', async (_req,res)=>{
  try{
    const items = await tavilySearch('Künstliche Intelligenz News deutsch', [], 20);
    const sorted = [...items].sort((a,b)=> Number(isGermanHost(b.url)) - Number(isGermanHost(a.url)));
    res.set('Cache-Control','public, max-age=600'); res.json({ items: sorted.slice(0,12) });
  }catch(e){ console.error('news failed', e); res.status(500).json({ error:'news_failed' }); }
});

export async function handleDaily(_req,res){
  try{
    // simple rotation / fallback
    const H = new Date().getUTCHours();
    const topic = ['KI Sicherheit','KI Alltagstipps','KI Produkte','Agenten','Bildgeneratoren'][H % 5];
    const items = await tavilySearch(topic + ' deutsch', [], 15);
    if(items.length>0){ res.set('Cache-Control','public, max-age=600'); return res.json({ items: items.slice(0,8), at: Date.now() }); }
  }catch{}
  const fallback = [
    {title:"Mini‑Workshop: bessere User‑Storys (GWT)", url:"https://martinfowler.com/bliki/GivenWhenThen.html"},
    {title:"THE DECODER", url:"https://the-decoder.de/"},
    {title:"ZDF heute – KI", url:"https://www.zdfheute.de/thema/kuenstliche-intelligenz-ki-100.html"}
  ];
  res.json({ items: fallback, at: Date.now() });
}

router.get('/daily', handleDaily);

router.get('/top', (_req,res)=>{
  res.json([
    { "title": "Der Zeitreise-Tagebuch-Editor", "prompt": "Du bist ein Zeitreise-Editor..." },
    { "title": "Die Rückwärts-Zivilisation", "prompt": "Beschreibe eine Zivilisation..." }
  ]);
});

export default router;
