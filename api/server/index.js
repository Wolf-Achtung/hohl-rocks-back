
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { systemPrompt } from './prompts.js';

const app = express();
const PORT = process.env.PORT || 8080;

// ---- CORS (wildcards wie *.netlify.app erlaubt) ----
const ALLOW = (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb){
    if(!origin) return cb(null,true); // curl/postman
    if(ALLOW.length===0) return cb(null,true);
    const ok = ALLOW.some(a => origin===a || (a.includes('*') && new RegExp('^'+a.replaceAll('.', '\\.').replaceAll('*','.*')+'$').test(origin)));
    cb(ok?null:new Error('CORS blocked'), ok);
  }
}));

app.use(express.json({limit:'1mb'}));
app.use(morgan('tiny'));

// ---- Health / Ready ----
app.get('/healthz', (req,res)=> res.json({ok:true, now:Date.now(), env:process.env.NODE_ENV||'production'}));
app.get('/readyz', (req,res)=> {
  const ready = !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;
  res.status(ready?200:503).json({ok:ready, model: process.env.CLAUDE_MODEL||process.env.OPENAI_MODEL||'n/a'});
});

// ---- News (statisch kuratiert) ----
app.get('/api/news', (req,res)=>{
  res.json({items:[
    {title:"tagesschau – KI", url:"https://www.tagesschau.de/thema/k%C3%BCnstliche_intelligenz"},
    {title:"ZDF heute – KI", url:"https://www.zdfheute.de/thema/kuenstliche-intelligenz-ki-100.html"},
    {title:"THE DECODER", url:"https://the-decoder.de/"},
    {title:"heise – KI", url:"https://www.heise.de/thema/Kuenstliche-Intelligenz"},
    {title:"SRF Wissen – KI", url:"https://www.srf.ch/wissen/kuenstliche-intelligenz"}
  ]});
});

// ---- Daily (Ticker) ----
const DAILY=[
  {title:"Heute neu: Realitäts‑Debugger als Bubble"},
  {title:"Tipp: 5‑Why für Root‑Cause in 3 Minuten"},
  {title:"Micro‑Workshop: bessere User‑Storys (GWT)"}
];
app.get('/api/daily', (req,res)=> res.json({items:DAILY, at: Date.now()}));

// ---- SSE Helper ----
function sse(res){
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('X-Accel-Buffering','no');
  const write = (o)=> res.write(`data: ${JSON.stringify(o)}\n\n`);
  return { write, end: ()=>res.end() };
}

// ---- Provider Streams (native fetch, keine SDKs) ----
async function* streamOpenAI({system, user}){
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const r = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+process.env.OPENAI_API_KEY, 'Content-Type':'application/json' },
    body: JSON.stringify({ model, stream:true, messages:[...(system?[{role:'system',content:system}]:[]), {role:'user', content:user||'Los gehts.'}] })
  });
  if(!r.ok || !r.body) throw new Error('openai_http_'+r.status);
  const reader = r.body.getReader(); const dec = new TextDecoder();
  let buf='';
  while(true){
    const {value,done} = await reader.read(); if(done) break;
    buf += dec.decode(value,{stream:true});
    const parts = buf.split('\n\n'); buf = parts.pop() || '';
    for(const part of parts){
      if(!part.startsWith('data:')) continue;
      const payload = part.slice(5).trim();
      if(payload==='[DONE]') return;
      try{ const j = JSON.parse(payload); const d = j.choices?.[0]?.delta?.content; if(d) yield d; }catch{}
    }
  }
}

async function* streamClaude({system, user}){
  const model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620';
  const r = await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{ 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01','content-type':'application/json' },
    body: JSON.stringify({ model, max_tokens: 1200, system, stream:true, messages:[{role:'user', content:user||'Los gehts.'}] })
  });
  if(!r.ok || !r.body) throw new Error('anthropic_http_'+r.status);
  const reader = r.body.getReader(); const dec = new TextDecoder();
  let buf='';
  while(true){
    const {value,done} = await reader.read(); if(done) break;
    buf += dec.decode(value,{stream:true});
    const parts = buf.split('\n\n'); buf = parts.pop() || '';
    for(const part of parts){
      const line = part.split('\n').find(l=>l.startsWith('data:'));
      if(!line) continue;
      const payload = line.slice(5).trim();
      try{ const j = JSON.parse(payload); if(j.type==='content_block_delta' && j.delta?.text) yield j.delta.text; }catch{}
    }
  }
}

// ---- /api/run (SSE) ----
app.post('/api/run', async (req,res)=>{
  const { id, input } = req.body || {};
  const system = systemPrompt(id);
  const user = (input && typeof input === 'object' && input.text) ? input.text : 'Los gehts.';
  const out = sse(res);
  try{
    if(process.env.ANTHROPIC_API_KEY){
      for await (const chunk of streamClaude({system,user})) out.write({delta:chunk});
      return res.end();
    }
    if(process.env.OPENAI_API_KEY){
      for await (const chunk of streamOpenAI({system,user})) out.write({delta:chunk});
      return res.end();
    }
    out.write({error:'Kein Modell konfiguriert'}); return res.end();
  }catch(err){
    out.write({error:String(err.message||err)}); return res.end();
  }
});

// ---- Root ----
app.get('/', (req,res)=> res.type('text/plain').send('hohl.rocks-back up'));

app.listen(PORT, ()=> console.log('[back] listening on', PORT));
