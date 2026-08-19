# Steckbrief hohl-rocks-back

**Letzter Wartungsdurchgang:** 2026-08-19
**API-Version:** 2.8.0 · **Deploy:** Railway (Nixpacks) · **Start:** `node server.js`

Dieser Steckbrief hält fest, was verfällt: Laufzeit, Modelle, Variablen.
Prüfe ihn bei jedem Wartungsdurchgang gegen den Code und gegen die
Anbieter-Dokumentation. Trage danach das neue Datum ein.

---

## Laufzeit

| Wo | Wert |
|---|---|
| `package.json` → `engines.node` | `>=22.0.0` |
| `.node-version` | `22` |
| `nixpacks.toml` | `nodejs_22` |

Alle drei Stellen müssen dieselbe Hauptversion nennen. Weichen sie ab,
wählt Railway eine andere Version als gedacht.

**Node 22:** Maintenance LTS bis **2027-04-30**.
**Node 20:** seit 2026-04-30 End-of-Life. Am 2026-08-19 abgelöst.

Nächster Schritt: vor April 2027 auf Node 24 (Active LTS bis 2028-04-30).

---

## Modell-IDs

Jede ID lässt sich per Umgebungsvariable wechseln. Ein Anbieter kann ein
Modell abkündigen, ohne dass jemand Code ändert.

| Anbieter | Variable | Default | Stand 2026-08-19 |
|---|---|---|---|
| Anthropic | `CLAUDE_MODEL` | `claude-sonnet-5` | aktuell, kein Abschaltdatum |
| OpenAI | `OPENAI_MODEL` | `gpt-5-mini` | Alias ohne Datum. Siehe Warnung unten. |
| Perplexity | `PERPLEXITY_MODEL` | `sonar-pro` | aktuell, kein Abschaltdatum |
| Google | `GEMINI_MODEL` | `gemini-3.5-flash` | GA seit 2026-05-19, kein Abschaltdatum |

**Warnung OpenAI:** OpenAI entfernt den Snapshot `gpt-5-mini-2025-08-07` am
**2026-12-11**. Der Alias `gpt-5-mini` bleibt erreichbar, zeigt danach aber
auf ein anderes Modell. Der Vergleich läuft dann weiter — mit einem Modell,
das niemand ausgewählt hat. Vor Dezember 2026 entscheiden: Snapshot pinnen
oder Nachfolger benennen.

**Anzeigenamen:** `CLAUDE_MODEL_NAME` und die drei Geschwister steuern, was
im Vergleich über der Antwort steht. Wer eine Modell-ID wechselt, wechselt
den Namen mit. Sonst beschriftet die Seite eine Antwort falsch.

**Thinking:** `src/services/ai-clients.js` sendet `thinking: {type:
"disabled"}`. Modelle, die Thinking erzwingen (etwa `claude-fable-5`),
lehnen das mit HTTP 400 ab. Zeigt `CLAUDE_MODEL` auf ein solches Modell,
entferne den Parameter.

**API-Versionen:** Gemini läuft über `/v1beta/`. Google kündigt dafür kein
Abschaltdatum an; die eigenen SDKs von Google nutzen denselben Kanal.

---

## Umgebungsvariablen

Der Code liest genau diese 17. Jede steht in `.env.example`.

### Pflicht

| Variable | Wirkung, wenn sie fehlt |
|---|---|
| `ANTHROPIC_API_KEY` | Der Prozess beendet sich beim Start (nur bei `NODE_ENV=production`). |

### Optional, mit Default

| Variable | Default |
|---|---|
| `PORT` | `8080` (Railway setzt sie selbst) |
| `NODE_ENV` | `development` |
| `CLAUDE_MODEL` | `claude-sonnet-5` |
| `OPENAI_MODEL` | `gpt-5-mini` |
| `PERPLEXITY_MODEL` | `sonar-pro` |
| `GEMINI_MODEL` | `gemini-3.5-flash` |
| `CLAUDE_MODEL_NAME` | `Claude Sonnet 5` |
| `OPENAI_MODEL_NAME` | `GPT-5 Mini` |
| `PERPLEXITY_MODEL_NAME` | `Perplexity Sonar Pro` |
| `GEMINI_MODEL_NAME` | `Gemini 3.5 Flash` |
| `ALLOWED_ORIGINS` | leer — fünf feste Herkünfte gelten immer (`src/config/env.js`) |
| `NEWS_DOMAINS` | leer — die KI-News-Suche sucht dann ohne Einschränkung |

### Optional, ohne Default

| Variable | Wirkung, wenn sie fehlt |
|---|---|
| `OPENAI_API_KEY` | GPT fällt im Vergleich aus. Die drei anderen antworten. |
| `PERPLEXITY_API_KEY` | Perplexity fällt aus. `/api/news` antwortet mit HTTP 503. |
| `GEMINI_API_KEY` | Gemini fällt im Vergleich aus. |
| `ADMIN_API_KEY` | `/api/admin/*` antwortet mit HTTP 503. |

### Nicht mehr gelesen

`DATABASE_URL` und `DB_SSL_REJECT_UNAUTHORIZED`. Die Datenbank ist
abgeschafft (`src/config/chatLog.js`). Stehen die beiden noch in Railway,
lösche sie dort. Eine gesetzte `DATABASE_URL` ist ein Zugangsdatum ohne
Verbraucher.

---

## Datenhaltung

Gespräche liegen nur im Arbeitsspeicher, gedeckelt auf 1000 Einträge, und
sind nach einem Neustart fort. Keine IP, kein User-Agent. Es gibt keine
Datenbank und keinen Postgres-Treiber mehr.

---

## Prüfen

```bash
npm ci
npm test      # 154 Tests
npm run lint  # 0 Befunde
npm audit --omit=dev
```

**Offener Befund im Audit:** `@anthropic-ai/sdk` 0.82.0, moderate
(GHSA-p7fg-763f-g4gf). Die Lücke sitzt im Local Filesystem Memory Tool.
Dieser Code ruft das Tool nirgends auf. Die Behebung verlangt den Sprung
auf 0.119.0 — ein Major-Schritt, nicht nebenbei zu machen.

---

## Bekannte Altlasten

**Sechs Routen ohne Aufrufer im Frontend:** `/api/prompt-generator`,
`/api/prompt-optimizer`, `/api/daily-challenge`, `/api/submit-challenge`,
`/api/prompts`, `/api/spark/today`. Die ersten vier rufen Claude auf und
kosten damit Geld. Alle sind ratenbegrenzt, die Challenge zusätzlich pro
Tag gecacht. Entscheide bei Gelegenheit: Frontend nachziehen oder Routen
entfernen.
