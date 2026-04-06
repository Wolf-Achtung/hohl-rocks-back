# Frontend-Briefing: HOHL.ROCKS Backend API v2.8.0

> **Stand:** 2026-04-06  
> **Backend-Version:** 2.8.0  
> **Base-URL Production:** `https://[railway-domain].railway.app`  
> **Base-URL Development:** `http://localhost:8080`

---

## 1. Übersicht der Endpoints

### Kritisch (Hauptfeature)

| Endpoint | Method | Rate Limit | Auth | Beschreibung |
|---|---|---|---|---|
| `/api/model-battle` | POST | 10/min | - | 4 KI-Modelle parallel vergleichen |

### Chat

| Endpoint | Method | Rate Limit | Auth | Beschreibung |
|---|---|---|---|---|
| `/api/chat` | POST | 30/min | - | Single-Model Chat (Claude) |

### Content (Read-only)

| Endpoint | Method | Rate Limit | Auth | Beschreibung |
|---|---|---|---|---|
| `/api/prompts` | GET | 60/min | - | Prompt-Bibliothek (paginiert) |
| `/api/prompts/:id` | GET | 60/min | - | Einzelnen Prompt laden |
| `/api/news` | GET | 60/min | - | KI-News (tägl. rotierend) |
| `/api/spark/today` | GET | - | - | Tägliche Inspiration |
| `/api/daily-challenge` | GET | - | - | Tägliche Challenge |

### Prompt Tools

| Endpoint | Method | Rate Limit | Auth | Beschreibung |
|---|---|---|---|---|
| `/api/prompt-generator` | POST | 20/min | - | 5 Prompt-Styles generieren |
| `/api/prompt-optimizer` | POST | 20/min | - | Prompt analysieren & optimieren |
| `/api/submit-challenge` | POST | - | - | Challenge-Antwort einreichen |

### GDPR / Nutzerdaten

| Endpoint | Method | Rate Limit | Auth | Beschreibung |
|---|---|---|---|---|
| `/api/my-data` | GET | 10/min | Cookie | Eigene Chat-History |
| `/api/my-data` | DELETE | 10/min | Cookie | Eigene Daten löschen |

### System

| Endpoint | Method | Beschreibung |
|---|---|---|
| `/` | GET | Status-Check |
| `/health` | GET | Detaillierter Health-Check |
| `/api/self` | GET | API-Capabilities & Endpoints |

---

## 2. HAUPTFEATURE: Model Battle (`POST /api/model-battle`)

### Request

```json
POST /api/model-battle
Content-Type: application/json

{
  "prompt": "Erkläre mir den Unterschied zwischen Machine Learning und Deep Learning"
}
```

**Validierung:**
- `prompt` ist Pflichtfeld (string, nicht leer)
- Max. 2000 Zeichen
- Min. 3 Zeichen nach Sanitization (HTML-Tags werden entfernt)

### Response (Erfolg)

```json
{
  "success": true,
  "partialFailure": false,
  "prompt": "Erkläre mir den Unterschied zwischen Machine Learning und Deep Learning",
  "responses": [
    {
      "model": "claude",
      "name": "Claude Sonnet 4",
      "response": "Machine Learning ist ein Teilgebiet...",
      "responseTime": 2341,
      "success": true
    },
    {
      "model": "gpt",
      "name": "GPT-4o Mini",
      "response": "Der Hauptunterschied liegt...",
      "responseTime": 1892,
      "success": true
    },
    {
      "model": "perplexity",
      "name": "Perplexity Sonar Pro",
      "response": "Deep Learning ist eine Unterklasse...",
      "responseTime": 3102,
      "success": true
    },
    {
      "model": "gemini",
      "name": "Gemini 2.0 Flash",
      "response": "Um den Unterschied zu verstehen...",
      "responseTime": 1567,
      "success": true
    }
  ],
  "meta": {
    "successfulModels": 4,
    "totalModels": 4,
    "avgResponseTime": 2225
  },
  "timestamp": "2026-04-06T12:00:00.000Z"
}
```

### Response (Teilweiser Ausfall / Graceful Degradation)

```json
{
  "success": true,
  "partialFailure": true,
  "prompt": "...",
  "responses": [
    {
      "model": "claude",
      "name": "Claude Sonnet 4",
      "response": "Antwort...",
      "responseTime": 2341,
      "success": true
    },
    {
      "model": "gpt",
      "name": "GPT-4o Mini",
      "response": null,
      "error": "Zeitüberschreitung",
      "responseTime": 60000,
      "success": false
    },
    {
      "model": "perplexity",
      "name": "Perplexity Sonar Pro",
      "response": null,
      "error": "Service vorübergehend nicht verfügbar",
      "responseTime": 312,
      "success": false
    },
    {
      "model": "gemini",
      "name": "Gemini 2.0 Flash",
      "response": null,
      "error": "API Key nicht konfiguriert",
      "responseTime": 0,
      "success": false
    }
  ],
  "meta": {
    "successfulModels": 1,
    "totalModels": 4,
    "avgResponseTime": 15663
  },
  "timestamp": "..."
}
```

