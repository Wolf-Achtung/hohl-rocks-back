# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import hashlib
import os
import re
from datetime import datetime, timezone, timedelta
from typing import Any, AsyncGenerator, Dict, Iterable, List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

# ---------------------------------------------------------------------------
# Config / helpers
# ---------------------------------------------------------------------------

def _env(name: str, default: Optional[str] = None) -> str:
    val = os.getenv(name, default if default is not None else "")
    return val

OPENAI_API_KEY = _env("OPENAI_API_KEY")
ANTHROPIC_API_KEY = _env("ANTHROPIC_API_KEY")
OPENROUTER_API_KEY = _env("OPENROUTER_API_KEY")
TAVILY_API_KEY = _env("TAVILY_API_KEY")
PERPLEXITY_API_KEY = _env("PERPLEXITY_API_KEY")

ALLOWED_ORIGINS = [o.strip() for o in _env("ALLOWED_ORIGINS", "").split(",") if o.strip()]
EU_ONLY = _env("EU_ONLY", "0") == "1"

SPARK_ENABLE = _env("SPARK_ENABLE", "true").lower() == "true"
SPARK_ROTATION = [x.strip() for x in _env("SPARK_ROTATION", "prompt,insight,tool,funding").split(",") if x.strip()]
SPARK_CACHE_TTL_SEC = int(_env("SPARK_CACHE_TTL_SEC", "86400"))

NEWS_TTL_HOURS = int(_env("NEWS_TTL_HOURS", "24"))
TIPS_TTL_HOURS = int(_env("TIPS_TTL_HOURS", "24"))

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def host_of(url: str) -> str:
    try:
        h = urlparse(url).hostname or ""
        return h.replace("www.", "")
    except Exception:
        return ""

# ---------------------------------------------------------------------------
# App init (CORS & Security)
# ---------------------------------------------------------------------------

app = FastAPI(title="hohl.rocks API", version="1.1.0")

# CORS: allow all if no allowlist is configured
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# News aggregation (Tavily + RSS fallback)
# ---------------------------------------------------------------------------

DEFAULT_QUERY = (
    "artificial intelligence OR generative ai OR llm OR machine learning "
    "-stocks -sport -gaming -movie"
)

RSS_SOURCES: List[tuple[str, str]] = [
    ("OpenAI", "https://openai.com/blog/rss.xml"),
    ("Google AI", "https://ai.googleblog.com/atom.xml"),
    ("DeepMind", "https://deepmind.google/discover/rss/"),
    ("Meta AI", "https://ai.facebook.com/blog/rss/"),
    ("Hugging Face", "https://huggingface.co/blog/rss.xml"),
    ("Stability AI", "https://stability.ai/blog/rss"),
    ("NVIDIA", "https://blogs.nvidia.com/feed/"),
    ("EU Commission", "https://ec.europa.eu/newsroom/sanco/rss.cfm?feed=5472"),
]

