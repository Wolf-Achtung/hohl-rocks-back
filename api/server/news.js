import { Router } from 'express';
const router = Router();

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

// Kuratierte DACH-Quellen (KI-Sicherheit / Tipps)
const DOMAINS_CORE = [
  "heise.de", "golem.de", "t3n.de", "chip.de", "netzwelt.de",
  "bsi.bund.de", "kuketz-blog.de", "netzpolitik.org",
  "futurezone.at", "derstandard.at", "orf.at",
  "nzz.ch", "srf.ch", "inside-it.ch", "pctipp.ch"
];

const SECURITY_TERMS = [
  "KI Sicherheit", "Deepfake", "Phishing", "Passwort", "2FA", "Datenschutz",
  "DSGVO", "Prompt Injection", "Halluzination", "Missbrauch", "Warnung",
  "Schadsoftware", "Fake", "Betrug", "Sicherheitslücke"
];
const TIPS_TERMS = [
  "Tipps", "Anleitung", "Praxis", "How-To", "Beispiele", "Alltag", "Produktivität",
  "ChatGPT Anleitung", "Claude Anleitung", "Mistral Anleitung", "Prompts", "Einstieg", "Shortcut"
];

function pickQuery(category) {
  const base = category==='tips' ? TIPS_TERMS : SECURITY_TERMS;
  // Tavily versteht umfangreiche Strings gut; „deutsch“ + Modellnamen hinzufügen
  return `${base.join(' OR ')} deutsch ChatGPT Claude Mistral`;
}

async function tavilySearch(query, includeDomains=[], max=14){
  if(!TAVILY_API_KEY) throw new Error('tavily_key_missing');
  const body = {
    api_key: TAVILY_API_KEY,
    query,
    topic: 'news',
    search_depth: 'advanced',
    max_results: max,
    days: 14,
    include_domains: includeDomains
  };
  const r = await fetch('https://api.tavily.com/search', {
    method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if(!r.ok) throw new Error('tavily_'+r.status);
  const j = await r.json().catch(()=>({}));
  const results = Array.isArray(j.results) ? j.results.map(x => ({
    title: x.title, url: x.url, snippet: x.content, published: x.published_date||null
  })) : [];
  return results;
}

router.get('/live', async (req,res)=>{
  try{
    const category = String(req.query.category||'security');
    const q = pickQuery(category);
    // 1) Versuche nur kuratierte DACH-Domains
    let items = await tavilySearch(q, DOMAINS_CORE, 18);
    // 2) Fallback: ohne Domainfilter
    if(!items || items.length<4) items = await tavilySearch(q, [], 18);
    // 3) Dedup hosts & sort by recency if dates available
    const seen = new Set(); const dedup=[];
    for(const it of items){
      try{
        const host = new URL(it.url).hostname.replace(/^www\./,'');
        if(seen.has(host)) continue; seen.add(host); dedup.push(it);
      }catch{ dedup.push(it); }
    }
    res.set('Cache-Control','public, max-age=180');
    res.json({ items: dedup.slice(0,12) });
  }catch(e){
    console.error('news/live failed', e);
    res.status(500).json({ error:'news_failed' });
  }
});

export default router;