### Frontend-Implementierung: Empfehlungen

```typescript
// TypeScript Interfaces für das Frontend

interface BattleResponse {
  model: "claude" | "gpt" | "perplexity" | "gemini";
  name: string;
  response: string | null;
  error?: string;
  responseTime: number;
  success: boolean;
}

interface ModelBattleResult {
  success: boolean;            // true wenn mindestens 1 Modell antwortet
  partialFailure: boolean;     // true wenn nicht alle 4 erfolgreich
  prompt: string;
  responses: BattleResponse[];
  meta: {
    successfulModels: number;
    totalModels: number;
    avgResponseTime: number;
  };
  timestamp: string;
}
```

**Wichtig für Frontend:**

1. **Immer `responses` Array iterieren** — es enthält immer 4 Einträge (eine pro Modell)
2. **`success` pro Response prüfen** — `response` ist `null` bei `success: false`
3. **`error` Feld anzeigen** bei fehlgeschlagenen Modellen
4. **Mögliche Fehlermeldungen:**
   - `"Zeitüberschreitung"` — Modell hat nach 60s nicht geantwortet
   - `"Service vorübergehend nicht verfügbar"` — API-Fehler
   - `"API Key nicht konfiguriert"` — Backend-Konfiguration fehlt
5. **Loading-State:** Request kann bis zu 60 Sekunden dauern (API-Timeout)
6. **Rate-Limit (429):** Max 10 Requests/Minute — Retry-After Header beachten

---

## 3. Chat Endpoint (`POST /api/chat`)

### Request

```json
POST /api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "system", "content": "Du bist ein hilfreicher KI-Assistent auf hohl.rocks" },
    { "role": "user", "content": "Was ist Prompt Engineering?" },
    { "role": "assistant", "content": "Prompt Engineering ist..." },
    { "role": "user", "content": "Kannst du ein Beispiel geben?" }
  ],
  "model": "claude"
}
```

**Validierung:**
- `messages` ist Pflichtfeld (Array)
- Mindestens 1 User-Nachricht
- Max. 4000 Zeichen gesamt
- `model` ist optional (Default: "claude")

### Response

```json
{
  "success": true,
  "response": "Hier ist ein Beispiel für Prompt Engineering...",
  "model": "claude",
  "responseTime": 1823,
  "timestamp": "..."
}
```

### Content Moderation Response

```json
{
  "success": true,
  "response": "Das ist nicht mein Thema. Frag mich lieber was über KI, meine Arbeit oder den SC Freiburg! ⚽",
  "model": "moderation",
  "flagged": true,
  "timestamp": "..."
}
```

**Frontend-Logik:** Wenn `model === "moderation"` → Antwort als Hinweis stylen, nicht als KI-Antwort.

---

## 4. CORS & Authentifizierung

### Erlaubte Origins

- `localhost:3000`, `localhost:5173`, `localhost:8080`
- `hohl.rocks`, `www.hohl.rocks`
- `*.netlify.app` (Preview-Deployments)
- `*.railway.app` (Preview-Deployments)
- Custom via `ALLOWED_ORIGINS` Env-Variable

### Cookies

- **`chat_session`**: Wird automatisch gesetzt (httpOnly, secure in Production)
- Für GDPR-Endpoints (`/api/my-data`) notwendig
- Frontend muss `credentials: 'include'` bei fetch setzen:

```javascript
fetch('/api/chat', {
  method: 'POST',
  credentials: 'include',  // WICHTIG für Session-Cookie
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: [...] })
});
```

---

## 5. Error-Handling (einheitlich)

### HTTP Status Codes

| Code | Bedeutung | Wann |
|---|---|---|
| 200 | Erfolg | Normale Antwort |
| 400 | Bad Request | Fehlende/ungültige Parameter |
| 401 | Unauthorized | Admin ohne gültigen Key |
| 404 | Not Found | Unbekannte Route |
| 429 | Too Many Requests | Rate-Limit überschritten |
| 500 | Server Error | Interner Fehler |
| 503 | Service Unavailable | Admin nicht konfiguriert |

