/**
 * hohl.rocks backend — Gold‑Standard (v1.9)
 * Express + CORS + Health/Ready + Tavily (12h cache) + LLM (OpenRouter/Anthropic/OpenAI)
 * Endpoints: /healthz, /readyz, /api/news, /api/daily, /api/run
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import fetch from "node-fetch";
import { prompts } from "./prompts.js";

const app = express();
const PORT = process.env.PORT || 8080;

// ---------- security & basic middlewares ----------
app.set("trust proxy", true);
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

// CORS: allow specific origin or all (Netlify domain + localhost by default)
const DEFAULT_ORIGINS = [
  "https://hohl.rocks",
  "https://www.hohl.rocks",
  "https://steady-pixie-8f36d7.netlify.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];
const ADDITIONAL_ORIGINS = (process.env.CORS_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
const CORS_ORIGINS = [...DEFAULT_ORIGINS, ...ADDITIONAL_ORIGINS];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.some(o => origin.startsWith(o))) return cb(null, true);
    return cb(null, true); // permissiv, damit lokale Tests funktionieren
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-api-base"],
  credentials: false,
}));

// 12h In‑Memory Cache
const HOURS12 = 12 * 60 * 60 * 1000;
const cache = new Map();
function setCache(key, value, ttlMs = HOURS12) {
  cache.set(key, { value, exp: Date.now() + ttlMs });
}
function getCache(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { cache.delete(key); return null; }
  return e.value;
}

// Health / Ready
app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || "development",
    version: process.env.BUILD_VERSION || "2025.10",
    features: {
      eu_host_check: !!process.env.OPENAI_API_BASE || !!process.env.ANTHROPIC_API_BASE,
      idempotency: true,
      quality: true,
    }
  });
});
app.get("/readyz", (req, res) => {
  const issues = [];
  if (!process.env.TAVILY_API_KEY) issues.push("TAVILY_API_KEY missing");
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY)
    issues.push("No LLM key");
  res.status(issues.length ? 503 : 200).json({ ok: issues.length === 0, issues });
});

// Tavily Search helper
async function fetchTavily(query, domains = [], max_results = 12) {
  const url = process.env.TAVILY_BASE || "https://api.tavily.com/search";
  const body = {
    api_key: process.env.TAVILY_API_KEY,
    query,
    search_depth: "advanced",
    max_results,
    include_answer: false,
    include_images: false,
    include_raw_content: false,
    topic: "news",
    ...(domains.length ? { include_domains: domains } : {}),
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 20000
  });
  if (!r.ok) throw new Error(`Tavily HTTP ${r.status}`);
  const j = await r.json();
  return (j.results || []).map(it => ({ title: it.title, url: it.url })).slice(0, max_results);
}

// /api/news (12h cache)
app.get("/api/news", async (req, res) => {
  try {
    const cacheKey = "news-de-at-ch";
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ok: true, items: cached });
    const domains = ["tagesschau.de","heise.de","zeit.de","srf.ch","zdf.de","the-decoder.de","20min.ch","welt.de"];
    const items = await fetchTavily("Aktuelle Nachrichten zu Künstlicher Intelligenz (DE/AT/CH)", domains);
    setCache(cacheKey, items);
    res.json({ ok: true, items });
  } catch {
    res.json({ ok: true, items: [] });
  }
});

// /api/daily – rotierender Ticker (12h cache)
app.get("/api/daily", async (req, res) => {
  try {
    const cacheKey = "daily-tips";
    let cached = getCache(cacheKey);
    if (!cached || !cached.length) {
      const domains = ["openai.com","anthropic.com","the-decoder.de","heise.de","tagesschau.de"];
      cached = await fetchTavily("Kurz-Tipps & neue Features zu ChatGPT, Claude, Sicherheit, DSGVO", domains);
      setCache(cacheKey, cached);
    }
    res.json({ ok: true, items: cached.slice(0, 8) });
  } catch {
    res.json({ ok: true, items: [] });
  }
});

// LLM call wrapper
function modelPreference() {
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: "openrouter", model: process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-haiku:beta" };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", model: process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307" };
  }
  return { provider: "openai", model: process.env.OPENAI_MODEL || "gpt-4o-mini" };
}

// call providers
async function callOpenRouter(prompt, sys, model) {
  const url = process.env.OPENROUTER_BASE || "https://openrouter.ai/api/v1/chat/completions";
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hohl.rocks",
      "X-Title": "hohl.rocks",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        ...(sys ? [{ role: "system", content: sys }] : []),
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    }),
  });
  if (!r.ok) throw new Error(`OpenRouter HTTP ${r.status}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() || "";
}
async function callAnthropic(prompt, sys, model) {
  const url = (process.env.ANTHROPIC_API_BASE || "https://api.anthropic.com") + "/v1/messages";
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: sys || undefined,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200,
    }),
  });
  if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}`);
  const j = await r.json();
  return (j.content || []).map(p => p.text || "").join("").trim();
}
async function callOpenAI(prompt, sys, model) {
  const url = (process.env.OPENAI_API_BASE || "https://api.openai.com/v1") + "/chat/completions";
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(sys ? [{ role: "system", content: sys }] : []),
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() || "";
}

// POST /api/run { id, input, locale } -> answers via chosen provider
app.post("/api/run", async (req, res) => {
  try {
    const { id, input = "", locale = "de-DE" } = req.body || {};
    const tpl = prompts[id];
    if (!tpl) return res.status(404).json({ ok: false, error: "unknown_module" });
    const userPrompt = tpl.user.replace("{{input}}", input.trim());
    const systemPrompt = tpl.system ? tpl.system.replace("{{locale}}", locale) : undefined;
    const { provider, model } = modelPreference();
    let content = "";
    if (provider === "openrouter") content = await callOpenRouter(userPrompt, systemPrompt, model);
    else if (provider === "anthropic") content = await callAnthropic(userPrompt, systemPrompt, model);
    else content = await callOpenAI(userPrompt, systemPrompt, model);
    res.json({ ok: true, provider, model, content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "llm_error", detail: String(err.message || err) });
  }
});

// fallback 404
app.all("*", (req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.listen(PORT, () => console.log(`[hohl.rocks-back] listening on :${PORT}`));
