/**
 * Tavily-backed News & Daily
 * Caches for 12h in-memory
 */
import express from "express";

export const newsRouter = express.Router();

let cacheNews = {ts:0, items:[]};
let cacheDaily = {ts:0, items:[]};

const DACH_DOMAINS = [
  "www.heise.de","www.tagesschau.de","www.zeit.de","www.srf.ch","www.zdf.de","www.derstandard.de",
  "www.welt.de","www.spiegel.de","www.handelsblatt.com","www.20min.ch","www.nzz.ch","the-decoder.de"
];

newsRouter.get("/", async (req,res)=>{
  try{
    const items = await getNews();
    res.json({ok:true, items});
  }catch(e){
    res.status(500).json({ok:false, error:"news_failed"});
  }
});

export async function getDaily(){
  const age = Date.now() - (cacheDaily.ts||0);
  if(age < 1000*60*60*12 && cacheDaily.items?.length) return cacheDaily.items;
  const query = "KI Tipps Sicherheit praktische neue Funktionen ChatGPT Claude deutsch";
  const raw = await tavilySearch(query, 12);
  const items = raw.map(r=>({title:r.title, url:r.url})).slice(0,8);
  cacheDaily = {ts:Date.now(), items};
  return items;
}

async function getNews(){
  const age = Date.now() - (cacheNews.ts||0);
  if(age < 1000*60*60*12 && cacheNews.items?.length) return cacheNews.items;
  const query = "Künstliche Intelligenz News Sicherheit Funktionen ChatGPT Claude deutsch";
  const raw = await tavilySearch(query, 18);
  const filtered = raw.filter(r=> DACH_DOMAINS.some(d=> r.url.includes(d)) );
  const items = filtered.map(r=>({title:r.title, url:r.url})).slice(0,12);
  cacheNews = {ts:Date.now(), items};
  return items;
}

async function tavilySearch(query, max=10){
  const key = process.env.TAVILY_API_KEY || "";
  if(!key) return [];
  const body = {
    api_key: key,
    query,
    search_depth: "basic",
    include_answer: false,
    max_results: max,
    days: 7,
    // Prefer DACH content if possible
    include_domains: DACH_DOMAINS
  };
  const res = await fetch("https://api.tavily.com/search", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(body)
  });
  if(!res.ok) return [];
  const data = await res.json().catch(()=>({results:[]}));
  return data.results || [];
}
