import { Router } from 'express';
const router = Router();

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

// German focus
const DE_HOST_ENDS = ['.de','.at','.ch'];
const SECURITY_TERMS = [
  'KI Sicherheit','Deepfake','Phishing','Passwort','2FA','Datenschutz','DSGVO','Prompt Injection','Halluzination','Missbrauch','Warnung','Schadsoftware','Fake','Betrug'
];
const TIPS_TERMS = [
  'Tipps','Anleitung','Praxis','How-To','Beispiele','Alltag','Produktivität','ChatGPT Anleitung','Claude Anleitung','Mistral Anleitung','Prompts','Einstieg'
];

function pickQuery(category) {
  const base = category==='tips' ? TIPS_TERMS : SECURITY_TERMS;
  // Query in Deutsch formulieren, so kommen überwiegend dt. Treffer
  return `${base.join(' OR ')} KI deutsch`;
}

function onlyGerman(items){
  return (items||[]).filter(x => {
    try {
      const u = new URL(x.url); return DE_HOST_ENDS.some(s => u.hostname.endsWith(s));
    } catch { return false; }
  });
}

async function tavilySearch(query, max=12){
  if(!TAVILY_API_KEY) throw new Error('tavily_key_missing');
  const body = {
    api_key: TAVILY_API_KEY,
    query, topic: 'news', search_depth: 'basic',
    max_results: max, // fewer is faster
    days: 10, // last days
    include_domains: [],
    exclude_domains: []
  };
  const r = await fetch('https://api.tavily.com/search', {
    method:'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
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
    const items = onlyGerman(await tavilySearch(q, 16)).slice(0,12);
    res.set('Cache-Control','public, max-age=120');
    res.json({ items });
  }catch(e){
    console.error('news/live failed', e);
    res.status(500).json({ error:'news_failed' });
  }
});

export default router;