### Rate-Limit Response (429)

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Max 10 requests per minute.",
  "retryAfter": 42,
  "timestamp": "..."
}
```

**Frontend:** `retryAfter` (Sekunden) verwenden, um User zu informieren.

### Generische Error Response

```json
{
  "error": "Error type",
  "message": "Beschreibung des Fehlers",
  "timestamp": "..."
}
```

---

## 6. Prompt Library (`GET /api/prompts`)

### Query-Parameter

| Parameter | Typ | Default | Beschreibung |
|---|---|---|---|
| `category` | string | - | Filter: creative, business, technical, education, writing, ai, communication, data, marketing, productivity, design, innovation |
| `search` | string | - | Volltext-Suche in Titel, Prompt, Tags |
| `sort` | string | - | `rating`, `uses`, `newest` |
| `page` | number | 1 | Seite |
| `limit` | number | 20 | Items pro Seite (max 50) |

### Response

```json
{
  "success": true,
  "count": 20,
  "prompts": [
    {
      "id": 1,
      "title": "Story Architect",
      "prompt": "Du bist ein erfahrener Story-Architekt...",
      "category": "creative",
      "tags": ["storytelling", "content", "marketing"],
      "rating": 4.8,
      "uses": 1247,
      "author": "hohl.rocks",
      "featured": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 30,
    "pages": 2
  },
  "categories": ["creative", "business", "technical", ...],
  "timestamp": "..."
}
```

---

## 7. News & Spark

### News Response (`GET /api/news`)

```json
{
  "success": true,
  "items": [
    {
      "title": "Claude 4 Sonnet erreicht neue Benchmark-Rekorde",
      "url": "https://www.anthropic.com/news/claude-4",
      "summary": "Anthropics neuestes Modell...",
      "source": "Anthropic",
      "date": "2025-11-06",
      "category": "model-release"
    }
  ],
  "pagination": { "page": 1, "limit": 6, "total": 6, "pages": 1 },
  "lastUpdated": "..."
}
```

**Compact-Mode für Mobile:** `GET /api/news?compact=true` → Kurzformat (`t`, `d`, `u`, `s`)

### Spark Response (`GET /api/spark/today`)

```json
{
  "success": true,
  "spark": "KI ist nicht die Zukunft. KI ist jetzt.",
  "author": "hohl.rocks",
  "category": "mindset",
  "date": "2026-04-06",
  "sparkNumber": 1,
  "totalSparks": 30,
  "timestamp": "..."
}
```

---

## 8. Bekannte Einschränkungen & Hinweise

### Model Battle - Was beachten?

1. **Timeout:** Einzelne Modelle können bis zu 60s brauchen. Das Frontend sollte einen Loading-State zeigen und idealerweise progressive Updates ermöglichen.
2. **Graceful Degradation:** Nicht alle 4 Modelle antworten immer erfolgreich. Das Frontend MUSS damit umgehen, dass `response: null` und `success: false` auftreten kann.
3. **Rate-Limiting:** 10 Requests/Minute. Frontend sollte einen Cooldown-Timer anzeigen, wenn 429 zurückkommt.

### Chat

1. **Session-Cookie notwendig** für Logging und GDPR-Features
2. **Content Moderation** kann Nachrichten abfangen — Frontend erkennt das an `model: "moderation"` und `flagged: true`

### Allgemein

1. **Alle Timestamps sind ISO 8601 UTC** (`2026-04-06T12:00:00.000Z`)
2. **Alle Antworten haben `success: boolean`** — außer Error-Responses (nutzen `error` Feld)
3. **Security Headers:** Backend setzt X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy

---

## 9. Frontend-Empfehlungen

### Für Model Battle UI:

```
┌──────────────────────────────────────────────────┐
│  [Prompt-Eingabefeld]                    [Battle!]│
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌─────────────┐  ┌─────────────┐                │
│  │ Claude       │  │ GPT-4o Mini │                │
│  │ Sonnet 4     │  │             │                │
│  │ ⏱️ 2.3s      │  │ ⏱️ 1.9s     │                │
│  │              │  │             │                │
│  │ [Antwort]    │  │ [Antwort]   │                │
│  └─────────────┘  └─────────────┘                │
│  ┌─────────────┐  ┌─────────────┐                │
│  │ Perplexity   │  │ Gemini      │                │
│  │ Sonar Pro    │  │ 2.0 Flash   │                │
│  │ ⏱️ 3.1s      │  │ ⏱️ 1.6s     │                │
│  │              │  │             │                │
│  │ [Antwort]    │  │ [Antwort]   │                │
│  └─────────────┘  └─────────────┘                │
│                                                   │
│  Durchschnittliche Antwortzeit: 2.2s  (4/4 ✓)   │
└──────────────────────────────────────────────────┘
```

### Bei Fehlern einzelner Modelle:

```
┌─────────────┐
│ GPT-4o Mini  │
│ ⚠️ Fehler    │
│              │
│ Zeitüber-    │
│ schreitung   │
│              │
│ [Retry?]     │
└─────────────┘
```

### Loading-State empfohlen:

- Skelett-Loader für jede Model-Karte
- Timer anzeigen wie lange schon geladen wird
- Nach 30s Hinweis: "Einige Modelle brauchen etwas länger..."
- Nach 60s: "Timeout für langsame Modelle, Ergebnisse werden geladen..."

---

## 10. Migrations-Checkliste (Frontend)

- [ ] `credentials: 'include'` bei allen fetch-Aufrufen setzen
- [ ] Model Battle Response-Struktur anpassen (neues `meta` Feld, `partialFailure`)
- [ ] Graceful Degradation implementieren (einzelne Modell-Fehler anzeigen)
- [ ] Rate-Limit Handling (429 Response → Cooldown-Timer)
- [ ] Security: Keine API-Keys im Frontend speichern
- [ ] Content Moderation: `model: "moderation"` erkennen und anders darstellen
- [ ] Error-States für alle Endpoints implementieren
- [ ] Loading-States mit Timeout-Hinweisen
