import { Router } from 'express';

const router = Router();
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

const DACH_SITES = ['heise.de','golem.de','t3n.de','zeit.de','tagesschau.de','spiegel.de','handelsblatt.com','faz.net','br.de'];
const EU_SITES = ['europa.eu','edpb.europa.eu','edps.europa.eu','eur-lex.europa.eu','parlament.europa.eu'];
const AI_ACT_TERMS = ['EU AI Act','KI-Verordnung','Hochrisiko-KI','Transparenzpflicht','Konformitätsbewertung','CE-Kennzeichnung'];

function boostQuery(region='all'){
  const base = AI_ACT_TERMS.join(' OR ');
  if(region==='dach') return `${base} site:${DACH_SITES.join(' OR site:')}`;
  if(region==='eu') return `${base} site:${EU_SITES.join(' OR site:')}`;
  return base;
}
function dedupe(items){
  const seen = new Set(); const out=[];
  for(const it of items){
    let host=''; try{ host=new URL(it.url).hostname.replace(/^www\./,''); }catch{}
    const key=(String(it.title||'').toLowerCase().slice(0,160)+'|'+host);
    if(seen.has(key)) continue; seen.add(key); out.push(it);
  } return out;
}

// Simple in-memory cache
const cache = new Map(); // key -> {ts,data}
const TTL = 1000 * 120; // 2 minutes

router.get('/news/live', async (req, res) => {
  try {
    const region = (req.query.region || 'all').toString();
    const key = `live:${region}`;
    const now = Date.now();
    const hit = cache.get(key);
    if(hit && now - hit.ts < TTL){
      res.set('X-Cache','HIT'); res.set('Cache-Control','public, max-age=60');
      return res.json(hit.data);
    }

    const q = boostQuery(region);
    if(!TAVILY_API_KEY) return res.json({ items: [] });
    const r = await fetch('https://api.tavily.com/search',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: q,
        search_depth: 'advanced',
        max_results: 24
      })
    });
    const j = await r.json().catch(()=>({}));
    const itemsRaw = Array.isArray(j.results) ? j.results.map(x => ({
      title: x.title, url: x.url, snippet: x.content, published: x.published_date || null
    })) : [];
    const items = dedupe(itemsRaw);
    const payload = { items };
    cache.set(key, { ts: now, data: payload });
    res.set('X-Cache','MISS'); res.set('Cache-Control','public, max-age=120');
    res.json(payload);
  } catch (e) {
    console.error('news/live failed', e);
    res.status(500).json({ error: 'tavily_failed' });
  }
});

export default router;
