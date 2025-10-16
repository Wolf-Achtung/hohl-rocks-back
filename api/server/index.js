import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";

import newsRouter from "./news.js";
import runRouter from "./router.bubbles.js";
import researchRouter from "./research.js";

const app = express();
const PORT = process.env.PORT || 8080;

// CORS allow-list with wildcards (*.netlify.app)
const allowList = (process.env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);
function matchOrigin(origin, list){
  return list.some(p=>{
    if(p.includes("*")){
      const re = new RegExp("^" + p.replaceAll(".", "\\.").replaceAll("*",".*") + "$");
      return re.test(origin);
    }
    return origin === p;
  });
}
app.use(cors({
  origin(origin, cb){
    if(!origin) return cb(null, true);
    if(allowList.length === 0) return cb(null, true);
    const ok = matchOrigin(origin, allowList);
    cb(ok ? null : new Error("CORS blocked"), ok);
  }
}));

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

// Health/Ready
app.get("/healthz", (_req,res)=> res.json({ ok:true, now: Date.now(), env: process.env.NODE_ENV || "production" }));
app.get("/readyz", (_req,res)=> {
  const ready = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  res.status(ready ? 200 : 503).json({ ok: ready, model: process.env.CLAUDE_MODEL || process.env.OPENAI_MODEL || "n/a" });
});

// Routes (alias for _api and api)
app.use("/api/news", newsRouter);
app.use("/_api/news", newsRouter);
app.get("/api/daily", (req,res)=> res.redirect(307, "/api/news/daily"));
app.get("/_api/daily", (req,res)=> res.redirect(307, "/_api/news/daily"));

app.use("/api", runRouter);
app.use("/_api", runRouter);

app.use("/api/research", researchRouter);
app.use("/_api/research", researchRouter);

// Root
app.get("/", (_req,res)=> res.type("text/plain").send("hohl.rocks back online"));

// 404 + error
app.use((req,res)=> res.status(404).json({ ok:false, error:"not_found", path: req.originalUrl }));
app.use((err,_req,res,_next)=>{
  console.error("[ERR]", err);
  res.status(500).json({ ok:false, error: err?.message || "internal_error" });
});

app.listen(PORT, ()=> console.log("[back] listening on", PORT));
