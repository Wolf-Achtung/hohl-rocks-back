// ===================================================================
// ENVIRONMENT & CONSTANTS
// ===================================================================

export const PORT = process.env.PORT || 8080;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

// API Configuration
export const API_VERSION = "2.8.0";
export const API_TIMEOUT = 60000; // 60s timeout for AI API calls
export const MAX_MEMORY_LOGS = 1000;
export const MAX_EXPORT_ROWS = 10000;

// AI Models (all overridable via env so a provider deprecating a model
// doesn't require a code change + redeploy, only an env var update)
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
export const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || "sonar-pro";
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

// Der Name, der im Vergleich ueber der Antwort steht. Bisher stand er als
// Literal im Code, waehrend die Modell-ID darueber per ENV wechseln konnte -
// ein Wechsel auf gemini-3.6-flash liess die Spalte weiter "Gemini 3.5 Flash"
// heissen. Ein Modellvergleich mit falschen Beschriftungen vergleicht nichts.
// Default bleibt der bisherige Text, es aendert sich also nur etwas, wenn
// jemand die Variable auch setzt.
export const MODEL_NAME = process.env.CLAUDE_MODEL_NAME || "Claude Sonnet 5";
export const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL_NAME || "GPT-5 Mini";
export const PERPLEXITY_MODEL_NAME = process.env.PERPLEXITY_MODEL_NAME || "Perplexity Sonar Pro";
export const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || "Gemini 3.5 Flash";

// API Keys
export const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// CORS-Herkuenfte. Lagen bisher als Literal in app.js, waehrend health.js
// die Anzahl als feste 7 meldete - eine Zahl, die zu keiner Zusammensetzung
// der Liste passte. Eine Quelle, beide lesen daraus.
//
// Frueher waren hier zusaetzlich *.netlify.app und *.railway.app per
// Wildcard erlaubt. Zusammen mit credentials:true durfte damit jeder, der
// sich dort eine App anlegt, Anfragen mit dem chat_session-Cookie stellen.
// Preview-Deployments gehoeren einzeln in ALLOWED_ORIGINS.
export const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "https://hohl.rocks",
  "https://www.hohl.rocks",
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
];

// Daily AI news: optional comma-separated domain allowlist handed to
// Perplexity's search filter (empty = search everywhere)
export const NEWS_DOMAINS = (process.env.NEWS_DOMAINS || "")
  .split(",")
  .map((domain) => domain.trim())
  .filter(Boolean);
