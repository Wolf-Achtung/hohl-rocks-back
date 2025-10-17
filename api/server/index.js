import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";

import { newsRouter, getDaily } from "./news.js";
import { promptsMap } from "./prompts.js";
import { runLLM } from "./share.llm.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());
app.use(express.json({limit:"1mb"}));

// ----- CORS -----
const allow = process.env.ALLOWED_ORIGINS || "*";
const corsOptions = (req, cb)=>{
  if(allow === "*" ) return cb(null, { origin: true, credentials:true });
  const list = allow.split(",").map(s=>s.trim()).filter(Boolean);
  const origin = req.headers.origin || "";
  cb(null, { origin: list.includes(origin), credentials:true });
};
app.use(cors(corsOptions));

// ----- Health/Ready -----
app.get("/healthz", (req,res)=>{
  res.json({ok:true, time:new Date().toISOString(), env:process.env.NODE_ENV||"production"});
});
app.get("/readyz", (req,res)=>{
  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
  if(!hasKey) return res.status(503).json({ok:false, error:"keys_missing"});
  res.json({ok:true});
});

// ----- News & Daily -----
app.use("/api/news", newsRouter);
app.get("/api/daily", async (req,res)=>{
  try{
    const d = await getDaily();
    res.json({ok:true, items:d});
  }catch(e){
    res.status(500).json({ok:false, error:"daily_failed"});
  }
});

// ----- Run (LLM) -----
app.post("/api/run", async (req,res)=>{
  try{
    const { id, input="" } = req.body || {};
    const cfg = promptsMap[id];
    if(!cfg){
      res.writeHead(200, {"Content-Type":"text/plain; charset=utf-8"});
      res.write("Unbekannte Aktion. Bitte eine Bubble aus der Startseite wählen.");
      return res.end();
    }

    const sys = cfg.system || "";
    const user = (cfg.userTemplate || "Aufgabe:
") + (input || cfg.example || "");
    const modelRes = await runLLM({system:sys, user, maxTokens: cfg.maxTokens || 750});
    // Simpler Chunk-Streamer
    res.writeHead(200, {"Content-Type":"text/plain; charset=utf-8"});
    const text = modelRes?.text || "Kein Inhalt erhalten.";
    for(const chunk of chunkify(text, 900)){
      res.write(chunk);
      await wait(22);
    }
    res.end();
  }catch(e){
    res.status(200).type("text/plain").end("Fehler bei der Verarbeitung. Bitte später erneut versuchen.");
  }
});

function chunkify(s, n){
  const out=[]; for(let i=0;i<s.length;i+=n) out.push(s.slice(i,i+n)); return out;
}
const wait = (ms)=> new Promise(r=>setTimeout(r,ms));

const port = process.env.PORT || 8080;
app.listen(port, ()=> console.log("API up on :"+port));
