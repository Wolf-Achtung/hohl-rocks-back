import { Router } from 'express';

const router = Router();

const OPENAI_API_KEY       = process.env.OPENAI_API_KEY       || '';
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY    || '';
const OPENROUTER_API_KEY   = process.env.OPENROUTER_API_KEY   || '';
const REPLICATE_API_TOKEN  = process.env.REPLICATE_API_TOKEN  || '';

const REPLICATE_SDXL_VERSION     = process.env.REPLICATE_SDXL_VERSION     || process.env.REPLICATE_MODEL_VERSION || '';
const REPLICATE_MUSICGEN_VERSION = process.env.REPLICATE_MUSICGEN_VERSION || '';
const REPLICATE_LLAVA_VERSION    = process.env.REPLICATE_LLAVA_VERSION    || '';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free';

// ---- helpers ----
async function jsonFetch(url, opt){
  const r = await fetch(url, { ...opt, headers: { 'Content-Type':'application/json', ...(opt?.headers||{}) } });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function pickLLM(){
  if(ANTHROPIC_API_KEY) return 'anthropic';
  if(OPENAI_API_KEY) return 'openai';
  if(OPENROUTER_API_KEY) return 'openrouter';
  return null;
}

async function llmText(prompt, temperature=0.7, max_tokens=700, messages=null){
  const provider = pickLLM();
  if(provider==='anthropic'){
    const body={ model: CLAUDE_MODEL, max_tokens, temperature, messages: messages || [{role:'user',content:prompt}] };
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{ 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01','content-type':'application/json' },
      body:JSON.stringify(body)
    });
    const j=await r.json();
    return j?.content?.map?.(c=>c?.text).join('') || '';
  }
  if(provider==='openai'){
    const body={ model: OPENAI_MODEL, messages: messages || [{role:'user',content:prompt}], temperature, max_tokens };
    const j=await jsonFetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{ 'Authorization':'Bearer '+OPENAI_API_KEY },
      body:JSON.stringify(body)
    });
    return j.choices?.[0]?.message?.content || '';
  }
  if(provider==='openrouter'){
    const body={ model: OPENROUTER_MODEL, messages: messages || [{role:'user',content:prompt}], temperature };
    const j=await jsonFetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{ 'Authorization':'Bearer '+OPENROUTER_API_KEY, 'HTTP-Referer':'https://hohl.rocks','X-Title':'hohl.rocks' },
      body:JSON.stringify(body)
    });
    return j.choices?.[0]?.message?.content || '';
  }
  throw new Error('no_llm_key');
}

