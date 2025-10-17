import express from "express";
import cors from "cors";
import morgan from "morgan";
import { buildPrompt } from "./prompts.js";
import { genText, streamText } from "./share.llm.js";
import { newsRouter } from "./news.js";

const app = express();
const PORT = process.env.PORT || 8080;

// CORS with wildcard support
function makeCors(){
  const origins = (process.env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);
  const testers = origins.map(pat => {
    if(pat.includes("*")){
      const re = new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g,"\\$&").replace("\*",".*") + "$");
      return (o) => re.test(o||"");
    }
    return (o) => (o === pat);
  });
  return cors({
    origin: (origin, cb)=> {
      if(!origin) return cb(null,true);
      if(testers.length===0) return cb(null,true);
      if(testers.some(fn => fn(origin))) return cb(null,true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials:false
  });
}

app.use(makeCors());
app.use(express.json({ limit:"1mb" }));
app.use(morgan("tiny"));

// Health
app.get("/healthz", (req,res)=>{
  res.json({ ok:true, now: Date.now(), env: process.env.NODE_ENV || "production" });
});
app.get("/readyz", (req,res)=>{
  const hasLLM = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.REPLICATE_API_TOKEN);
  if(!hasLLM){
    return res.status(503).json({ ok:false, reason:"no_llm_provider" });
  }
  res.json({ ok:true });
});

// Routers
app.use("/api/news", newsRouter);
app.use("/_api/news", newsRouter);

// Run (SSE-like)
async function handleRun(req,res){
  const { id, input } = req.body || {};
  const p = buildPrompt(id, input||{});
  res.writeHead(200, {
    "content-type":"text/event-stream; charset=utf-8",
    "cache-control":"no-cache, no-transform",
    "connection":"keep-alive"
  });
  try{
    const txt = await genText({ system: p.system, user: p.user });
    await streamText(res, txt);
  }catch(e){
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  }finally{
    res.end();
  }
}

app.post("/api/run", handleRun);
app.post("/_api/run", handleRun);

// Daily alias (for simplicity)
app.get("/api/daily", (req,res)=> res.redirect(307, "/api/news/daily"));
app.get("/_api/daily", (req,res)=> res.redirect(307, "/api/news/daily"));

// 404
app.use((req,res)=> res.status(404).json({ ok:false, error:"not_found" }));

app.listen(PORT, ()=> console.log("hohl.rocks back listening on " + PORT));
