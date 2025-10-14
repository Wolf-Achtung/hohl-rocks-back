import { Router } from 'express';

const router = Router();
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

// Domains to bias towards DACH/EU tech/policy
const DACH_SITES = ['heise.de','golem.de','t3n.de','zeit.de','tagesschau.de','spiegel.de','handelsblatt.com','faz.net','br.de'];
const EU_SITES = ['europa.eu','edpb.europa.eu','edps.europa.eu','eur-lex.europa.eu','europarl.europa.eu'];
const AI_ACT_TERMS = ['EU AI Act','KI‑Verordnung','Hochrisiko‑KI','Transparenzpflicht','Konformitätsbewertung','CE‑Kennzeichnung'];
const SAFETY_TERMS = ['Deepfake','Phishing','Passkeys','2FA','Sicherheit','Datenschutz','DSGVO','Leak','Missbrauch','Warnung'];

function q(region='all'){
  const base = [...AI_ACT_TERMS, 'OpenAI', 'Anthropic', 'Google Gemini', 'LLM', 'KI', 'AI'].join(' OR ');
  if(region==='dach') return `${base} site:${DACH_SITES.join(' OR site:')}`;
  if(region==='eu') return `${base} site:${EU_SITES.join(' OR site:')}`;
  return base;
}

function uniq(items){
  const seen = new Set();
  return items.filter(x => {
    try {
      const u = new URL(x.url);
      const k = u.hostname + '|' + (x.title||'').trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    } catch { return false; }
  });
}

async function tavily(query, max=10){
  if (!TAVILY_API_KEY) return [];
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: TAVILY_API_KEY, query, topic:'news', search_depth:'basic', max_results:max })
  });
  if (!r.ok) throw new Error(`tavily_${r.status}`);
  const j = await r.json().catch(()=>({}));
  const items = Array.isArray(j.results) ? j.results.map(x => ({
    title: x.title, url: x.url, snippet: x.content, published: x.published_date || null
  })) : [];
  return items;
}

// /api/news/live?q=...&region=dach|eu|all
router.get('/live', async (req, res) => {
  try {
    const qUser = String(req.query.q || '').trim();
    const region = String(req.query.region || 'dach');
    const query = qUser || q(region);
    const main = await tavily(query, 12);
    const safety = await tavily(`${SAFETY_TERMS.join(' OR ')} site:${DACH_SITES.join(' OR site:')}`, 6);
    const items = uniq([...(main||[]), ...(safety||[])]).slice(0, 12);
    res.set('Cache-Control','public, max-age=120');
    res.json({ items });
  } catch (e) {
    console.error('news/live failed', e);
    res.status(500).json({ error: 'tavily_failed' });
  }
});

export default router;