async def tavily_news(q: str, days: int, limit: int) -> List[Dict[str, Any]]:
    if not TAVILY_API_KEY:
        return []
    payload = {
        "api_key": TAVILY_API_KEY,
        "query": q or DEFAULT_QUERY,
        "search_depth": "advanced",
        "include_answer": False,
        "max_results": max(5, min(25, limit * 2)),
        "topic": "news",
        "days": max(1, min(30, days)),
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post("https://api.tavily.com/search", json=payload)
        r.raise_for_status()
        data = r.json()
    items: List[Dict[str, Any]] = []
    for it in data.get("results", []):
        url = it.get("url") or it.get("link")
        if not url:
            continue
        items.append(
            {
                "title": it.get("title") or host_of(url),
                "url": url,
                "host": host_of(url),
                "why": "Tavily",
                "published": it.get("published_date") or it.get("published_time") or None,
            }
        )
    return items

async def fetch_rss(client: httpx.AsyncClient, name: str, url: str) -> List[Dict[str, Any]]:
    try:
        r = await client.get(url, timeout=20)
        r.raise_for_status()
    except Exception:
        return []
    txt = r.text
    items: List[Dict[str, Any]] = []
    # Atom (<entry>)
    for m in re.finditer(r"<entry>(.*?)</entry>", txt, flags=re.DOTALL | re.IGNORECASE):
        entry = m.group(1)
        t = re.search(r"<title[^>]*>(.*?)</title>", entry, re.DOTALL | re.IGNORECASE)
        l = re.search(r"<link[^>]+href=['\"]([^'\"]+)['\"]", entry, re.IGNORECASE)
        p = re.search(r"<updated[^>]*>(.*?)</updated>", entry, re.IGNORECASE)
        title = (t.group(1).strip() if t else name).replace("\n", " ").strip()
        url = (l.group(1).strip() if l else "")
        items.append(
            {
                "title": title,
                "url": url,
                "host": host_of(url),
                "why": name,
                "published": p.group(1) if p else None,
            }
        )
    # RSS (<item>)
    for m in re.finditer(r"<item>(.*?)</item>", txt, flags=re.DOTALL | re.IGNORECASE):
        entry = m.group(1)
        t = re.search(r"<title[^>]*>(.*?)</title>", entry, re.DOTALL | re.IGNORECASE)
        l = re.search(r"<link[^>]*>(.*?)</link>", entry, re.DOTALL | re.IGNORECASE)
        p = re.search(r"<pubDate[^>]*>(.*?)</pubDate>", entry, re.IGNORECASE)
        title = (t.group(1).strip() if t else name).replace("\n", " ").strip()
        url = (l.group(1).strip() if l else "")
        items.append(
            {
                "title": title,
                "url": url,
                "host": host_of(url),
                "why": name,
                "published": p.group(1) if p else None,
            }
        )
    return items

async def rss_news(limit: int) -> List[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        tasks = [fetch_rss(client, n, u) for (n, u) in RSS_SOURCES]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    items: List[Dict[str, Any]] = []
    for r in results:
        if isinstance(r, list):
            items.extend(r)
    return items[: max(50, limit * 3)]

def dedup(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out = []
    for it in items:
        k = (it.get("title", "").strip().lower(), host_of(it.get("url", "")))
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    return out

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
                    r = await client.get(url, headers={"Range": "bytes=0-256"})
                    ok = r.status_code < 400
                except Exception:
                    ok = False
            if ok:
                out.append(it)
            if len(out) >= limit:
                break
    return out

# ---------------------------------------------------------------------------
# Spark feature (daily rotation with ETag)
# ---------------------------------------------------------------------------

def _sha1(obj: Any) -> str:
    h = hashlib.sha1(repr(obj).encode("utf-8")).hexdigest()
    return f'W/"{h}"'

def _ymd() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def _iso_plus(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

def curated(kind: str) -> Dict[str, Any]:
    base = {
        "prompt": {
            "date": _ymd(),
            "type": "prompt",
            "title": "Quick-Audit: Daten-Minimierung",
            "teaser": "Listen Sie 3 Felder auf, die Sie heute nicht mehr erheben müssen – und formulieren Sie die Löschregel.",
            "cta": {"label": "Mini-Check starten", "url": "/tools/mini-audit"},
            "source": "curated",
            "expires_at": _iso_plus(1),
            "trace_id": "spk_curated_prompt",
        },
        "insight": {
            "date": _ymd(),
            "type": "insight",
            "title": "Schneller Gewinn: Off-Texte versionieren",
            "teaser": "Standardisierte Off-Bausteine sparen Abnahme-Runden & senken Fehlerquote.",
            "cta": {"label": "Beispiel ansehen", "url": "/insights/off-bausteine"},
            "source": "curated",
            "expires_at": _iso_plus(1),
            "trace_id": "spk_curated_insight",
        },
        "tool": {
            "date": _ymd(),
            "type": "tool",
            "title": "Snippet-Generator für Datenschutzhinweise",
            "teaser": "In 2 Minuten DSGVO-Hinweis-Snippet für Formulare generieren.",
            "cta": {"label": "Jetzt generieren", "url": "/tools/dsgvo-snippet"},
            "source": "curated",
            "expires_at": _iso_plus(1),
            "trace_id": "spk_curated_tool",
        },
        "funding": {
            "date": _ymd(),
            "type": "funding",
            "title": "Förder-Spotlight: Digital-Bonus (DE)",
            "teaser": "Bis zu 50% Zuschuss für KI-Einführung – prüfen Sie Ihre Förderfähigkeit.",
            "cta": {"label": "Förder-Check", "url": "/foerderung/check"},
            "source": "curated",
            "expires_at": _iso_plus(1),
            "trace_id": "spk_curated_funding",
        },
        "event": {
            "date": _ymd(),
            "type": "event",
            "title": "Webinar: EU-AI-Act in 45 Min",
            "teaser": "Risikoklassen & Pflichten mit Praxisbeispielen – kompakt und konkret.",
            "cta": {"label": "Termin wählen", "url": "/events/ai-act-basics"},
            "source": "curated",
            "expires_at": _iso_plus(1),
            "trace_id": "spk_curated_event",
        },
    }
    return base.get(kind, base["prompt"])

_spark_cache: Dict[str, Any] = {"etag": None, "item": None, "expires_at": 0}

def _rotation_pick() -> str:
    idx = datetime.now(timezone.utc).day % max(1, len(SPARK_ROTATION))
    return SPARK_ROTATION[idx] if SPARK_ROTATION else "prompt"

async def get_today_spark(force_refresh: bool = False) -> Dict[str, Any]:
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    if not force_refresh and _spark_cache["item"] and _spark_cache["expires_at"] > now:
        return _spark_cache
    kind = _rotation_pick()
    item = curated(kind)
    etag = _sha1(item)
    _spark_cache.update({"item": item, "etag": etag, "expires_at": now + SPARK_CACHE_TTL_SEC * 1000})
    return _spark_cache

# ---------------------------------------------------------------------------
# LLM helpers (OpenAI streaming + simple completion fallback)
# ---------------------------------------------------------------------------

async def _openai_stream(prompt: str, system: Optional[str]) -> AsyncGenerator[str, None]:
    if not OPENAI_API_KEY:
        # Fallback: stream prompt echo
        for chunk in [prompt[i:i+64] for i in range(0, len(prompt), 64)] or ["Keine Eingabe."]:
            yield chunk
            await asyncio.sleep(0.02)
        return

    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "stream": True,
        "temperature": 0.7,
        "messages": ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}
        ],
    }
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", "https://api.openai.com/v1/chat/completions", headers=headers, json=payload) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line:
                    continue
                if not line.startswith("data:"):
                    continue
                data = line[len("data:"):].strip()
                if data == "[DONE]":
                    break
                try:
                    j = httpx.Response(200, json=None)  # dummy to access json() style
                except Exception:
                    pass
                # parse minimal JSON to get delta
                import json as _json
                try:
                    obj = _json.loads(data)
                    delta = (((obj or {}).get("choices") or [{}])[0] or {}).get("delta", {}).get("content")
                    if delta:
                        yield delta
                except Exception:
                    # ignore parse errors
                    pass

async def _openai_complete(prompt: str, system: Optional[str]) -> str:
    if not OPENAI_API_KEY:
        return f"Demo-Antwort (kein Provider): {prompt[:200]}"
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "temperature": 0.7,
        "messages": ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}
        ],
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    return (((data.get("choices") or [{}])[0]).get("message") or {}).get("content", "").strip() or "Keine Antwort."

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
async def root() -> Dict[str, Any]:
    return {"ok": True, "service": "hohl.rocks", "time": now_iso()}

