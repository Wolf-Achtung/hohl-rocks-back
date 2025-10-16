import express from "express";
const router = express.Router();

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const DACH = [
  "tagesschau.de","zdf.de","zdfheute.de","heise.de","srf.ch","zeit.de",
  "spiegel.de","the-decoder.de","welt.de","20min.ch","nzz.ch","derstandard.at","orf.at"
];

function isDach(url="") {
  try {
    const u = new URL(url);
    return u.hostname.endsWith(".de") || u.hostname.endsWith(".ch") || u.hostname.endsWith(".at")
      || DACH.some(d => u.hostname === d || u.hostname.endsWith("."+d));
  } catch { return false; }
}

async function tavily(query, includeDomains=[], max=18) {
  if (!TAVILY_API_KEY) return [];
  const body = {
    api_key: TAVILY_API_KEY,
    query,
    max_results: max,
    search_depth: "advanced",
    include_answer: false,
    ...(includeDomains.length ? { include_domains: includeDomains } : {})
  };
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify(body)
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.results || []).map(it => ({ title: it.title, url: it.url })).filter(Boolean);
}

router.get("/", async (_req,res) => {
  try {
    const results = await tavily("Künstliche Intelligenz Nachrichten deutsch", DACH, 24);
    const sorted = [...results].sort((a,b)=> Number(isDach(b.url)) - Number(isDach(a.url)));
    res.set("Cache-Control","public, max-age=600");
    return res.json({ items: sorted.slice(0,14) });
  } catch (e) {
    // Fallback curated list
    return res.json({ items: [
      {title:"Künstliche Intelligenz – aktuelle Nachrichten | tagesschau.de", url:"https://www.tagesschau.de/thema/k%C3%BCnstliche_intelligenz"},
      {title:"ZDFheute – KI", url:"https://www.zdfheute.de/thema/kuenstliche-intelligenz-ki-100.html"},
      {title:"THE DECODER", url:"https://the-decoder.de/"},
      {title:"heise – KI", url:"https://www.heise.de/thema/Kuenstliche-Intelligenz"},
      {title:"SRF Wissen – KI", url:"https://www.srf.ch/wissen/kuenstliche-intelligenz"}
    ]});
  }
});

const DAILY = [
  {title:"Heute neu: Realitäts‑Debugger als Bubble"},
  {title:"Tipp: 5‑Why für Root‑Cause in 3 Minuten"},
  {title:"Micro‑Workshop: bessere User‑Storys (GWT)"}
];

router.get("/daily", (_req,res)=> res.json({ items: DAILY, at: Date.now() }));

export default router;
