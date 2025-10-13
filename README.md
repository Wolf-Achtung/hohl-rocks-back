# hohlrocks-ingest 1.4.2

Async APScheduler‑Job für News‑Snapshots (EU AI Act, DACH/EU).

## Start lokal
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m backend.scheduler
```

## ENV
- `TAVILY_API_KEY` (optional -> sonst leere Snapshots)
- `INGEST_REGION` = `dach` | `eu` | `all` (default: dach)
- `INGEST_CRON`   = Crontab‑Syntax (default: `0 */6 * * *`)
- `OUT_DIR`       = Zielordner für JSON (default: `/app/data`)
- `LOG_LEVEL`     = INFO|DEBUG...

## Deploy (Railway, separater Service empfohlen)
- **Image**: Dockerfile im Ordner
- **Command**: `python -m backend.scheduler`
- **Health**: optional (nicht erforderlich)
```
