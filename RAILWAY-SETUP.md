# Railway Setup – hohl.rocks (Monorepo)

Dieses Repository enthält **zwei** Services:

1. **API (Node/Express)** – Verzeichnis `api/`
   - Start: `node server/index.js`
   - Health: `/healthz`, `/api/healthz`
   - Endpunkt: `/api/news/live?region=all|dach|eu`
   - Env:
     - `ALLOWED_ORIGINS="https://hohl.rocks,https://www.hohl.rocks"`
     - `TAVILY_API_KEY=...`

2. **Ingest (Python Worker)** – vorhandener Code im Root (`backend/`, `scheduler.py`)
   - Start: `python -m backend.scheduler`
   - Keine Public Domain nötig

## Deployment-Empfehlung
- **Railway Service 1 (api)**: Root Directory auf `api` setzen; Start: `node server/index.js`.
- **Railway Service 2 (ingest)**: Root auf Repo-Root setzen; Start: `python -m backend.scheduler`.

> Hinweis: Die API liefert `/healthz` und `/api/healthz`. Wenn dieser Check 200 liefert, funktioniert der Netlify-Proxy `/_api/*` zuverlässig.
