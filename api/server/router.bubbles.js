import { Router } from 'express';
import { llmText as callLLM } from './share.llm.js';

const router = Router();

const OPENAI_API_KEY       = process.env.OPENAI_API_KEY       || '';
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY    || '';
const OPENROUTER_API_KEY   = process.env.OPENROUTER_API_KEY   || '';
const REPLICATE_API_TOKEN  = process.env.REPLICATE_API_TOKEN  || '';

const REPLICATE_MODEL_VERSION    = process.env.REPLICATE_MODEL_VERSION    || '';
const REPLICATE_SDXL_VERSION     = process.env.REPLICATE_SDXL_VERSION     || process.env.REPLICATE_MODEL_VERSION || '';
const REPLICATE_MUSICGEN_VERSION = process.env.REPLICATE_MUSICGEN_VERSION || '';
const REPLICATE_LLAVA_VERSION    = process.env.REPLICATE_LLAVA_VERSION    || '';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free';

function pickLLM(){ if(ANTHROPIC_API_KEY) return 'anthropic'; if(OPENAI_API_KEY) return 'openai'; if(OPENROUTER_API_KEY) return 'openrouter'; return null; }
function toMessages(thread, content){ const msgs=[]; (Array.isArray(thread)?thread:[]).forEach(m=> msgs.push({role:(['assistant','user','system'].includes(m.role)?m.role:'user'), content:String(m.content||'')})); msgs.push({role:'user', content}); return msgs; }
function normalize(provider, messages=[], system){ const sysMsgs=(messages||[]).filter(m=>m.role==='system').map(m=>m.content); const sys=[system,...sysMsgs].filter(Boolean).join('\n'); const msgsNoSys=(messages||[]).filter(m=>m.role!=='system'); if(provider==='anthropic'){ const msgs=msgsNoSys.map(m=>({role:(m.role==='assistant'?'assistant':'user'), content:String(m.content||'')})); return {messages:msgs,system:sys||undefined}; } const msgs=sys?[{role:'system',content:sys},...msgsNoSys]:msgsNoSys; return {messages:msgs,system:undefined}; }

router.get('/run', (_req,res)=>{ res.json({ ok:true, method:'POST', usage:"POST /api/run { id, input, thread }", examples:[{id:"idea-zeitreise-editor",input:{},thread:[]}] }); });

