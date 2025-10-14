import { Router } from 'express';

const router = Router();

// --- ENV keys ---
const OPENAI_API_KEY       = process.env.OPENAI_API_KEY       || '';
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY    || '';
const OPENROUTER_API_KEY   = process.env.OPENROUTER_API_KEY   || '';
const REPLICATE_API_TOKEN  = process.env.REPLICATE_API_TOKEN  || '';

// Replicate Variant B (Slug ODER Version-ID)
const REPLICATE_MODEL_VERSION   = process.env.REPLICATE_MODEL_VERSION   || '';
const REPLICATE_SDXL_VERSION    = process.env.REPLICATE_SDXL_VERSION    || '';
const REPLICATE_MUSICGEN_VERSION= process.env.REPLICATE_MUSICGEN_VERSION|| '';
const REPLICATE_LLAVA_VERSION   = process.env.REPLICATE_LLAVA_VERSION   || '';

// ---------- Helpers ----------
async function jsonFetch(url, opt) {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error(`fetch_${r.status}`);
  return await r.json();
}

/**
 * Replicate Prediction – akzeptiert Model-Slug (owner/name) ODER Version-ID.
 * Pollt bis succeeded/failed/timeout.
 */
async function replicatePredictFlexible(modelOrVersion, input) {
  if (!REPLICATE_API_TOKEN) throw new Error('replicate_token_missing');
  if (!modelOrVersion)      throw new Error('replicate_model_missing');

  let startUrl = 'https://api.replicate.com/v1/predictions';
  let body     = { input };
  if (modelOrVersion.includes('/')) {
    startUrl = `https://api.replicate.com/v1/models/${modelOrVersion}/predictions`;
  } else {
    body.version = modelOrVersion;
  }

  const r = await fetch(startUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type' : 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`replicate_${r.status}`);
  const job = await r.json();

  const getUrl = job.urls?.get;
  for (let i = 0; i < 90; i++) {              // ~135 s
    await new Promise(res => setTimeout(res, 1500));
    const s = await jsonFetch(getUrl, { headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` } });
    if (s.status === 'succeeded') return s;
    if (s.status === 'failed' || s.status === 'canceled') throw new Error('replicate_failed');
  }
  throw new Error('replicate_timeout');
}

// ---------- LLM Helper (Claude → OpenAI → OpenRouter) ----------
async function llmText(prompt, temperature = 0.7, max_tokens = 700) {
  if (ANTHROPIC_API_KEY) {
    const body = { model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620',
                   max_tokens, temperature, messages: [{ role: 'user', content: prompt }] };
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST', headers:{ 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    return j?.content?.[0]?.text || j?.content?.map?.(c => c?.text).join('\n') || '';
  }
  if (OPENAI_API_KEY) {
    const body = { model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                   messages:[{ role:'user', content: prompt }], temperature };
    const j = await jsonFetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', headers:{ 'Authorization':`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    return j.choices?.[0]?.message?.content || '';
  }
  if (OPENROUTER_API_KEY) {
    const body = { model: process.env.OPENROUTER_MODEL || 'mistralai/mixtral-8x7b-instruct',
                   messages:[{ role:'user', content: prompt }], temperature };
    const j = await jsonFetch('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST',
      headers:{
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type' : 'application/json',
        'HTTP-Referer' : 'https://hohl.rocks',
        'X-Title'      : 'hohl.rocks'
      },
      body: JSON.stringify(body)
    });
    return j.choices?.[0]?.message?.content || '';
  }
  throw new Error('no_llm_key');
}

// ---------- Handlers ----------
const handlers = {
  async 'zeitreise-tagebuch'(payload){
    const name = (payload?.input?.name || 'Alex') + '';
    const jahr = (payload?.input?.jahr || '2084') + '';
    const prompt = `Schreibe einen Tagebucheintrag auf Deutsch. Protagonist: ${name}. Jahr: ${jahr}.
Stil: nahbar, detailreich, glaubwürdig. 180-260 Wörter.`;
    return { type: 'text', text: await llmText(prompt, 0.8, 520) };
  },

  async 'weltbau'(payload){
    const stw = (payload?.input?.stichworte || 'zwei Monde, Handelsrouten, Drachen') + '';
    const prompt = `Baue eine fiktive Welt (deutsch) aus diesen Stichworten: ${stw}.
Gliedere in: Geografie, Gesellschaft, Technologie/Magie, Konflikte, Chancen.`;
    return { type: 'text', text: await llmText(prompt, 0.7, 700) };
  },

  async 'poesie-html'(payload){
    const thema = (payload?.input?.thema || 'Herbst') + '';
    const prompt = `Schreibe ein sehr kurzes Gedicht (4 Verse) über "${thema}" auf Deutsch.
Gib ausschließlich HTML zurück. Jeder Vers in <p>, farbig via inline style. Keine Skripte.`;
    return { type: 'html', html: await llmText(prompt, 0.9, 400) };
  },

  async 'bildgenerator'(payload){
    const prompt = (payload?.input?.prompt || 'ein futuristisches Stadtpanorama bei Nacht, neonfarben, cinematic') + '';
    const seedRaw = payload?.input?.seed;
    const seed    = seedRaw && String(seedRaw).trim() ? Number(seedRaw) : undefined;
    if (!REPLICATE_API_TOKEN) throw new Error('no_image_key');
    const modelOrVersion = REPLICATE_MODEL_VERSION || REPLICATE_SDXL_VERSION;
    if (!modelOrVersion) throw new Error('no_image_model_set');
    const isFlux = modelOrVersion.includes('flux');
    const input  = isFlux ? { prompt, aspect_ratio: '3:2', output_format:'png', seed }
                          : { prompt, width:768, height:512, num_inference_steps:30, seed };
    const result = await replicatePredictFlexible(modelOrVersion, input);
    let url = ''; 
    if (Array.isArray(result.output)) url = result.output[0] || '';
    else if (typeof result.output === 'string') url = result.output;
    else if (result.output?.image) url = result.output.image;
    return { type: 'image', url };
  },

  async 'musikgen'(payload){
    const beschreibung = (payload?.input?.beschreibung || 'fröhliche Klaviermelodie, 10 Sekunden') + '';
    if (!REPLICATE_API_TOKEN) throw new Error('no_audio_key');
    const modelOrVersion = REPLICATE_MUSICGEN_VERSION || 'facebook/musicgen';
    const result = await replicatePredictFlexible(modelOrVersion, { prompt: beschreibung, duration: 10 });
    const url = result.output?.audio || (Array.isArray(result.output) ? result.output[0] : '') || '';
    return { type: 'audio', url };
  },

  async 'bildbeschreibung'(payload){
    const base64 = payload?.files?.bild || '';
    if (!base64) throw new Error('no_image_provided');
    if (!REPLICATE_API_TOKEN) throw new Error('no_vision_key');
    const modelOrVersion = REPLICATE_LLAVA_VERSION || 'liuhaotian/llava-13b';
    const result = await replicatePredictFlexible(modelOrVersion, {
      image: `data:image/png;base64,${base64}`, prompt:'Beschreibe das Bild ausführlich auf Deutsch.'
    });
    const text = Array.isArray(result.output) ? result.output.join('\n') : (result.output?.text || result.output || '');
    return { type: 'text', text };
  }
};

// ---------- Router ----------
router.post('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const fn = handlers[id];
    if (!fn) return res.status(404).json({ error: 'unknown_bubble' });
    const out = await fn(req.body || {});
    res.json(out);
  } catch (e) {
    console.error('bubble error', e);
    res.status(500).json({ error: e?.message || 'bubble_failed' });
  }
});

export default router; // <— WICHTIG (fix für deinen Crash)
