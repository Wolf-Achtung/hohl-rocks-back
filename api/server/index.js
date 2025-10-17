/* server/index.js — Patch 1.8.1
 * Express backend for hohl.rocks
 * Fixes:
 *  - Correct string newlines (no unescaped line breaks)
 *  - Stable CORS and security middleware
 *  - Resilient /api/run streaming
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";

import { newsRouter, getDaily } from "./news.js";
import { promptsMap } from "./prompts.js";
import { runLLM } from "./share.llm.js";

const app = express();
app.set("trust proxy", 1);

// Security & performance
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));

// CORS
const allow = process.env.ALLOWED_ORIGINS || "*";
const allowList = allow === "*" ? [] : allow.split(",").map(s => s.trim()).filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allow === "*") return cb(null, true);
      const ok = allowList.some((a) => {
        if (a.includes("*")) {
          const re = new RegExp(a.replace(/\./g, "\\.").replace("\*", ".*") + "$");
          return re.test(origin);
        }
        return origin === a || origin.endsWith(a);
      });
      cb(ok ? null : new Error("CORS blocked"), ok);
    },
  })
);

// Health
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), env: process.env.NODE_ENV || "production" });
});
app.get("/readyz", (_req, res) => {
  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
  if (!hasKey) return res.status(503).json({ ok: false, error: "no_llm_key" });
  res.json({ ok: true });
});

// News + Daily
app.use("/api/news", newsRouter);
app.get("/api/daily", async (_req, res) => {
  try {
    const items = await getDaily();
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: "daily_failed" });
  }
});

// LLM Run (text streaming response)
app.post("/api/run", async (req, res) => {
  try {
    const { id, input = "" } = req.body || {};
    const cfg = promptsMap[id] || null;
    if (!cfg) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.write("Unbekannte Aktion. Bitte eine Bubble aus der Startseite wählen.");
      return res.end();
    }

    const sys = cfg.system || "";
    const user = (cfg.userTemplate || "Aufgabe:\n") + (input || cfg.example || "");

    const out = await runLLM({ system: sys, user, maxTokens: cfg.maxTokens || 750 });
    const text = out?.text || "(keine Antwort)";

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    for (let i = 0; i < text.length; i += 900) {
      res.write(text.slice(i, i + 900));
      // small delay to simulate chunked streaming
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 20));
    }
    res.end();
  } catch (_e) {
    res.status(200).type("text/plain").end("Fehler bei der Verarbeitung. Bitte später erneut versuchen.");
  }
});

// Root
app.get("/", (_req, res) => res.send("ok"));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("API running on :" + port));