async function llmStreamSSE(res, prompt, temperature=0.7, max_tokens=700, messages=null, system=null){
  const provider = pickLLM(); const baseMsgs = messages || [{role:'user', content: prompt}]; const norm = normalize(provider, baseMsgs, system);
  res.setHeader('Content-Type','text/event-stream'); res.setHeader('Cache-Control','no-cache'); res.setHeader('Connection','keep-alive');
  const send = (o)=> res.write(`data: ${JSON.stringify(o)}\n\n`);

  try{
    if(provider==='openai' || provider==='openrouter'){
      const url = provider==='openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      const headers = provider==='openai' ? { 'Authorization':'Bearer '+OPENAI_API_KEY, 'Content-Type':'application/json' } : { 'Authorization':'Bearer '+OPENROUTER_API_KEY, 'HTTP-Referer':'https://hohl.rocks','X-Title':'hohl.rocks','Content-Type':'application/json' };
      const body={ model: provider==='openai'?OPENAI_MODEL:OPENROUTER_MODEL, stream:true, temperature, max_tokens, messages: norm.messages };
      const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
      if(!r.ok || !r.body) throw new Error('provider_error');
      const reader = r.body.getReader(); const dec=new TextDecoder(); let buf='';
      while(true){ const {value,done}=await reader.read(); if(done) break; buf+=dec.decode(value,{stream:true}); const parts=buf.split('\n\n'); buf=parts.pop()||''; for(const p of parts){ if(!p.startsWith('data:')) continue; const payload=p.slice(5).trim(); if(payload==='[DONE]'){ send({done:true}); res.end(); return; } try{ const j=JSON.parse(payload); const delta=j.choices?.[0]?.delta?.content; if(delta) send({delta}); }catch{} } }
      send({done:true}); res.end(); return;
    }
    if(provider==='anthropic'){
      const body={ model: CLAUDE_MODEL, max_tokens, temperature, stream:true, messages: norm.messages, ...(norm.system?{system:norm.system}:{}) };
      const r = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{ 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01','content-type':'application/json' }, body: JSON.stringify(body) });
      if(!r.ok || !r.body) throw new Error('provider_error');
      const reader=r.body.getReader(); const dec=new TextDecoder(); let buf='';
      while(true){ const {value,done}=await reader.read(); if(done) break; buf+=dec.decode(value,{stream:true}); const parts=buf.split('\n\n'); buf=parts.pop()||''; for(const part of parts){ const line=part.split('\n').find(l=>l.startsWith('data:')); if(!line) continue; const payload=line.slice(5).trim(); try{ const j=JSON.parse(payload); if(j.type==='content_block_delta' && j.delta?.text) send({delta:j.delta.text}); }catch{} } }
      send({done:true}); res.end(); return;
    }
    const text = await callLLM(prompt, temperature, max_tokens, baseMsgs, system); send({delta:text}); send({done:true}); res.end();
  }catch(err){ send({error:err.message||'stream_failed'}); res.end(); }
}

// Idea templates (gekürzt; Volltexte im Frontend angezeigt)
const IDEA_TEMPLATES = {
  'idea-zeitreise-editor': "Du bist ein Zeitreise-Editor...",
  'idea-rueckwaerts-zivilisation': "Zivilisation entwickelt sich rückwärts...",
  'idea-bewusstsein-gebaeude': "200 Jahre altes Gebäude mit Bewusstsein...",
  'idea-philosophie-mentor': "Altgriechischer Philosoph in 2024...",
  'idea-marktplatz-guide': "Interdimensionaler Marktplatz...",
  'idea-npc-leben': "NPC mit Privatleben...",
  'idea-prompt-archaeologe': "Prompt-Archäologe...",
  'idea-ki-traeume': "KI träumt...",
  'idea-recursive-story': "Rekursive Erzählung...",
  'idea-xenobiologe': "Xenobiologie...",
  'idea-quantentagebuch': "Quantentagebuch...",
  'idea-rueckwaerts-apokalypse': "Perfektion als Bedrohung...",
  'idea-farbsynaesthetiker': "Musik als Landschaft...",
  'idea-museum-verlorene-traeume': "Museum der verlorenen Träume...",
  'idea-zeitlupen-explosion': "Zeitlupen-Explosion...",
  'idea-gps-bewusstsein': "GPS für Bewusstsein...",
  'idea-biografie-pixel': "Biografie eines Pixels...",
  'idea-rueckwaerts-detektiv': "Rückwärts-Detektiv...",
  'idea-bewusstsein-internet': "Netz-Bewusstsein...",
  'idea-emotional-alchemist': "Emotionen transmutieren...",
  'idea-bibliothek-ungelebter-leben': "Bibliothek ungelebter Leben...",
  'idea-realitaets-debugger': "Bugs in der Realität...",
  'idea-empathie-tutorial': "Empathie-Tutorial...",
  'idea-surrealismus-generator': "Surrealismus-Generator...",
  'idea-vintage-futurist': "Tech in den 1920ern...",
  'idea-synaesthetisches-internet': "Synästhetisches Internet...",
  'idea-code-poet': "Code als Poesie...",
  'idea-kollektiv-gedanke-moderator': "Innere Anteile moderieren...",
  'idea-paradox-loesungszentrum': "Paradoxien nutzen...",
  'idea-universums-uebersetzer': "Universums-Übersetzer..."
};

const handlers = {
  // 30 Ideen
  ...Object.fromEntries(Object.keys(IDEA_TEMPLATES).map(id => [id, ideaHandler(id)])),

  async 'zeitreise-tagebuch'({input, preview, thread}){
    const name = (input?.name||'Alex') + '';
    const jahr = (input?.jahr||'2084') + '';
    const prompt = `Schreibe einen Tagebucheintrag (Deutsch). Protagonist: ${name}. Jahr: ${jahr}. 180–260 Wörter.`;
    const system = 'Du schreibst präzise, menschlich, mit filmischen Details.';
    if(preview) return { stream:true, prompt, temperature:0.8, max_tokens:520, system };
    return { type:'text', text: await callLLM(prompt, 0.8, 520, toMessages(thread, prompt), system) };
  },
  async 'weltbau'({input, preview, thread}){
    const regeln = (input?.regelwerk||'Energie als Währung; Erinnerungen steuerbar; Schwerkraft flackert') + '';
    const prompt = `Erschaffe eine Welt in 7 Regeln (je <=14 Wörter), 1 Konflikt-These, 3 visuelle Setpieces. Regeln: ${regeln}`;
    const system = 'Klar, knapp, bildhaft, filmisch.';
    if(preview) return { stream:true, prompt, temperature:0.7, max_tokens:650, system };
    return { type:'text', text: await callLLM(prompt, 0.7, 650, toMessages(thread, prompt), system) };
  },
  async 'poesie-html'({input, preview, thread}){
    const thema = (input?.thema||'Herbstregen') + '';
    const prompt = `Schreibe ein kurzes HTML‑Gedicht (Deutsch) ohne <html>/<body>. 4–7 Zeilen. Nutze <em>, <strong>, <mark> sparsam. Thema: ${thema}.`;
    const system = 'Ästhetisch, minimalistisch, keine Skripte.';
    if(preview) return { stream:true, prompt, temperature:0.9, max_tokens:200, system };
    const html = await callLLM(prompt, 0.9, 220, toMessages(thread, prompt), system);
    return { type:'html', html };
  },
  async 'bild-generator'({input}){
    if(!REPLICATE_API_TOKEN || !REPLICATE_SDXL_VERSION) return { type:'image', url: '', error:'image_provider_missing' };
    const prompt = `${input?.prompt||'Neon‑Straße bei Dämmerung, 85mm'}; Stil: ${input?.stil||'Filmlook, Pastell, Körnung'}`;
    const out = await replicateRun(process.env.REPLICATE_SDXL_VERSION || process.env.REPLICATE_MODEL_VERSION, { prompt });
    const url = Array.isArray(out) ? out[0] : (typeof out==='string'? out : ''); return { type:'image', url };
  },
  async 'musik-generator'({input}){
    if(!REPLICATE_API_TOKEN || !REPLICATE_MUSICGEN_VERSION) return { type:'audio', url:'', error:'music_provider_missing' };
    const text = `${input?.stimmung||'sanft, lakonisch'} 20 Sekunden Musik, warm, analog`;
    const out = await replicateRun(process.env.REPLICATE_MUSICGEN_VERSION, { prompt: text });
    const url = Array.isArray(out) ? out[0] : (typeof out==='string'? out : ''); return { type:'audio', url };
  },
  async 'bild-beschreibung'({input}){
    if(!REPLICATE_API_TOKEN || !REPLICATE_LLAVA_VERSION) return { type:'text', text:'(Bildbeschreibung erfordert LLAVA/Replicate – Schlüssel fehlt.)' };
    const dataUrl = input?.file?.data || ''; if(!dataUrl) return { type:'text', text:'Kein Bild erhalten.' };
    const out = await replicateRun(process.env.REPLICATE_LLAVA_VERSION, { image: dataUrl, prompt: 'Beschreibe das Bild auf Deutsch, 6 Sätze, präzise.' });
    const text = Array.isArray(out) ? out.join(' ') : String(out||''); return { type:'text', text };
  }
};

function ideaHandler(id){
  return async ({input, preview, thread})=>{
    const tpl = IDEA_TEMPLATES[id]; const system = 'Du bist Claude/Assistant, antworte präzise, bildhaft und auf Deutsch.';
    if(preview) return { stream:true, prompt: tpl, temperature:0.8, max_tokens:700, system };
    const text = await callLLM(tpl, 0.8, 700, toMessages(thread, tpl), system);
    return { type:'text', text };
  };
}

async function replicateRun(version, input){
  if(!REPLICATE_API_TOKEN) throw new Error('replicate_key_missing');
  const r = await fetch('https://api.replicate.com/v1/predictions', { method:'POST', headers:{ 'Authorization':'Bearer '+REPLICATE_API_TOKEN, 'Content-Type':'application/json' }, body: JSON.stringify({ version, input }) });
  if(!r.ok) throw new Error(`replicate_http_${r.status}`);
  const j = await r.json(); let id=j.id, status=j.status;
  while(status && status!=='succeeded' && status!=='failed' && status!=='canceled'){
    await new Promise(r=>setTimeout(r, 1500));
    const rp = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers:{ 'Authorization':'Bearer '+REPLICATE_API_TOKEN } });
    const pj = await rp.json(); status=pj.status;
    if(status==='succeeded') return pj.output;
    if(status==='failed') throw new Error('replicate_failed');
  }
  return j.output;
}

export default router;
