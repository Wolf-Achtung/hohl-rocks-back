import { Router } from 'express';

const router = Router();

const OPENAI_API_KEY       = process.env.OPENAI_API_KEY       || '';
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY    || '';
const OPENROUTER_API_KEY   = process.env.OPENROUTER_API_KEY   || '';
const REPLICATE_API_TOKEN  = process.env.REPLICATE_API_TOKEN  || '';

const REPLICATE_MODEL_VERSION   = process.env.REPLICATE_MODEL_VERSION   || '';
const REPLICATE_SDXL_VERSION    = process.env.REPLICATE_SDXL_VERSION    || '';
const REPLICATE_MUSICGEN_VERSION= process.env.REPLICATE_MUSICGEN_VERSION|| '';
const REPLICATE_LLAVA_VERSION   = process.env.REPLICATE_LLAVA_VERSION   || '';

async function jsonFetch(url, opt){
  const r = await fetch(url, opt);
  if(!r.ok) throw new Error(`fetch_${r.status}`);
  return await r.json();
}
async function replicatePredictFlexible(modelOrVersion, input){
  if(!REPLICATE_API_TOKEN) throw new Error('replicate_token_missing');
  if(!modelOrVersion) throw new Error('replicate_model_missing');
  let startUrl='https://api.replicate.com/v1/predictions';
  let body={ input };
  if(modelOrVersion.includes('/')) startUrl=`https://api.replicate.com/v1/models/${modelOrVersion}/predictions`;
  else body.version=modelOrVersion;
  const r=await fetch(startUrl,{ method:'POST', headers:{ 'Authorization':`Token ${REPLICATE_API_TOKEN}`,'Content-Type':'application/json' }, body:JSON.stringify(body) });
  if(!r.ok) throw new Error(`replicate_${r.status}`);
  const job=await r.json(); let url=job.urls?.get;
  for(let i=0;i<90;i++){ await new Promise(res=>setTimeout(res,1500));
    const s=await jsonFetch(url,{ headers:{ 'Authorization':`Token ${REPLICATE_API_TOKEN}` } });
    if(s.status==='succeeded') return s;
    if(s.status==='failed' || s.status==='canceled') throw new Error('replicate_failed');
  }
  throw new Error('replicate_timeout');
}

