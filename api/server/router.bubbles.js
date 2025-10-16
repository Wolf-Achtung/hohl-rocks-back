import express from "express";
import { streamLLM } from "./share.llm.js";
import { systemPrompt } from "./prompts.js";

const router = express.Router();

router.get("/run", (_req,res)=>{
  res.json({ ok:true, method:"POST", usage:"POST /api/run { id, input:{text}, thread? }" });
});

router.post("/run", async (req,res)=>{
  // SSE headers
  res.setHeader("Content-Type","text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control","no-cache, no-transform");
  res.setHeader("X-Accel-Buffering","no");
  res.flushHeaders?.();

  const id = req.body?.id;
  const userText = (req.body?.input && typeof req.body.input === "object" && req.body.input.text) ? String(req.body.input.text) : "";
  const system = systemPrompt(id);

  const write = (obj)=> res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const end = ()=> res.end();

  try {
    for await (const chunk of streamLLM({ system, user: userText })) {
      write({ delta: chunk });
    }
    end();
  } catch (err) {
    write({ error: String(err?.message || err) });
    end();
  }
});

export default router;
