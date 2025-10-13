"""Async APScheduler entrypoint for hohl.rocks ingest.

Fixes the "RuntimeError: no running event loop" by using AsyncIOScheduler and
declaring async job functions directly (no create_task in scheduler thread).
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import load_settings
from .ingest import ingest_all_sources

LOG_FMT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"

def setup_logging(level: str) -> None:
    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO),
                        format=LOG_FMT)

async def run_once() -> None:
    settings = load_settings()
    await ingest_all_sources(Path(settings.out_dir), settings.tavily_api_key, settings.region, settings.timeout_s)

def build_scheduler(loop: asyncio.AbstractEventLoop) -> AsyncIOScheduler:
    settings = load_settings()
    scheduler = AsyncIOScheduler(event_loop=loop)
    trigger = CronTrigger.from_crontab(settings.cron)
    # Schedule the coroutine directly; AsyncIOScheduler runs it in the loop.
    scheduler.add_job(ingest_all_sources, trigger, id="ingest", kwargs=dict(
        out_dir=Path(settings.out_dir),
        api_key=settings.tavily_api_key,
        region=settings.region,
        timeout_s=settings.timeout_s
    ))
    return scheduler

def main() -> None:
    settings = load_settings()
    setup_logging(settings.log_level)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    scheduler = build_scheduler(loop)
    scheduler.start()

    # run one ingest shortly after start (don't block startup)
    loop.create_task(run_once())

    stop = asyncio.Event()

    def _graceful(*_):
        logging.getLogger(__name__).info("received stop signal; shutting down...")
        stop.set()

    # Graceful shutdown on SIGTERM/SIGINT
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, _graceful)
        except NotImplementedError:
            # Windows
            signal.signal(sig, lambda *_: _graceful())

    try:
        loop.run_until_complete(stop.wait())
    finally:
        scheduler.shutdown(wait=False)
        loop.stop()
        loop.close()

if __name__ == "__main__":
    main()
