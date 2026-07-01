// ===================================================================
// ENVIRONMENT & CONSTANTS
// ===================================================================

export const PORT = process.env.PORT || 8080;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

// Managed Postgres providers (incl. Railway's) commonly use certificates
// that aren't in the default trust store, so TLS verification is off by
// default to avoid breaking the DB connection. Set to "true" once the
// connection string's CA can be verified, to close this MITM gap.
export const DB_SSL_REJECT_UNAUTHORIZED = process.env.DB_SSL_REJECT_UNAUTHORIZED === "true";

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

// API Keys
export const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