async function llmText(prompt, temperature=0.7, max_tokens=700){
  if(ANTHROPIC_API_KEY){
    const body={ model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620', max_tokens, temperature, messages:[{role:'user',content:prompt}] };
    const r=await fetch('https://api.anthropic.com/v1/messages',{ method:'POST', headers:{'x-api-key':ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'}, body:JSON.stringify(body) });
    const j=await r.json(); return j?.content?.[0]?.text || j?.content?.map?.(c=>c?.text).join('\n') || '';
  }
  if(OPENAI_API_KEY){
    const body={ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages:[{role:'user',content:prompt}], temperature };
    const j=await jsonFetch('https://api.openai.com/v1/chat/completions',{ method:'POST', headers:{'Authorization':`Bearer ${OPENAI_API_KEY}`,'Content-Type':'application/json'}, body:JSON.stringify(body) });
    return j.choices?.[0]?.message?.content || '';
  }
  if(OPENROUTER_API_KEY){
    const body={ model: process.env.OPENROUTER_MODEL || 'mistralai/mixtral-8x7b-instruct', messages:[{role:'user',content:prompt}], temperature };
    const j=await jsonFetch('https://openrouter.ai/api/v1/chat/completions',{ method:'POST', headers:{'Authorization':`Bearer ${OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':'https://hohl.rocks','X-Title':'hohl.rocks'}, body:JSON.stringify(body) });
    return j.choices?.[0]?.message?.content || '';
  }
  throw new Error('no_llm_key');
}

const handlers = {
  async 'zeitreise-tagebuch'(payload){
    const name = (payload?.input?.name||'Alex') + '';
    const jahr = (payload?.input?.jahr||'2084') + '';
    const prompt = `Schreibe einen Tagebucheintrag auf Deutsch. Protagonist: ${name}. Jahr: ${jahr}. 
Stil: nahbar, detailreich, glaubwürdig. 180-260 Wörter.`;
    return { type:'text', text: await llmText(prompt, 0.8, 520) };
  },
  async 'weltbau'(payload){
    const stw = (payload?.input?.stichworte||'zwei Monde, Handelsrouten, Drachen') + '';
    const prompt = `Baue eine fiktive Welt (deutsch) aus diesen Stichworten: ${stw}. 
Gliedere in: Geografie, Gesellschaft, Technologie/Magie, Konflikte, Chancen.`;
    return { type:'text', text: await llmText(prompt, 0.7, 700) };
  },
  async 'poesie-html'(payload){
    const thema = (payload?.input?.thema||'Herbst') + '';
    const prompt = `Schreibe ein sehr kurzes Gedicht (4 Verse) über "${thema}" auf Deutsch.
Gib ausschließlich HTML zurück. Jeder Vers in <p>, farbig via inline style (unterschiedliche Farbtöne). Keine Skripte, nur HTML.`;
    return { type:'html', html: await llmText(prompt, 0.9, 400) };
  },
  async 'bildgenerator'(payload){
    const prompt = (payload?.input?.prompt||'ein futuristisches Stadtpanorama bei Nacht, neonfarben, cinematic') + '';
    const seedRaw = payload?.input?.seed;
    const seed = seedRaw && String(seedRaw).trim() ? Number(seedRaw) : undefined;
    if(REPLICATE_API_TOKEN){
      const modelOrVersion = REPLICATE_MODEL_VERSION || REPLICATE_SDXL_VERSION;
      if(!modelOrVersion) throw new Error('no_image_model_set');
      const isFlux = modelOrVersion.includes('flux');
      const input = isFlux ? { prompt, aspect_ratio: '3:2', output_format: 'png', seed }
                           : { prompt, width: 768, height: 512, num_inference_steps: 30, seed };
      const result = await replicatePredictFlexible(modelOrVersion, input);
      let url=''; if(Array.isArray(result.output)) url=result.output[0]||''; else if(typeof result.output==='string') url=result.output;
      else if(result.output?.image) url=result.output.image;
      return { type:'image', url };
    }
    throw new Error('no_image_key');
  },
  async 'musikgen'(payload){
    const beschreibung = (payload?.input?.beschreibung||'fröhliche Klaviermelodie, 10 Sekunden') + '';
    if(REPLICATE_API_TOKEN){
      const modelOrVersion = REPLICATE_MUSICGEN_VERSION || 'facebook/musicgen';
      const result = await replicatePredictFlexible(modelOrVersion, { prompt: beschreibung, duration: 10 });
      const url = result.output?.audio || (Array.isArray(result.output)? result.output[0] : '') || '';
      return { type:'audio', url };
    }
    throw new Error('no_audio_key');
  },
  async 'bildbeschreibung'(payload){
    const base64 = payload?.files?.bild || '';
    if(!base64) throw new Error('no_image_provided');
    if(REPLICATE_API_TOKEN){
      const modelOrVersion = REPLICATE_LLAVA_VERSION || 'liuhaotian/llava-13b';
      const input = { image: `data:image/png;base64,${base64}`, prompt: 'Beschreibe das Bild ausführlich auf Deutsch.' };
      const result = await replicatePredictFlexible(modelOrVersion, input);
      const text = Array.isArray(result.output) ? result.output.join('\n') : (result.output?.text||result.output||'');
      return { type:'text', text };
    }
    throw new Error('no_vision_key');
  },
  async 'ab-compare'(payload){
    const prompt = (payload?.input?.prompt||'Beschreibe eine utopische Stadt.') + '';
    const modelsRaw = (payload?.input?.modelle||'').toLowerCase();
    const want = modelsRaw.split(',').map(s=>s.trim()).filter(Boolean);
    const tasks = [];
    function pick(name){
      if(name.startsWith('claude') || name==='claude'){
        return async ()=>({ model:'Claude', text: await llmText(prompt, 0.7, 600) });
      }
      if(name.startsWith('gpt') || name==='openai' || name==='chatgpt'){
        return async ()=>({ model:'GPT', text: await llmText(prompt, 0.7, 600) });
      }
      if(name.startsWith('mistral') || name==='mistral'){
        return async ()=>({ model:'Mistral (OpenRouter)', text: await llmText(prompt, 0.7, 600) });
      }
      return null;
    }
    const names = want.length ? want : ['claude','gpt','mistral'];
    for(const n of names){ const f=pick(n); if(f) tasks.push(f()); }
    const out = await Promise.all(tasks);
    return out.filter(Boolean);
  },
  async 'bibliothek-leben'(payload){
    const w = (payload?.input?.waswaerewenn||'Ich hätte vor 10 Jahren eine andere Stadt gewählt') + '';
    const prompt = `Du kuratierst die "Bibliothek ungelebter Leben". Erstelle auf Deutsch eine Buchkarte
(1) Titel, (2) 5-Satz-Abstract, (3) Wendepunkt, (4) eine schmerzlich-schöne letzte Zeile – basierend auf: ${w}.`;
    return { type:'text', text: await llmText(prompt, 0.75, 650) };
  },
  async 'gps-bewusstsein'(payload){
    const ziel = (payload?.input?.ziel||'Kreuzung von Traum & Realität') + '';
    const prompt = `Du bist ein GPS für Bewusstsein. Gib eine poetisch-präzise Wegbeschreibung in 7 Schritten
zu "${ziel}" (deutsch), inkl. metaphorischer Landmarken und einer optionalen Umleitung.`;
    return { type:'text', text: await llmText(prompt, 0.8, 580) };
  },
  async 'emotions-alchemist'(payload){
    const von = (payload?.input?.von||'Frust') + '';
    const zu  = (payload?.input?.zu ||'Neugier') + '';
    const prompt = `Du bist Emotions-Alchemist. Transformiere "${von}" in "${zu}".
Gib: (1) Formel, (2) Zutatenliste (3–5 Punkte), (3) Ritual in 6 Schritten, (4) Nachklang (2 Sätze). Deutsch.`;
    return { type:'text', text: await llmText(prompt, 0.8, 620) };
  },
  async 'surrealismus-generator'(payload){
    const obj = (payload?.input?.objekte||'Teekanne, Wecker, Schlüssel') + '';
    const stil = (payload?.input?.stil||'Dalí modern, Neon, fotorealistisch') + '';
    if(REPLICATE_API_TOKEN){
      const modelOrVersion = REPLICATE_MODEL_VERSION || REPLICATE_SDXL_VERSION;
      if(!modelOrVersion) throw new Error('no_image_model_set');
      const isFlux = modelOrVersion.includes('flux');
      const prompt = `Surrealistisches Kunstwerk: ${obj}. Stil: ${stil}. Ultra-detailliert, dramatisches Licht, Tiefenunschärfe.`;
      const input = isFlux ? { prompt, aspect_ratio: '1:1', output_format: 'png' } : { prompt, width: 768, height: 768, num_inference_steps: 28 };
      const result = await replicatePredictFlexible(modelOrVersion, input);
      let url=''; if(Array.isArray(result.output)) url=result.output[0]||''; else if(typeof result.output==='string') url=result.output;
      else if(result.output?.image) url=result.output.image;
      return { type:'image', url };
    }
    throw new Error('no_image_key');
  },
  async 'rueckwaerts-zivilisation'(payload){
    const fokus = (payload?.input?.fokus||'Architektur') + '';
    const prompt = `Beschreibe eine Zivilisation, die absichtlich rückwärts durch die Zeit "aufsteigt".
Fokus: ${fokus}. Nenne Gründe, Alltagspraktiken, Widersprüche, Chancen.`;
    return { type:'text', text: await llmText(prompt, 0.75, 680) };
  },
  async 'philosophie-mentor'(payload){
    const thema = (payload?.input?.thema||'Digitaler Minimalismus') + '';
    const prompt = `Du bist ein altgriechischer Philosoph im Jahr 2025. Stelle mir in Charakter 3 sokratische Fragen zu "${thema}"
und schließe mit einer kompakten Reflexion (3 Sätze). Deutsch.`;
    return { type:'text', text: await llmText(prompt, 0.7, 480) };
  }
};

router.post('/:id', async (req,res)=>{
  try{
    const id = String(req.params.id||'').trim();
    const fn = handlers[id];
    if(!fn) return res.status(404).json({ error:'unknown_bubble' });
    const out = await fn(req.body||{});
    res.json(out);
  }catch(e){
    console.error('bubble error', e);
    res.status(500).json({ error: e?.message || 'bubble_failed' });
  }
});

export default router;
