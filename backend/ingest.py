"""Async news ingestion logic for hohl.rocks.

- Pulls AI-Act relevant headlines via Tavily (if API key present).
- Writes compact JSON snapshots to OUT_DIR (by date).
- Intended to run under AsyncIOScheduler without manual loop handling.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import httpx

logger = logging.getLogger(__name__)

DACH_SITES = ['heise.de','golem.de','t3n.de','tagesschau.de','spiegel.de','sueddeutsche.de','faz.net','zeit.de','derstandard.at','nzz.ch']

def build_query(region: str) -> str:
    base = '("EU AI Act" OR "AI Act" OR KI-Verordnung OR EU-KI-Gesetz OR KI-Gesetz)'
    if region == "eu":
        return base + ' AND (site:europa.eu OR site:ec.europa.eu OR site:eur-lex.europa.eu)'
    if region == "dach":
        return base + ' AND (site:de OR site:at OR site:ch)'
    return base + ' AND (site:de OR site:at OR site:ch OR site:europa.eu OR site:ec.europa.eu)'

def filter_ai_act(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    terms = ['eu ai act', 'ai act', 'ki-gesetz', 'ki verordnung', 'ai-verordnung', 'eu-ki-gesetz']
    out: list[dict[str, Any]] = []
    for it in items:
        text = f"{it.get('title','')} {it.get('content','')}".lower()
        if any(t in text for t in terms):
            out.append(it)
    return out

async def fetch_tavily(client: httpx.AsyncClient, api_key: str, query: str) -> list[dict[str, Any]]:
    r = await client.post("https://api.tavily.com/search", json={
        "query": query, "search_depth": "advanced", "max_results": 12
    }, headers={"X-Tavily-Api-Key": api_key, "Content-Type": "application/json"})
    r.raise_for_status()
    data = r.json()
    items: list[dict[str, Any]] = []
    for res in data.get("results", []):
        items.append({
            "title": res.get("title"),
            "url": res.get("url"),
            "snippet": res.get("content"),
            "published": res.get("published_date") or None,
        })
    return items

async def ingest_all_sources(out_dir: Path, api_key: str | None, region: str, timeout_s: int) -> dict[str, Any]:
    """Fetch, filter and persist a compact snapshot. Returns stats dict."""
    out_dir.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "region": region,
        "items": []
    }
    if not api_key:
        logger.info("No TAVILY_API_KEY set; writing empty snapshot.")
        path = out_dir / f"news-{region}-{datetime.now().strftime('%Y%m%dT%H%M%SZ')}.json"
        path.write_text(json.dumps(snapshot), encoding="utf-8")
        return {"items": 0, "saved": str(path)}

    query = build_query(region)
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_s)) as client:
        try:
            raw = await fetch_tavily(client, api_key, query)
            filtered = filter_ai_act(raw)
            # de-dup by title
            seen = set()
            final: list[dict[str, Any]] = []
            for it in filtered:
                t = (it.get("title") or "").strip()
                if not t or t in seen:
                    continue
                seen.add(t)
                final.append(it)
            snapshot["items"] = final[:20]
        except httpx.HTTPError as exc:
            logger.error("fetch failed: %s", exc)
            snapshot["items"] = []

    path = out_dir / f"news-{region}-{datetime.now().strftime('%Y%m%dT%H%M%SZ')}.json"
    path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
    logger.info("snapshot saved: %s items=%d", path, len(snapshot["items"]))
    return {"items": len(snapshot["items"]), "saved": str(path)}
