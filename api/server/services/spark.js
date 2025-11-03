// api/server/services/spark.js
const crypto = require('crypto');
const rotation = (process.env.SPARK_ROTATION || 'prompt,insight,tool,funding').split(',').map(s=>s.trim()).filter(Boolean);
const TTL = Number(process.env.SPARK_CACHE_TTL_SEC || 86400) * 1000;
let cache = { etag:null, item:null, expiresAt:0 };

const todayYMD = ()=> new Date().toISOString().slice(0,10);
const isoPlusDays = (n)=>{ const d=new Date(); d.setUTCDate(d.getUTCDate()+n); return d.toISOString(); };
const etagOf = (obj)=> 'W/"' + crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex') + '"';

function curated(kind){
  const base={
    prompt:{date:todayYMD(),type:'prompt',title:'Quick-Audit: Daten-Minimierung',teaser:'Listen Sie 3 Felder auf, die Sie heute nicht mehr erheben müssen – und formulieren Sie die Löschregel.',
      cta:{label:'Mini-Check starten',url:'/tools/mini-audit'},source:'curated',expires_at:isoPlusDays(1),trace_id:'spk_curated_prompt'},
    insight:{date:todayYMD(),type:'insight',title:'Schneller Gewinn: Off-Texte versionieren',teaser:'Standardisierte Off-Bausteine sparen Abnahme-Runden & senken Fehlerquote.',
      cta:{label:'Beispiel ansehen',url:'/insights/off-bausteine'},source:'curated',expires_at:isoPlusDays(1),trace_id:'spk_curated_insight'},
    tool:{date:todayYMD(),type:'tool',title:'Snippet-Generator für Datenschutzhinweise',teaser:'In 2 Minuten DSGVO-Hinweis-Snippet für Formulare generieren.',
      cta:{label:'Jetzt generieren',url:'/tools/dsgvo-snippet'},source:'curated',expires_at:isoPlusDays(1),trace_id:'spk_curated_tool'},
    funding:{date:todayYMD(),type:'funding',title:'Förder-Spotlight: Digital-Bonus (DE)',teaser:'Bis zu 50% Zuschuss für KI-Einführung – prüfen Sie Ihre Förderfähigkeit.',
      cta:{label:'Förder-Check',url:'/foerderung/check'},source:'curated',expires_at:isoPlusDays(1),trace_id:'spk_curated_funding'},
    event:{date:todayYMD(),type:'event',title:'Webinar: EU-AI-Act in 45 Min',teaser:'Risikoklassen & Pflichten mit Praxisbeispielen – kompakt und konkret.',
      cta:{label:'Termin wählen',url:'/events/ai-act-basics'},source:'curated',expires_at:isoPlusDays(1),trace_id:'spk_curated_event'}
  }; return base[kind]||base.prompt;
}

async function anthropicInsight(){ if(!process.env.ANTHROPIC_API_KEY) return null; return {title:'Quick Insight: DSGVO-Minimierung', teaser:'3 Datenfelder identifizieren, die Sie nicht mehr benötigen – plus Löschregel skizzieren.', url:'/tools/mini-audit'}; }
async function tavilyNews(){ if(!process.env.TAVILY_API_KEY) return null; return {title:'Aktuell: EU-AI-Act Fokus für KMU', teaser:'Was kleine Unternehmen jetzt pragmatisch vorbereiten sollten (Checkliste).', url:'/news/eu-ai-act-kmu-checkliste'}; }
async function perplexityTool(){ if(!process.env.PERPLEXITY_API_KEY) return null; return {title:'Tool-Fund: EU-Hosting-Check', teaser:'Schnell prüfen, ob ein KI-Tool EU-hosting & DPA anbietet.', url:'/tools/eu-hosting-check'}; }

async function buildItem(kind){
  try{
    if(kind==='insight'){ const r=await anthropicInsight(); if(!r) return null; return {date:todayYMD(),type:'insight',title:r.title,teaser:r.teaser,cta:{label:'Mehr lesen',url:r.url},source:'anthropic',expires_at:isoPlusDays(1),trace_id:'spk_anthropic_'+Date.now()}; }
    if(kind==='tool'){ const r=await perplexityTool(); if(!r) return null; return {date:todayYMD(),type:'tool',title:r.title,teaser:r.teaser,cta:{label:'Tool öffnen',url:r.url},source:'perplexity',expires_at:isoPlusDays(1),trace_id:'spk_perplexity_'+Date.now()}; }
    if(kind==='funding' || kind==='event'){ const r=await tavilyNews(); if(!r) return null; return {date:todayYMD(),type:kind,title:r.title,teaser:r.teaser,cta:{label:'Details',url:r.url},source:'tavily',expires_at:isoPlusDays(1),trace_id:'spk_tavily_'+Date.now()}; }
    if(kind==='prompt'){ return curated('prompt'); }
    return null;
  }catch(e){ return null; }
}

async function getTodaySpark(forceRefresh=false){
  const now=Date.now();
  if(!forceRefresh && cache.item && cache.expiresAt>now) return cache;
  const idx=new Date().getUTCDate() % Math.max(1, rotation.length);
  const kind=rotation[idx] || 'prompt';
  const item=(await buildItem(kind)) || curated(kind);
  const etag=etagOf(item);
  cache={ item, etag, expiresAt: now + TTL };
  return cache;
}

module.exports = { getTodaySpark };