@app.get("/api/self")
async def self_info() -> Dict[str, Any]:
    return {"ok": True, "time": now_iso()}

@app.post("/api/metrics")
async def metrics(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Minimal metrics intake (extend with real telemetry if needed)
    return {"ok": True, "received": payload, "time": now_iso()}

@app.get("/api/spark/today")
async def spark_today(if_none_match: Optional[str] = Header(default=None)) -> JSONResponse:
    if not SPARK_ENABLE:
        raise HTTPException(status_code=404, detail="Spark disabled")
    rec = await get_today_spark(False)
    if if_none_match and if_none_match == rec["etag"]:
        return JSONResponse(status_code=304, content=None)
    headers = {"ETag": rec["etag"], "Cache-Control": "public, max-age=300"}
    return JSONResponse(content=rec["item"], headers=headers)

@app.get("/api/tips")
async def tips() -> Dict[str, Any]:
    items = [
        {"title": "RAG ohne Halluzinationen: 7 harte Regeln", "url": "https://hohl.rocks/tips/rag-regeln.html", "why": "Best Practice"},
        {"title": "Eval-Pipeline für LLMs", "url": "https://hohl.rocks/tips/llm-eval.html", "why": "Quality"},
        {"title": "DPIA/DSFA kompakt für KI‑Features", "url": "https://hohl.rocks/tips/dpia.html", "why": "Compliance"},
        {"title": "Prompt‑Sicherheit: Guardrails & Moderation", "url": "https://hohl.rocks/tips/guardrails.html", "why": "Safety"},
        {"title": "Kosten runter: Caching & Mix‑of‑Models", "url": "https://hohl.rocks/tips/costs.html", "why": "Efficiency"},
    ]
    return {"items": items}

@app.get("/api/news")
async def news(q: Optional[str] = Query(None), days: int = 7, limit: int = 12) -> Dict[str, Any]:
    tav = await tavily_news(q or "", days, limit)
    rss = await rss_news(limit)
    merged = dedup(tav + rss)
    validated = await validate_urls(merged, limit)
    return {"items": validated}

@app.get("/api/news/summary")
async def news_summary(q: Optional[str] = Query(None), days: int = 7, limit: int = 8) -> Dict[str, Any]:
    items = (await news(q=q, days=days, limit=limit))["items"]
    if not PERPLEXITY_API_KEY or not items:
        return {"summary": None, "items": items}
    src = "\n".join(f"- {i['title']} {i['url']}" for i in items)
    prompt = f"Fasse diese aktuellen KI-News prägnant auf Deutsch zusammen und gruppiere nach Themen:\n{src}"
    payload = {
        "model": "sonar-small-online",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 400,
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

# LLM run (one-shot)
@app.post("/api/run")
async def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    user_input = (payload.get("input") or "").strip()
    if not user_input:
        raise HTTPException(400, "missing input")
    system = payload.get("system") or "Du bist ein prägnanter, hilfreicher Assistent. Antworte auf Deutsch, kurz und konkret."
    text = await _openai_complete(user_input, system)
    return {"ok": True, "result": text}

# LLM streaming (SSE)
async def _sse(iterable: AsyncGenerator[str, None]) -> AsyncGenerator[bytes, None]:
    async for chunk in iterable:
        yield f"data: {chunk}\n\n".encode("utf-8")
    yield b"data: [DONE]\n\n"

@app.get("/api/run/stream")
async def run_stream(q: str = Query(..., min_length=1)) -> StreamingResponse:
    system = "Du bist ein prägnanter, hilfreicher Assistent. Antworte auf Deutsch, kurz und konkret."
    stream = _openai_stream(q, system)
    headers = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # nginx
        "Access-Control-Allow-Origin": "*",
    }
    return StreamingResponse(_sse(stream), headers=headers)

# Alias for /api/sse used by older frontends
@app.get("/api/sse")
async def sse_alias(q: str = Query(..., min_length=1)) -> StreamingResponse:
    return await run_stream(q=q)