async function llmStreamSSE(res, prompt, temperature=0.7, max_tokens=700){
  const __threadId = res.locals?.__threadId || '';
  let __acc = '';
  const provider = pickLLM();
  const threadMessages = res.locals?.__messages || null;

  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');

  function send(obj){ res.write(`data: ${JSON.stringify(obj)}\n\n`); }

  try{
    if(provider==='openai' || provider==='openrouter'){
      const url = provider==='openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      const headers = provider==='openai'
        ? { 'Authorization':'Bearer '+OPENAI_API_KEY, 'Content-Type':'application/json' }
        : { 'Authorization':'Bearer '+OPENROUTER_API_KEY, 'HTTP-Referer':'https://hohl.rocks','X-Title':'hohl.rocks','Content-Type':'application/json' };
      const body={ model: provider==='openai' ? OPENAI_MODEL : OPENROUTER_MODEL, stream:true, temperature, max_tokens,
        messages: threadMessages || [{role:'user',content:prompt}] };
      const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
      if(!r.ok || !r.body){ throw new Error('provider_error'); }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer='';
      while(true){
        const {value, done} = await reader.read();
        if(done) break;
        buffer += decoder.decode(value, {stream:true});
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for(const part of parts){
          if(!part.startsWith('data:')) continue;
          const payload = part.slice(5).trim();
          if(payload==='[DONE]'){ send({done:true}); res.end(); if(__threadId) try{ pushThread(__threadId,'assistant',__acc); }catch{} return; }
          try{
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta?.content;
            if(delta){ __acc += delta; send({delta}); }
          }catch{/* ignore parse errors */}
        }
      }
      send({done:true}); res.end(); if(__threadId) try{ pushThread(__threadId,'assistant',__acc); }catch{} return;
    }

    if(provider==='anthropic'){
      const body={ model: CLAUDE_MODEL, max_tokens, temperature, stream:true, messages: threadMessages || [{role:'user',content:prompt}] };
      const r = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{ 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01','content-type':'application/json' },
        body: JSON.stringify(body)
      });
      if(!r.ok || !r.body) throw new Error('provider_error');
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer='';
      while(true){
        const {value, done} = await reader.read();
        if(done) break;
        buffer += decoder.decode(value, {stream:true});
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for(const part of parts){
          const line = part.split('\n').find(l=>l.startsWith('data:'));
          if(!line) continue;
          const payload = line.slice(5).trim();
          try{
            const j = JSON.parse(payload);
            if(j.type==='content_block_delta' && j.delta?.text) send({delta:j.delta.text});
          }catch{/* ignore */}
        }
      }
      send({done:true}); res.end(); if(__threadId) try{ pushThread(__threadId,'assistant',__acc); }catch{} return;
    }

    const text = await llmText(prompt, temperature, max_tokens, threadMessages);
    __acc += text; send({delta: text}); send({done:true}); res.end(); if(__threadId) try{ pushThread(__threadId,'assistant',__acc); }catch{}
  }catch(err){
    send({error: err.message || 'stream_failed'}); res.end();
  }
}

// ---- threads (in-memory) ----
const THREADS = new Map(); // threadId -> {msgs:[], updated:ts}

function getThread(threadId){
  if(!threadId) return null;
  if(!THREADS.has(threadId)) THREADS.set(threadId, {msgs:[], updated:Date.now()});
  return THREADS.get(threadId);
}
function pushThread(threadId, role, content){
  const t = getThread(threadId); if(!t) return;
  t.msgs.push({role, content: String(content||'').slice(0,4000)});
  if(t.msgs.length>10) t.msgs.splice(0, t.msgs.length-10);
  t.updated = Date.now();
}

// ---- routes ----

// SSE unified run (text streaming preferred)
router.post('/run', async (req,res)=>{
  try{
    const id = String(req.body?.id||'').trim();
    const input = req.body?.input || {};
    const threadId = (req.body?.threadId||'').toString().slice(0,64);
    const thread = getThread(threadId);
    if(!id) return res.status(400).json({ error:'missing_id' });

    const fn = handlers[id];
    if(!fn) return res.status(404).json({ error:'unknown_bubble' });

    const plan = await fn({ input, preview:true });
    if(plan?.stream && plan.prompt){
      const ctx = thread?.msgs ? thread.msgs.slice(-6) : [];
      res.locals.__messages = [...ctx, {role:'user', content: plan.prompt}];
      pushThread(threadId, 'user', plan.prompt);
      res.locals.__threadId = threadId;
      return llmStreamSSE(res, plan.prompt, plan.temperature ?? 0.7, plan.max_tokens ?? 700);
    }
    const result = await fn({ input });
    // push non-streaming results
    if(threadId){
      pushThread(threadId, 'user', JSON.stringify(input));
      if(result?.text) pushThread(threadId, 'assistant', result.text);
    }
    return res.json(result);
  }catch(e){
    console.error('run error', e);
    res.status(500).json({ error: e?.message || 'run_failed' });
  }
});

router.post('/bubble/:id', async (req,res)=>{
  try{
    const id = String(req.params.id||'').trim();
    const fn = handlers[id];
    if(!fn) return res.status(404).json({ error:'unknown_bubble' });
    const out = await fn({ input: req.body||{} });
    res.json(out);
  }catch(e){
    console.error('bubble error', e);
    res.status(500).json({ error: e?.message || 'bubble_failed' });
  }
});

