'use strict';

const DEFAULT_NEWS_LIMIT = 12;

function parseCsv(str) {
  if (!str) return [];
  return String(str).split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

async function fetchNewsTavily({ apiKey, domainsCsv }) {
  const include_domains = parseCsv(domainsCsv);
  if (!apiKey || include_domains.length === 0) return [];

  // Sehr konservative Query – Tavily News/Recent Search
  const body = {
    query: "Aktuelle KI-News und Veröffentlichungen (DACH)",
    search_depth: "basic",
    include_domains,
    max_results: DEFAULT_NEWS_LIMIT
  };

  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error("Tavily error " + resp.status + " " + txt.slice(0,200));
  }
  const data = await resp.json();
  // Defensive extraction
  const results = Array.isArray(data.results) ? data.results : (Array.isArray(data.answers) ? data.answers : []);
  const items = [];
  for (const r of results) {
    const title = r.title || r.name || r.question || null;
    const url = r.url || r.link || null;
    if (title && url) items.push({ title, url });
    if (items.length >= DEFAULT_NEWS_LIMIT) break;
  }
  return items;
}

async function fetchNewsFallback(domainsCsv) {
  // Minimaler Fallback – zeigt, dass der Endpoint funktioniert (kein 404)
  const domains = parseCsv(domainsCsv);
  return domains.slice(0,5).map((d, i) => ({
    title: `News-Fallback #${i+1} – Domain ${d}`,
    url: `https://${d}/`
  }));
}

async function getNews({ tavilyKey, domainsCsv }) {
  try {
    const items = await fetchNewsTavily({ apiKey: tavilyKey, domainsCsv });
    if (items.length > 0) return items;
    return await fetchNewsFallback(domainsCsv);
  } catch(e) {
    return await fetchNewsFallback(domainsCsv);
  }
}

module.exports = { getNews };
