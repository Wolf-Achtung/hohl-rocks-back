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

// Claude Model
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

// API Keys
export const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
