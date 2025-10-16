import { Router } from 'express';
import { systemPrompt } from './prompts.js';

const router = Router();

function sse(res){
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('X-Accel-Buffering','no');
  const write = (o)=> res.write(`data: ${JSON.stringify(o)}\n\n`);
  return { write, end: ()=>res.end() };
}

function provider(){
  if(process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if(process.env.OPENAI_API_KEY) return 'openai';
  if(process.env.OPENROUTER_API_KEY) return 'openrouter';
  return null;
}

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
async function* streamOpenRouter({system, user}){
  const model = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free';
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+process.env.OPENROUTER_API_KEY, 'HTTP-Referer':'https://hohl.rocks','X-Title':'hohl.rocks','Content-Type':'application/json' },
    body: JSON.stringify({ model, stream:true, messages:[...(system?[{role:'system',content:system}]:[]), {role:'user', content:user||'Los gehts.'}] })
  });
  if(!r.ok || !r.body) throw new Error('openrouter_http_'+r.status);
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
async function* streamAnthropic({system, user}){
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

// Info
router.get('/', (_req,res)=>{
  res.json({ ok:true, usage:"POST /api/run { id, input:{text}, thread }" });
});

// SSE run
router.post('/', async (req,res)=>{
  const { id, input } = req.body || {};
  const system = systemPrompt(id);
  const user = (input && typeof input === 'object' && input.text) ? input.text : 'Los gehts.';
  const out = sse(res);
  try{
    const p = provider();
    if(p==='anthropic'){ for await (const d of streamAnthropic({system,user})) out.write({delta:d}); out.end(); return; }
    if(p==='openai'){ for await (const d of streamOpenAI({system,user})) out.write({delta:d}); out.end(); return; }
    if(p==='openrouter'){ for await (const d of streamOpenRouter({system,user})) out.write({delta:d}); out.end(); return; }
    out.write({error:'Kein Modell konfiguriert'}); out.end();
  }catch(err){ out.write({error:String(err.message||err)}); out.end(); }
});

export default router;