const handlers = {
  async 'zeitreise-tagebuch'({input, preview}){
    const name = (input?.name||'Alex') + '';
    const jahr = (input?.jahr||'2084') + '';
    const prompt = `Schreibe einen Tagebucheintrag auf Deutsch.
Protagonist: ${name}. Jahr: ${jahr}. Stil: nahbar, detailreich, glaubwürdig. 180–260 Wörter.`;
    if(preview) return { stream:true, prompt, temperature:0.8, max_tokens:520 };
    return { type:'text', text: await llmText(prompt, 0.8, 520) };
  },
  async 'weltbau'({input, preview}){
    const regeln = (input?.regelwerk||'Energie als Währung; Erinnerungen steuerbar; Schwerkraft flackert') + '';
    const prompt = `Erschaffe eine prägnante Weltbeschreibung (Deutsch).
Gib 7 Regeln in Bulletpoints (je max. 14 Wörter), eine kurze Konflikt-These und 3 visuelle Setpieces.
Regeln: ${regeln}`;
    if(preview) return { stream:true, prompt, temperature:0.7, max_tokens:650 };
    return { type:'text', text: await llmText(prompt, 0.7, 650) };
  },
  async 'poesie-html'({input, preview}){
    const thema = (input?.thema||'Herbstregen') + '';
    const prompt = `Schreibe ein kurzes HTML‑Gedicht (Deutsch) ohne <html>/<body>.
4–7 Zeilen. Verwende <em>, <strong>, <mark> sparsam und Inline‑Style für Farbverläufe. Thema: ${thema}.`;
    if(preview) return { stream:true, prompt, temperature:0.9, max_tokens:200 };
    const html = await llmText(prompt, 0.9, 220);
    return { type:'html', html };
  },
  async 'bild-generator'({input}){
    const prompt = `${input?.prompt||'Neon‑Straße bei Dämmerung, 85mm'}; Stil: ${input?.stil||'Filmlook, Pastell, Körnung'}`;
    if(!REPLICATE_API_TOKEN || !REPLICATE_SDXL_VERSION) return { type:'image', url: '', error:'image_provider_missing' };
    const out = await replicateRun(REPLICATE_SDXL_VERSION, { prompt });
    const url = Array.isArray(out) ? out[0] : (typeof out==='string'? out : '');
    return { type:'image', url };
  },
  async 'musik-generator'({input}){
    const text = `${input?.stimmung||'sanft, lakonisch'} 20 Sekunden Musik, warm, analog`;
    if(!REPLICATE_API_TOKEN || !REPLICATE_MUSICGEN_VERSION) return { type:'audio', url:'', error:'music_provider_missing' };
    const out = await replicateRun(REPLICATE_MUSICGEN_VERSION, { prompt: text });
    const url = Array.isArray(out) ? out[0] : (typeof out==='string'? out : '');
    return { type:'audio', url };
  },
  async 'bild-beschreibung'({input}){
    if(!REPLICATE_API_TOKEN || !REPLICATE_LLAVA_VERSION) return { type:'text', text:'(Bildbeschreibung erfordert LLAVA/Replicate – Schlüssel fehlt.)' };
    const dataUrl = input?.file?.data || '';
    if(!dataUrl) return { type:'text', text:'Kein Bild erhalten.' };
    const out = await replicateRun(REPLICATE_LLAVA_VERSION, { image: dataUrl, prompt: 'Beschreibe das Bild auf Deutsch, 6 Sätze, präzise.' });
    const text = Array.isArray(out) ? out.join(' ') : String(out||'');
    return { type:'text', text };
  },
  async 'philosophie-mentor'({input, preview}){
    const thema = (input?.thema||'Digitaler Minimalismus') + '';
    const prompt = `Sokratischer Mentor (Deutsch).
Stelle 3 zugespitzte Fragen zum Thema: ${thema}. Danach ein 2‑Satz‑Impuls mit Handlungsangebot.`;
    if(preview) return { stream:true, prompt, temperature:0.65, max_tokens:300 };
    return { type:'text', text: await llmText(prompt, 0.65, 300) };
  },
};

export default router;