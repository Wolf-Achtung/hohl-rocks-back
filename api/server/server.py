files["backend/server.py"] = r"""# backend/server.py (UTF-8)
from __future__ import annotations
import os, re, asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY", "")

app = FastAPI(title="hohl.rocks API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

def host_of(url: str) -> str:
    try:
        h = urlparse(url).hostname or ""
        return h.replace("www.", "")
    except Exception:
        return ""

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

DEFAULT_QUERY = (
    "artificial intelligence OR generative ai OR llm OR machine learning "
    "-stocks -sport -gaming -movie"
)

async def tavily_news(q: str, days: int, limit: int) -> List[Dict[str, Any]]:
    if not TAVILY_API_KEY:
        return []
    payload = {
        "api_key": TAVILY_API_KEY,
        "query": q or DEFAULT_QUERY,
        "search_depth": "advanced",
        "include_answer": False,
        "max_results": max(5, min(25, limit*2)),
        "topic": "news",
        "days": max(1, min(30, days))
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post("https://api.tavily.com/search", json=payload)
        r.raise_for_status()
        data = r.json()
    items = []
    for it in data.get("results", []):
        url = it.get("url") or it.get("link")
        if not url: 
            continue
        items.append({
            "title": it.get("title") or host_of(url),
            "url": url,
            "host": host_of(url),
            "why": "Tavily",
            "published": it.get("published_date") or it.get("published_time") or None
        })
    return items

RSS_SOURCES = [
    # solide, eher langlebig – nur als Fallback
    ("OpenAI", "https://openai.com/blog/rss.xml"),
    ("Google AI", "https://ai.googleblog.com/atom.xml"),
    ("DeepMind", "https://deepmind.google/discover/rss/"),
    ("Meta AI", "https://ai.facebook.com/blog/rss/"),
    ("Hugging Face", "https://huggingface.co/blog/rss.xml"),
    ("Stability AI", "https://stability.ai/blog/rss"),
    ("NVIDIA", "https://blogs.nvidia.com/feed/"),
    ("EU Commission", "https://ec.europa.eu/newsroom/sanco/rss.cfm?feed=5472"),
]

async def fetch_rss(client: httpx.AsyncClient, name: str, url: str) -> List[Dict[str, Any]]:
    try:
        r = await client.get(url, timeout=20)
        r.raise_for_status()
    except Exception:
        return []
    # naive RSS/Atom-Extraktion (ohne zusätzliche Lib, robust genug)
    txt = r.text
    items = []
    # Atom <entry>
    for m in re.finditer(r"<entry>(.*?)</entry>", txt, flags=re.DOTALL|re.IGNORECASE):
        entry = m.group(1)
        t = re.search(r"<title[^>]*>(.*?)</title>", entry, re.DOTALL|re.IGNORECASE)
        l = re.search(r"<link[^>]+href=['\"]([^'\"]+)['\"]", entry, re.IGNORECASE)
        p = re.search(r"<updated[^>]*>(.*?)</updated>", entry, re.IGNORECASE)
        title = (t.group(1).strip() if t else name).replace("\n"," ").strip()
        url = (l.group(1).strip() if l else "")
        items.append({"title": title, "url": url, "host": host_of(url), "why": name, "published": (p.group(1) if p else None)})
    # RSS <item>
    for m in re.finditer(r"<item>(.*?)</item>", txt, flags=re.DOTALL|re.IGNORECASE):
        entry = m.group(1)
        t = re.search(r"<title[^>]*>(.*?)</title>", entry, re.DOTALL|re.IGNORECASE)
        l = re.search(r"<link[^>]*>(.*?)</link>", entry, re.DOTALL|re.IGNORECASE)
        p = re.search(r"<pubDate[^>]*>(.*?)</pubDate>", entry, re.IGNORECASE)
        title = (t.group(1).strip() if t else name).replace("\n"," ").strip()
        url = (l.group(1).strip() if l else "")
        items.append({"title": title, "url": url, "host": host_of(url), "why": name, "published": (p.group(1) if p else None)})
    return items

async def rss_news(limit: int) -> List[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        tasks = [fetch_rss(client, n, u) for (n,u) in RSS_SOURCES]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    items: List[Dict[str, Any]] = []
    for r in results:
        if isinstance(r, list): items.extend(r)
    return items[: max(50, limit*3)]

async def validate_urls(items: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
        for it in items:
            url = it.get("url")
            if not url: 
                continue
            ok = False
            try:
                r = await client.head(url)
                ok = r.status_code < 400
            except Exception:
                try:
                    r = await client.get(url, headers={"Range":"bytes=0-256"})
                    ok = r.status_code < 400
                except Exception:
                    ok = False
            if ok:
                out.append(it)
            if len(out) >= limit:
                break
    return out

def dedup(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out = []
    for it in items:
        k = (it.get("title","").strip().lower(), host_of(it.get("url","")))
        if k in seen: 
            continue
        seen.add(k)
        out.append(it)
    return out

@app.get("/api/self")
async def self() -> Dict[str, Any]:
    return {"ok": True, "time": now_iso()}

@app.post("/api/metrics")
async def metrics(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Minimal Logging (kann an echte Telemetrie angeschlossen werden)
    return {"ok": True, "received": payload, "time": now_iso()}

@app.get("/api/spark/today")
async def spark_today() -> Dict[str, Any]:
    # Kein harter Fehler, falls nichts da – Frontend zeigt nette Fallback-Message.
    return {"title": "Spotlight", "text": None, "ok": True}

@app.get("/api/tips")
async def tips() -> Dict[str, Any]:
    items = [
        {"title":"RAG ohne Halluzinationen: 7 harte Regeln", "url":"https://hohl.rocks/tips/rag-regeln.html", "why":"Best Practice"},
        {"title":"Eval-Pipeline für LLMs: von Gold‑Sets bis LLM‑as‑Judge", "url":"https://hohl.rocks/tips/llm-eval.html", "why":"Quality"},
        {"title":"DPIA/DSFA kompakt für KI‑Features", "url":"https://hohl.rocks/tips/dpia.html", "why":"Compliance"},
        {"title":"Prompt‑Sicherheit: Guardrails & Moderation", "url":"https://hohl.rocks/tips/guardrails.html", "why":"Safety"},
        {"title":"Kosten runter: Caching, Routing, Mix‑of‑Models", "url":"https://hohl.rocks/tips/costs.html", "why":"Efficiency"},
    ]
    return {"items": items}

@app.get("/api/news")
async def news(q: Optional[str] = Query(None), days: int = 7, limit: int = 12) -> Dict[str, Any]:
    # 1) Tavily (wenn Schlüssel vorhanden)
    tav = await tavily_news(q or "", days, limit)
    # 2) RSS als Fallback+Diversität
    rss = await rss_news(limit)
    merged = dedup(tav + rss)
    validated = await validate_urls(merged, limit)
    return {"items": validated}

# Optional: Zusammenfassung via Perplexity (nicht vom Frontend benötigt)
@app.get("/api/news/summary")
async def news_summary(q: Optional[str] = Query(None), days: int = 7, limit: int = 8) -> Dict[str, Any]:
    items = (await news(q=q, days=days, limit=limit))["items"]
    if not PERPLEXITY_API_KEY or not items:
        return {"summary": None, "items": items}
    # Kompakte Quellenliste an Perplexity schicken
    src = "\n".join(f"- {i['title']} {i['url']}" for i in items)
    prompt = f"Fasse diese aktuellen KI-News prägnant auf Deutsch zusammen und gruppiere nach Themen:\n{src}"
    payload = {
        "model": "sonar-small-online",  # kompatibler Online-Search-Endpoint
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 400
    }
    headers = {"Authorization": f"Bearer {PERPLEXITY_API_KEY}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            r = await client.post("https://api.perplexity.ai/chat/completions", json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content")
            return {"summary": content, "items": items}
    except Exception:
        return {"summary": None, "items": items}
"""