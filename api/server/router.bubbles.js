import { Router } from 'express';

const router = Router();

// ENV keys
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';

// Helpers
async function jsonFetch(url, opt){
  const r = await fetch(url, opt);
  if(!r.ok) throw new Error(`fetch_${r.status}`);
  return await r.json();
}
async function replicatePredict(version, input){
  const r = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ version, input })
  });
  if(!r.ok) throw new Error(`replicate_${r.status}`);
  const job = await r.json();
  // poll
  let url = job.urls?.get;
  for(let i=0;i<60;i++){
    await new Promise(r=>setTimeout(r, 1500));
    const s = await jsonFetch(url, { headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` } });
    if(s.status==='succeeded') return s;
    if(s.status==='failed' || s.status==='canceled') throw new Error('replicate_failed');
  }
  throw new Error('replicate_timeout');
}

// Bubble handlers
const handlers = {
  async 'zeitreise-tagebuch'(payload){
    const name = (payload?.input?.name||'') + '';
    const jahr = (payload?.input?.jahr||'') + '';
    const prompt = `Schreibe einen Tagebucheintrag auf Deutsch. Protagonist: ${name||'Alex'}. Jahr: ${jahr||'2084'}. 
Stil: nahbar, detailreich, glaubwürdig. 180-260 Wörter.`;
    // Prefer Claude, then OpenAI, then OpenRouter (Mistral)
    if(ANTHROPIC_API_KEY){
      const body = {
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620',
        max_tokens: 512,
        temperature: 0.8,
        messages: [{ role:'user', content: prompt }]
      };
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':'application/json'
        },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      const text = j?.content?.[0]?.text || j?.content?.map?.(c=>c?.text).join('\n') || '';
      return { type:'text', text };
    }
    if(OPENAI_API_KEY){
      const body = {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role:'user', content: prompt }],
        temperature: 0.8
      };
      const j = await jsonFetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
      return { type:'text', text: j.choices?.[0]?.message?.content || '' };
    }
    if(OPENROUTER_API_KEY){
      const body = {
        model: process.env.OPENROUTER_MODEL || 'mistralai/mixtral-8x7b-instruct',
        messages: [{ role:'user', content: prompt }],
        temperature: 0.8
      };
      const j = await jsonFetch('https://openrouter.ai/api/v1/chat/completions', {
        method:'POST',
        headers:{
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type':'application/json',
          'HTTP-Referer': 'https://hohl.rocks', 'X-Title':'hohl.rocks'
        },
        body: JSON.stringify(body)
      });
      return { type:'text', text: j.choices?.[0]?.message?.content || '' };
    }
    throw new Error('no_llm_key');
  },

  async 'weltbau'(payload){
    const stw = (payload?.input?.stichworte||'') + '';
    const prompt = `Baue eine fiktive Welt (deutsch) aus diesen Stichworten: ${stw||'zwei Monde, Handelsrouten, Drachen'}. 
Gliedere in: Geografie, Gesellschaft, Technologie/Magie, Konflikte, Chancen.`;
    // Prefer OpenRouter (Open-Source), fallback OpenAI/Claude
    if(OPENROUTER_API_KEY){
      const body = { model: 'mistralai/mixtral-8x7b-instruct', messages:[{role:'user',content:prompt}], temperature:0.7 };
      const j = await jsonFetch('https://openrouter.ai/api/v1/chat/completions', {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${OPENROUTER_API_KEY}`, 'Content-Type':'application/json', 'HTTP-Referer':'https://hohl.rocks', 'X-Title':'hohl.rocks' },
        body: JSON.stringify(body)
      });
      return { type:'text', text: j.choices?.[0]?.message?.content || '' };
    }
    if(OPENAI_API_KEY){
      const body = { model:'gpt-4o-mini', messages:[{role:'user',content:prompt}], temperature:0.7 };
      const j = await jsonFetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
      return { type:'text', text: j.choices?.[0]?.message?.content || '' };
    }
    if(ANTHROPIC_API_KEY){
      const body = { model:'claude-3-5-sonnet-20240620', max_tokens: 700, temperature: 0.7, messages:[{role:'user',content:prompt}] };
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:{'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01','content-type':'application/json'}, body: JSON.stringify(body)
      });
      const j = await r.json();
      const text = j?.content?.[0]?.text || j?.content?.map?.(c=>c?.text).join('\n') || '';
      return { type:'text', text };
    }
    throw new Error('no_llm_key');
  },

  async 'poesie-html'(payload){
    const thema = (payload?.input?.thema||'Herbst') + '';
    const prompt = `Schreibe ein sehr kurzes Gedicht (4 Verse) über "${thema}" auf Deutsch.
Gib ausschließlich HTML zurück. Jeder Vers in <p>, farbig via inline style (unterschiedliche Farbtöne). Keine Skripte, nur HTML.`;
    if(OPENAI_API_KEY){
      const body = { model:'gpt-4o-mini', messages:[{role:'user',content:prompt}], temperature:0.9 };
      const j = await jsonFetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
      const html = j.choices?.[0]?.message?.content || '';
      return { type:'html', html };
    }
    if(ANTHROPIC_API_KEY){
      const body = { model:'claude-3-5-sonnet-20240620', max_tokens: 400, temperature: 0.9, messages:[{role:'user',content:prompt}] };
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:{'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01','content-type':'application/json'}, body: JSON.stringify(body)
      });
      const j = await r.json();
      const html = j?.content?.[0]?.text || '';
      return { type:'html', html };
    }
    if(OPENROUTER_API_KEY){
      const body = { model:'mistralai/mixtral-8x7b-instruct', messages:[{role:'user',content:prompt}], temperature:0.9 };
      const j = await jsonFetch('https://openrouter.ai/api/v1/chat/completions', {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${OPENROUTER_API_KEY}`, 'Content-Type':'application/json','HTTP-Referer':'https://hohl.rocks','X-Title':'hohl.rocks' },
        body: JSON.stringify(body)
      });
      const html = j.choices?.[0]?.message?.content || '';
      return { type:'html', html };
    }
    throw new Error('no_llm_key');
  },

  async 'bildgenerator'(payload){
    const prompt = (payload?.input?.prompt||'ein futuristisches Stadtpanorama bei Nacht, neonfarben, cinematic') + '';
    // Prefer Replicate SDXL; fallback OpenAI images
    if(REPLICATE_API_TOKEN){
      const version = process.env.REPLICATE_SDXL_VERSION || 'e1fe0f611a7e1b6b7cd1f3ffb5b4b7cba0d1d9f96d58edf226d1ad59c4b1a0d8'; // example placeholder
      const result = await replicatePredict(version, { prompt, width: 768, height: 512 });
      const url = result.output?.[0] || '';
      return { type:'image', url };
    }
    if(OPENAI_API_KEY){
      const body = { model:'gpt-image-1', prompt, size:'1024x1024' };
      const j = await jsonFetch('https://api.openai.com/v1/images/generations', {
        method:'POST', headers:{ 'Authorization':`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' }, body: JSON.stringify(body)
      });
      const url = j.data?.[0]?.url || '';
      return { type:'image', url };
    }
    throw new Error('no_image_key');
  },

  async 'musikgen'(payload){
    const beschreibung = (payload?.input?.beschreibung||'fröhliche Klaviermelodie, 10 Sekunden') + '';
    if(REPLICATE_API_TOKEN){
      const version = process.env.REPLICATE_MUSICGEN_VERSION || '1f7de6e485a6b1a242fd48977fd8e3de5f5c2a5ef8b6a6b61b1f4b6c9a6e8a1a'; // placeholder
      const result = await replicatePredict(version, { prompt: beschreibung, duration: 10 });
      const url = result.output?.audio || result.output?.[0] || '';
      return { type:'audio', url };
    }
    throw new Error('no_audio_key');
  },

  async 'bildbeschreibung'(payload){
    // Expect data URL / base64 from client
    const base64 = payload?.files?.bild || '';
    if(!base64) throw new Error('no_image_provided');
    if(REPLICATE_API_TOKEN){
      const version = process.env.REPLICATE_LLAVA_VERSION || '2b2f9322b1a6b9b6653e3a8c56f75b3aab3f0a7b50e6f0e6a1e2c4d4b1c2d3e4'; // placeholder
      const result = await replicatePredict(version, { image: `data:image/png;base64,${base64}`, prompt: 'Beschreibe das Bild ausführlich auf Deutsch.' });
      const text = Array.isArray(result.output) ? result.output.join('\n') : (result.output?.text||result.output||'');
      return { type:'text', text };
    }
    // Fallback: simple message
    throw new Error('no_vision_key');
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
