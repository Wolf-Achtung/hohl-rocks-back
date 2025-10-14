import { Router } from 'express';
const router = Router();

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

const DE_HOST_ENDS = ['.de','.at','.ch'];
const SECURITY_TERMS = [
  'KI Sicherheit','Künstliche Intelligenz Sicherheit','Deepfake','Phishing','Passwort','2FA','Datenschutz','DSGVO','Prompt Injection','Halluzination','Missbrauch','Warnung','Malware','Fake','Betrug','Sicherheitslücke'
];
const TIPS_TERMS = [
  'Tipps','Anleitung','Praxis','How-To','Beispiele','Alltag','Produktivität','ChatGPT Anleitung','Claude Anleitung','Mistral Anleitung','Prompts','Einstieg','Best Practices','Schnellstart'
];

const SOURCES_SECURITY = ['heise.de','golem.de','t3n.de','netzpolitik.org','bsi.bund.de','verbraucherzentrale.de','computerbild.de','chip.de'];
const SOURCES_TIPS     = ['t3n.de','heise.de','golem.de','basicthinking.de','blog.google','openai.com','anthropic.com','mistral.ai','medium.com','dev.to'];

function buildQuery(category) {
  const terms = category==='tips' ? TIPS_TERMS : SECURITY_TERMS;
  return `${terms.join(' OR ')} KI deutsch`;
}
function onlyGerman(items){
  return (items||[]).filter(x => {
    try { const u = new URL(x.url); return DE_HOST_ENDS.some(s => u.hostname.endsWith(s)); }
    catch { return false; }
  });
}
async function tavilySearch(query, includeDomains, max=16){
  if(!TAVILY_API_KEY) throw new Error('tavily_key_missing');
  const body = {
    api_key: TAVILY_API_KEY,
    query, topic: 'news', search_depth: 'advanced',
    include_domains: includeDomains,
    max_results: max, days: 21, include_answer: false
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
    const q = buildQuery(category);
    const domains = category==='tips' ? SOURCES_TIPS : SOURCES_SECURITY;
    let items = await tavilySearch(q, domains, 20);
    // Fallback: ohne Domain-Filter, dann .de/.at/.ch beschränken
    if(!items || items.length===0){
      items = onlyGerman(await tavilySearch(q, [], 20));
    }
    items = items.slice(0,12);
    res.set('Cache-Control','public, max-age=180');
    res.json({ items });
  }catch(e){
    console.error('news/live failed', e);
    res.status(500).json({ error:'news_failed' });
  }
});

export default router;
