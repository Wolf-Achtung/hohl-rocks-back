import { Router } from 'express';
import { llmText as _llmText } from './share.llm.js';

const router = Router();
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || '';
const PERPLEXITY_MODEL   = process.env.PERPLEXITY_MODEL || 'sonar-pro';
const TAVILY_API_KEY     = process.env.TAVILY_API_KEY || '';

async function tavilySearch(query, maxResults = 8){
  if(!TAVILY_API_KEY) return [];
  const body = { api_key: TAVILY_API_KEY, query, max_results: maxResults, include_answer: false, search_depth: 'advanced' };
  const r = await fetch('https://api.tavily.com/search', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(!r.ok) return []; const j=await r.json();
  return (j.results||[]).map(it=>({ title: it.title, url: it.url })).filter(it=>!!it.url);
}

async function perplexityResearch(q){
  const body = { model: PERPLEXITY_MODEL, messages: [
    { role:'system', content:'Du bist ein präziser Recherche‑Assistent. Antworte auf Deutsch. Liste die Quellen als Links auf.'},
    { role:'user', content: q }
  ], return_citations: true };
  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+PERPLEXITY_API_KEY }, body: JSON.stringify(body)
  });
  if(!r.ok) throw new Error('perplexity_http_'+r.status);
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content || '';
  const cit = j?.citations || j?.choices?.[0]?.message?.citations || [];
  const sources = Array.isArray(cit) ? cit.map(u=>({ title: u, url: u })).slice(0,10) : [];
  return { answer: text, sources };
}

router.post('/', async (req,res)=>{
  try{
    const q = (req.body?.q||'').trim();
    if(!q) return res.status(400).json({ error:'missing_query' });
    if(PERPLEXITY_API_KEY){
      const out = await perplexityResearch(q); res.set('Cache-Control','public, max-age=60'); return res.json(out);
    }
    const results = await tavilySearch(q, 8);
    const ctx = results.map((r,i)=>`[${i+1}] ${r.title} – ${r.url}`).join('\n');
    const prompt = `Fasse folgende Quellen prägnant zusammen (Deutsch) und gib 5 Bulletpoints + 3 Links:\n${ctx}`;
    const answer = await _llmText(prompt, 0.3, 400, [{role:'user', content: prompt}], 'Du bist ein präziser Recherche‑Assistent.');
    return res.json({ answer, sources: results });
  }catch(e){ console.error('research error', e); res.status(500).json({ error: e?.message || 'research_failed' }); }
});

export default router;
