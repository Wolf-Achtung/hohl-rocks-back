
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { systemPrompt } from './prompts.js';
import Anthropic from 'anthropic';
import OpenAI from 'openai';

const app = express();
const PORT = process.env.PORT || 8080;

// --- CORS ---
const allow = (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb){
    if(!origin) return cb(null, true); // curl/postman
    if(allow.some(a => origin === a || (a.includes('*') && new RegExp('^'+a.replaceAll('.', '\\.').replaceAll('*','.*')+'$').test(origin)))){
      return cb(null,true);
    }
    cb(null,true); // be permissive for now, or switch to cb(new Error('CORS blocked'))
  },
  credentials: false
}));
app.use(express.json({limit:'1mb'}));
app.use(morgan('tiny'));

// --- Health/Ready ---
let WARM=true;
app.get('/healthz', (req,res)=> res.json({ok:true, now:Date.now(), env:process.env.NODE_ENV||'production'}));
app.get('/readyz', (req,res)=>{
  const hasKey = !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;
  res.status(hasKey && WARM ? 200 : 503).json({ok: hasKey && WARM, model: process.env.CLAUDE_MODEL||process.env.OPENAI_MODEL||'n/a'});
});

// --- News (static curated list) ---
app.get('/api/news', (req,res)=>{
  const items = [
    {title:"Künstliche Intelligenz – aktuelle Nachrichten | tagesschau.de", url:"https://www.tagesschau.de/thema/k%C3%BCnstliche_intelligenz"},
    {title:"Künstliche Intelligenz (KI) – Aktuelle Nachrichten & Hintergründe", url:"https://www.zdfheute.de/thema/kuenstliche-intelligenz-ki-100.html"},
    {title:"Künstliche Intelligenz: News, Business, Forschung & mehr | THE DECODER", url:"https://the-decoder.de/"},
    {title:"Künstliche Intelligenz: News, Ratgeber und Tipps | heise online", url:"https://www.heise.de/thema/Kuenstliche-Intelligenz"},
    {title:"KI Strategie: News und Hintergründe – SRF", url:"https://www.srf.ch/wissen/kuenstliche-intelligenz"},
    {title:"KI in Deutschland: Mehr als 1.100 Beispiele – PLSD", url:"https://www.plattform-lernende-systeme.de/ki-in-deutschland.html"},
    {title:"Schlüsseltechnologie KI – BMBF", url:"https://www.bmbf.de/bmbf/de/forschung/digitalisierung/kuenstliche-intelligenz/kuenstliche-intelligenz_node.html"},
    {title:"AI News: Aktuelle Nachrichten zu KI", url:"https://www.welt.de/themen/kuenstliche-intelligenz/"}
  ];
  res.json({items});
});

// --- Daily (rotation, 12h cache idea) ---
const DAILY = [
  {title:"Mini‑Workshop: Schreibe User‑Storys wie ein Profi (mit GWT‑Kriterien)."},
  {title:"Neue Bubble: Realitäts‑Debugger – Finde die Bugs im Universum."},
  {title:"Prompt‑Tipp: 5‑Why auf Incidents anwenden (Root‑Cause schnell)."},
];
app.get('/api/daily', (req,res)=> res.json({items:DAILY, at: Date.now()}));

// --- SSE helper ---
function sseInit(res){
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const write = (obj)=> res.write(`data: ${JSON.stringify(obj)}\n\n`);
  return { write, close: ()=> res.end() };
}

// --- Providers ---
const claude = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function streamClaude({system, user}){
  if(!claude) throw new Error('Claude nicht konfiguriert');
  const model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest';
  const stream = await claude.messages.create({
    model, max_tokens: 1200, system,
    messages:[{role:'user', content: user||'Los gehts.'}], stream:true
  });
  return stream;
}
async function* streamOpenAI({system, user}){
  if(!openai) throw new Error('OpenAI nicht konfiguriert');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const r = await openai.chat.completions.create({
    model, stream:true,
    messages:[{role:'system', content: system||''}, {role:'user', content:user||'Los gehts.'}]
  });
  for await (const part of r){
    const txt = part.choices?.[0]?.delta?.content;
    if(txt) yield txt;
  }
}

// --- /api/run (SSE) ---
app.post('/api/run', async (req,res)=>{
  const { id, input } = req.body || {};
  const system = systemPrompt(id);
  const user = (input && typeof input === 'object' && input.text) ? input.text : '';

  const sse = sseInit(res);
  try{
    if(claude){
      const stream = await streamClaude({system, user});
      for await (const event of stream){
        if(event.type === 'content_block_delta' && event.delta?.type === 'text_delta'){
          sse.write({delta: event.delta.text});
        }else if(event.type === 'message_stop'){
          break;
        }
      }
      sse.write({delta:''}); return res.end();
    }else if(openai){
      for await (const chunk of streamOpenAI({system, user})){
        sse.write({delta: chunk});
      }
      sse.write({delta:''}); return res.end();
    }else{
      sse.write({error:'Kein Modell konfiguriert'});
      return res.end();
    }
  }catch(err){
    sse.write({error: String(err.message||err)});
    return res.end();
  }
});

// --- root
app.get('/', (req,res)=> res.type('text/plain').send('hohl.rocks-back up'));

app.listen(PORT, ()=> console.log('Server on', PORT));
