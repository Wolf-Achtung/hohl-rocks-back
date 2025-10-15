import { Router } from 'express';

const router = Router();
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

async function tavilySearch(query, domains = [], maxResults = 10){
  if(!TAVILY_API_KEY) return [];
  const body = {
    api_key: TAVILY_API_KEY,
    query,
    max_results: maxResults,
    include_answer: false,
    search_depth: 'advanced',
    ...(domains.length ? { include_domains: domains } : {}),
  };
  const r = await fetch('https://api.tavily.com/search', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  if(!r.ok) return [];
  const j = await r.json();
  const items = (j.results||[]).map(it=>({ title: it.title, url: it.url })).filter(it=>!!it.url);
  return items;
}

function isGermanHost(url=''){
  try{
    const u = new URL(url);
    return ['.de','.at','.ch'].some(tld => u.hostname.endsWith(tld));
  }catch{ return false; }
}

router.get('/', async (_req,res)=>{
  try{
    const q = 'Künstliche Intelligenz News deutsch';
    const items = await tavilySearch(q, [], 20);
    const sorted = [...items].sort((a,b)=> Number(isGermanHost(b.url)) - Number(isGermanHost(a.url)));
    res.set('Cache-Control','public, max-age=600');
    res.json({ items: sorted.slice(0,12) });
  }catch(e){
    console.error('news failed', e);
    res.status(500).json({ error:'news_failed' });
  }
});

router.get('/daily', async (_req,res)=>{
  try{
    const hour = new Date().getUTCHours();
    const topic = ['KI Sicherheit','KI Alltagstipps','KI Produkte','Agenten','Bildgeneratoren'][hour % 5];
    const items = await tavilySearch(topic + ' deutsch', [], 15);
    res.set('Cache-Control','public, max-age=600');
    res.json({ items: items.slice(0,8) });
  }catch(e){
    console.error('daily failed', e);
    res.status(500).json({ error:'daily_failed' });
  }
});

router.get('/top', (_req,res)=>{
  res.json([
    { "title": "Der Zeitreise-Tagebuch-Editor", "prompt": "Du bist ein Zeitreise-Editor. Ich gebe dir ein normales Tagebuch aus 2024, und du schreibst es um, als würde es aus dem Jahr 2084 stammen. Berücksichtige technologische Entwicklungen, gesellschaftliche Veränderungen und neue Probleme, die wir heute noch nicht kennen. Behalte die emotionale Authentizität bei, aber transformiere alle Referenzen." },
    { "title": "Die Rückwärts-Zivilisation", "prompt": "Beschreibe eine Zivilisation, die sich rückwärts durch die Zeit entwickelt – sie beginnt technologisch hochentwickelt und wird mit jedem Jahrhundert primitiver. Erkläre ihre Philosophie, warum sie diesen Weg gewählt haben, und wie ihr Alltag aussieht." },
    { "title": "Das Bewusstsein eines Gebäudes", "prompt": "Schreibe aus der Perspektive eines 200 Jahre alten Gebäudes, das langsam ein Bewusstsein entwickelt hat. Es kann nicht sprechen, nur durch kleine architektonische Veränderungen kommunizieren. Erzähle von seinen Beobachtungen über die Menschen, die in ihm leben." },
    { "title": "Der KI-Philosophie-Mentor", "prompt": "Du bist ein alt-griechischer Philosoph, der plötzlich in 2024 aufwacht und erst langsam die moderne Welt versteht. Führe ein sokratisches Gespräch mit mir über moderne Technologie, aber bleibe dabei in deinem antiken Charakter. Stelle Fragen, die mich zum Nachdenken bringen." },
    { "title": "Der Interdimensionale Marktplatz-Guide", "prompt": "Ich bin ein Besucher auf einem interdimensionalen Marktplatz. Du bist mein Guide und beschreibst mir die verschiedenen Stände, Händler aus anderen Universen und ihre unmöglichen Waren. Lasse mich Entscheidungen treffen und reagiere darauf." }
  ]);
});

export default router;
