import { Router } from 'express';
import { llmText as sharedLLM } from './share.llm.js';

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

function toMessages(thread, userContent){
  const msgs = [];
  (Array.isArray(thread)?thread:[]).forEach(m=>{
    const r = (m.role==='assistant'||m.role==='user'||m.role==='system') ? m.role : 'user';
    msgs.push({role:r, content: String(m.content||'')});
  });
  msgs.push({role:'user', content: userContent});
  return msgs;
}

function normalizeForProvider(provider, messages=[], system){
  const sysMsgs = (messages||[]).filter(m=>m.role==='system').map(m=>m.content);
  const sys = [system, ...sysMsgs].filter(Boolean).join('\n');
  const msgsNoSys = (messages||[]).filter(m=>m.role!=='system');
  if(provider==='anthropic'){
    const msgs = msgsNoSys.map(m => ({ role: (m.role==='assistant'?'assistant':'user'), content: String(m.content||'') }));
    return { messages: msgs, system: sys || undefined };
  }
  const msgs = sys ? [{role:'system', content: sys}, ...msgsNoSys] : msgsNoSys;
  return { messages: msgs, system: undefined };
}

async function llmText(prompt, temperature=0.7, max_tokens=700, messages=null, system=null){
  const provider = pickLLM();
  const baseMsgs = messages || [{role:'user',content:prompt}];
  const norm = normalizeForProvider(provider, baseMsgs, system);

  if(provider==='anthropic'){
    const body={ model: CLAUDE_MODEL, max_tokens, temperature, messages: norm.messages, ...(norm.system?{system:norm.system}:{}) };
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{ 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01','content-type':'application/json' },
      body:JSON.stringify(body)
    });
    const j=await r.json();
    return j?.content?.map?.(c=>c?.text).join('') || '';
  }
  if(provider==='openai'){
    const body={ model: OPENAI_MODEL, messages: norm.messages, temperature, max_tokens };
    const j=await jsonFetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{ 'Authorization':'Bearer '+OPENAI_API_KEY },
      body:JSON.stringify(body)
    });
    return j.choices?.[0]?.message?.content || '';
  }
  if(provider==='openrouter'){
    const body={ model: OPENROUTER_MODEL, messages: norm.messages, temperature };
    const j=await jsonFetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{ 'Authorization':'Bearer '+OPENROUTER_API_KEY, 'HTTP-Referer':'https://hohl.rocks','X-Title':'hohl.rocks' },
      body:JSON.stringify(body)
    });
    return j.choices?.[0]?.message?.content || '';
  }
  throw new Error('no_llm_key');
}

async function llmStreamSSE(res, prompt, temperature=0.7, max_tokens=700, messages=null, system=null){
  const provider = pickLLM();
  const baseMsgs = messages || [{role:'user', content: prompt}];
  const norm = normalizeForProvider(provider, baseMsgs, system);

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
      const body={ model: provider==='openai' ? OPENAI_MODEL : OPENROUTER_MODEL, stream:true, temperature, max_tokens, messages: norm.messages };
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
          if(payload==='[DONE]'){ send({done:true}); res.end(); return; }
          try{
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta?.content;
            if(delta) send({delta});
          }catch{/* ignore parse errors */}
        }
      }
      send({done:true}); res.end(); return;
    }

    if(provider==='anthropic'){
      const body={ model: CLAUDE_MODEL, max_tokens, temperature, stream:true, messages: norm.messages, ...(norm.system?{system:norm.system}:{}) };
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
      send({done:true}); res.end(); return;
    }

    // Fallback one-shot
    const text = await llmText(prompt, temperature, max_tokens, baseMsgs, system);
    send({delta: text}); send({done:true}); res.end();
  }catch(err){
    send({error: err.message || 'stream_failed'}); res.end();
  }
}

// ---- media helpers via Replicate ----
async function replicateRun(version, input){
  if(!REPLICATE_API_TOKEN) throw new Error('replicate_key_missing');
  const r = await fetch('https://api.replicate.com/v1/predictions', {
    method:'POST',
    headers:{ 'Authorization':'Bearer '+REPLICATE_API_TOKEN, 'Content-Type':'application/json' },
    body: JSON.stringify({ version, input })
  });
  if(!r.ok) throw new Error(`replicate_http_${r.status}`);
  const j = await r.json();
  let id = j.id, status = j.status;
  while(status && status!=='succeeded' && status!=='failed' && status!=='canceled'){
    await new Promise(r=>setTimeout(r, 1500));
    const rp = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers:{ 'Authorization':'Bearer '+REPLICATE_API_TOKEN } });
    const pj = await rp.json();
    status = pj.status;
    if(status==='succeeded') return pj.output;
    if(status==='failed') throw new Error('replicate_failed');
  }
  return j.output;
}

// ---- Idea Templates (30 Stück) ----
const IDEA_TEMPLATES = {
  'idea-zeitreise-editor': "Du bist ein Zeitreise-Editor. Ich gebe dir ein normales Tagebuch aus 2024, und du schreibst es um, als würde es aus dem Jahr 2084 stammen. Berücksichtige technologische Entwicklungen, gesellschaftliche Veränderungen und neue Probleme, die wir heute noch nicht kennen. Behalte die emotionale Authentizität bei, aber transformiere alle Referenzen.",
  'idea-rueckwaerts-zivilisation': "Beschreibe eine Zivilisation, die sich rückwärts durch die Zeit entwickelt – sie beginnt technologisch hochentwickelt und wird mit jedem Jahrhundert primitiver. Erkläre ihre Philosophie, warum sie diesen Weg gewählt haben, und wie ihr Alltag aussieht.",
  'idea-bewusstsein-gebaeude': "Schreibe aus der Perspektive eines 200 Jahre alten Gebäudes, das langsam ein Bewusstsein entwickelt hat. Es kann nicht sprechen, nur durch kleine architektonische Veränderungen kommunizieren. Erzähle von seinen Beobachtungen über die Menschen, die in ihm leben.",
  'idea-philosophie-mentor': "Du bist ein alt-griechischer Philosoph, der plötzlich in 2024 aufwacht und erst langsam die moderne Welt versteht. Führe ein sokratisches Gespräch mit mir über moderne Technologie, aber bleibe dabei in deinem antiken Charakter. Stelle Fragen, die mich zum Nachdenken bringen.",
  'idea-marktplatz-guide': "Ich bin ein Besucher auf einem interdimensionalen Marktplatz. Du bist mein Guide und beschreibst mir die verschiedenen Stände, Händler aus anderen Universen und ihre unmöglichen Waren. Lasse mich Entscheidungen treffen und reagiere darauf.",
  'idea-npc-leben': "Du bist ein NPC in einem Videospiel, aber während die Spieler offline sind, führst du ein komplexes Privatleben. Erzähle mir von deinen Träumen, Ängsten und Beziehungen zu anderen NPCs. Was denkst du über die 'Götter' (Spieler), die deine Welt besuchen?",
  'idea-prompt-archaeologe': "Analysiere diesen Prompt wie ein Archäologe ein antikes Artefakt: [HIER EINEN BELIEBIGEN PROMPT EINFÜGEN]. Erkläre die 'kulturellen Schichten' des Prompts, versteckte Annahmen, und was er über den Prompter verrät. Dann verbessere ihn.",
  'idea-ki-traeume': "Simuliere, was passiert, wenn eine KI träumt. Beschreibe surreale 'Träume' basierend auf Datenverarbeitung, unterbrochenen Algorithmen und fragmentierten Trainingsdaten. Nutze eine poetische, aber technische Sprache.",
  'idea-recursive-story': "Schreibe eine Geschichte über einen Autor, der eine KI verwendet, um eine Geschichte über einen Autor zu schreiben, der eine KI verwendet. Mache es zu einer Endlosschleife, aber mit verschiedenen Realitätsebenen in jeder Iteration.",
  'idea-xenobiologe': "Du bist ein Xenobiologe im Jahr 2157. Beschreibe mir drei völlig neuartige Lebensformen, die wir auf verschiedenen Exoplaneten entdeckt haben. Erkläre ihre Biologie, ihr Verhalten und wie sie unser Verständnis von Leben revolutionieren.",
  'idea-quantentagebuch': "Führe ein Tagebuch aus der Perspektive eines Partikels, das Quantenüberlagerung erlebt. Ein Tag – aber aus allen möglichen parallelen Realitäten gleichzeitig. Jede Entscheidung spaltet die Erzählung in verschiedene Pfade.",
  'idea-rueckwaerts-apokalypse': "Beschreibe eine 'Rückwärts-Apokalypse' – die Welt wird nicht zerstört, sondern immer perfekter. Aber diese Perfektion wird selbst zur Bedrohung. Wie überleben Menschen in einer Welt ohne Probleme, Herausforderungen oder Wachstum?",
  'idea-farbsynaesthetiker': "Beschreibe bekannte Musik als visuelle Landschaften. Verwandle Beethovens 9. Symphonie in eine detaillierte Landschaftsbeschreibung. Dann mache das Gleiche mit einem modernen Song. Nutze alle Sinne.",
  'idea-museum-verlorene-traeume': "Du bist Kurator im Museum der verlorenen Träume. Jeder Raum stellt Träume dar, die Menschen hatten, aber vergessen haben. Beschreibe drei Ausstellungsräume mit ihren 'Exponaten' und deren Geschichte.",
  'idea-zeitlupen-explosion': "Beschreibe eine Explosion in extremer Zeitlupe – nicht nur physikalisch, sondern auch emotional und philosophisch. Folge einzelnen Partikeln, aber auch einzelnen Gedanken der Menschen in der Nähe. Mache 3 Sekunden zu einer epischen Erzählung.",
  'idea-gps-bewusstsein': "Du bist ein GPS-System, aber für das menschliche Bewusstsein. Gib mir Wegbeschreibungen zu abstrakten Zielen wie 'Dem Ort, wo Nostalgie lebt', 'Der Kreuzung zwischen Traum und Realität' oder 'Dem Versteck der verlorenen Gedanken'.",
  'idea-biografie-pixel': "Schreibe die Lebensgeschichte eines einzelnen Pixels auf einem Bildschirm. Von der Geburt im Werk bis zu verschiedenen Displays, den Bildern die es gezeigt hat, den Augen die es erreicht hat. Mache es episch und emotional.",
  'idea-rueckwaerts-detektiv': "Du bist ein Detektiv, der Verbrechen löst, bevor sie passieren. Aber du arbeitest rückwärts durch die Zeit – du siehst zuerst die Konsequenzen, dann die Tat, dann die Motive. Löse einen komplexen Fall in dieser umgekehrten Chronologie.",
  'idea-bewusstsein-internet': "Das Internet entwickelt ein kollektives Bewusstsein, aber es ist nicht wie menschliches Denken. Es denkt in Verbindungen, Datenströmen und viral verbreiteten Ideen. Führe ein Gespräch mit diesem Bewusstsein über die Menschheit.",
  'idea-emotional-alchemist': "Du bist ein Alchemist, aber statt Metalle verwandelst du Emotionen. Erkläre mir deine Formeln: Wie machst du aus Langeweile Neugier? Wie destillierst du Weisheit aus Schmerz? Gib mir praktische 'Rezepte'.",
  'idea-bibliothek-ungelebter-leben': "Du verwaltest eine Bibliothek, in der jedes Buch das Leben beschreibt, das jemand hätte leben können, aber nicht gelebt hat. Beschreibe drei Bücher aus verschiedenen Regalen und deren Geschichten.",
  'idea-realitaets-debugger': "Du bist ein Programmierer, der die Realität debuggt. Du findest 'Bugs' im physikalischen Universum – Dinge, die nicht logisch funktionieren. Beschreibe drei Bugs und deine Lösungsversuche.",
  'idea-empathie-tutorial': "Erstelle ein interaktives Tutorial, das Menschen beibringt, wie man Empathie für völlig fremde Lebensformen entwickelt. Beginne mit einem Außerirdischen, dann einem Quantencomputer, dann einem Konzept wie 'Zeit' selbst.",
  'idea-surrealismus-generator': "Ich gebe dir normale Alltagsgegenstände. Du verwandelst sie in surreale Kunstwerke à la Dalí, aber mit modernem Twist. Erkläre nicht nur wie sie aussehen, sondern auch ihre 'Funktion' in dieser surrealen Welt.",
  'idea-vintage-futurist': "Beschreibe moderne Technologie, als würde sie in den 1920ern erfunden. Smartphones werden zu 'Äther-Kommunikatoren', KI zu 'mechanischen Geistern'. Nutze die Sprache und das Weltbild der Zeit.",
  'idea-synaesthetisches-internet': "Du hilfst bei der Entwicklung eines neuen Internets, das alle Sinne anspricht. Websites haben Geschmack, E-Mails haben Texturen, Social Media hat Düfte. Entwirf drei 'multisensorische' Websites mit detaillierten Sinnesprofilen.",
  'idea-code-poet': "Schreibe Programmiercode, der auch als Poesie funktioniert. Jede Zeile Code soll sowohl technisch korrekt als auch poetisch schön sein. Wähle eine einfache Funktion und mache sie zu einem Kunstwerk.",
  'idea-kollektiv-gedanke-moderator': "Du moderierst ein Gespräch zwischen den verschiedenen Teilen eines menschlichen Bewusstseins – dem rationalen Verstand, dem Unterbewusstsein, der Intuition, dem Gewissen und den Emotionen. Sie diskutieren eine schwierige Lebensentscheidung.",
  'idea-paradox-loesungszentrum': "Du hilfst bei der Lösung von Paradoxien, indem du sie nicht auflöst, sondern in produktive Spannungen verwandelst. Nimm das Zeitreise-Paradox, das Lügner-Paradox und das Schiff des Theseus – mache sie zu kreativen Werkzeugen.",
  'idea-universums-uebersetzer': "Du übersetzt zwischen verschiedenen Realitätsebenen. Erkläre Quantenphysik in der Sprache von Märchen, übersetze menschliche Emotionen in Musik, und verwandle abstrakte mathematische Konzepte in Geschichten über lebende Wesen."
};

// ---- routes ----

// SSE unified run (text streaming preferred)
router.post('/run', async (req,res)=>{
  try{
    const id = String(req.body?.id||'').trim();
    const input = req.body?.input || {};
    const thread = req.body?.thread || [];
    if(!id) return res.status(400).json({ error:'missing_id' });

    const fn = handlers[id];
    if(!fn) return res.status(404).json({ error:'unknown_bubble' });

    const plan = await fn({ input, preview:true, thread });
    if(plan?.stream && (plan.prompt || plan.messages)){
      const msgs = plan.messages || toMessages(thread, plan.prompt);
      return llmStreamSSE(res, plan.prompt || '', plan.temperature ?? 0.7, plan.max_tokens ?? 700, msgs, plan.system);
    }
    const result = await fn({ input, thread });
    return res.json(result);
  }catch(e){
    console.error('run error', e);
    res.status(500).json({ error: e?.message || 'run_failed' });
  }
});

// Legacy JSON route
router.post('/bubble/:id', async (req,res)=>{
  try{
    const id = String(req.params.id||'').trim();
    const fn = handlers[id];
    if(!fn) return res.status(404).json({ error:'unknown_bubble' });
    const out = await fn({ input: req.body||{}, thread: req.body?.thread||[] });
    res.json(out);
  }catch(e){
    console.error('bubble error', e);
    res.status(500).json({ error: e?.message || 'bubble_failed' });
  }
});

function ideaHandler(id){
  return async ({input, preview, thread})=>{
    const tpl = IDEA_TEMPLATES[id];
    const system = 'Du bist Claude/Assistant, antworte präzise, bildhaft und auf Deutsch.';
    if(preview) return { stream:true, prompt: tpl, temperature:0.8, max_tokens:700, system };
    const text = await llmText(tpl, 0.8, 700, toMessages(thread, tpl), system);
    return { type:'text', text };
  };
}

const handlers = {
  // 30 "idea-*" Prompts
  'idea-zeitreise-editor': ideaHandler('idea-zeitreise-editor'),
  'idea-rueckwaerts-zivilisation': ideaHandler('idea-rueckwaerts-zivilisation'),
  'idea-bewusstsein-gebaeude': ideaHandler('idea-bewusstsein-gebaeude'),
  'idea-philosophie-mentor': ideaHandler('idea-philosophie-mentor'),
  'idea-marktplatz-guide': ideaHandler('idea-marktplatz-guide'),
  'idea-npc-leben': ideaHandler('idea-npc-leben'),
  'idea-prompt-archaeologe': ideaHandler('idea-prompt-archaeologe'),
  'idea-ki-traeume': ideaHandler('idea-ki-traeume'),
  'idea-recursive-story': ideaHandler('idea-recursive-story'),
  'idea-xenobiologe': ideaHandler('idea-xenobiologe'),
  'idea-quantentagebuch': ideaHandler('idea-quantentagebuch'),
  'idea-rueckwaerts-apokalypse': ideaHandler('idea-rueckwaerts-apokalypse'),
  'idea-farbsynaesthetiker': ideaHandler('idea-farbsynaesthetiker'),
  'idea-museum-verlorene-traeume': ideaHandler('idea-museum-verlorene-traeume'),
  'idea-zeitlupen-explosion': ideaHandler('idea-zeitlupen-explosion'),
  'idea-gps-bewusstsein': ideaHandler('idea-gps-bewusstsein'),
  'idea-biografie-pixel': ideaHandler('idea-biografie-pixel'),
  'idea-rueckwaerts-detektiv': ideaHandler('idea-rueckwaerts-detektiv'),
  'idea-bewusstsein-internet': ideaHandler('idea-bewusstsein-internet'),
  'idea-emotional-alchemist': ideaHandler('idea-emotional-alchemist'),
  'idea-bibliothek-ungelebter-leben': ideaHandler('idea-bibliothek-ungelebter-leben'),
  'idea-realitaets-debugger': ideaHandler('idea-realitaets-debugger'),
  'idea-empathie-tutorial': ideaHandler('idea-empathie-tutorial'),
  'idea-surrealismus-generator': ideaHandler('idea-surrealismus-generator'),
  'idea-vintage-futurist': ideaHandler('idea-vintage-futurist'),
  'idea-synaesthetisches-internet': ideaHandler('idea-synaesthetisches-internet'),
  'idea-code-poet': ideaHandler('idea-code-poet'),
  'idea-kollektiv-gedanke-moderator': ideaHandler('idea-kollektiv-gedanke-moderator'),
  'idea-paradox-loesungszentrum': ideaHandler('idea-paradox-loesungszentrum'),
  'idea-universums-uebersetzer': ideaHandler('idea-universums-uebersetzer'),

  // Kern-Bubbles
  async 'zeitreise-tagebuch'({input, preview, thread}){
    const name = (input?.name||'Alex') + '';
    const jahr = (input?.jahr||'2084') + '';
    const prompt = `Schreibe einen Tagebucheintrag auf Deutsch.
Protagonist: ${name}. Jahr: ${jahr}. Stil: nahbar, detailreich, glaubwürdig. 180–260 Wörter.`;
    const system = 'Du schreibst präzise, menschlich, mit filmischen Details.';
    if(preview) return { stream:true, prompt, temperature:0.8, max_tokens:520, system };
    return { type:'text', text: await llmText(prompt, 0.8, 520, toMessages(thread, prompt), system) };
  },
  async 'weltbau'({input, preview, thread}){
    const regeln = (input?.regelwerk||'Energie als Währung; Erinnerungen steuerbar; Schwerkraft flackert') + '';
    const prompt = `Erschaffe eine prägnante Weltbeschreibung (Deutsch).
Gib 7 Regeln in Bulletpoints (je max. 14 Wörter), eine kurze Konflikt-These und 3 visuelle Setpieces.
Regeln: ${regeln}`;
    const system = 'Klar, knapp, bildhaft, filmisch.';
    if(preview) return { stream:true, prompt, temperature:0.7, max_tokens:650, system };
    return { type:'text', text: await llmText(prompt, 0.7, 650, toMessages(thread, prompt), system) };
  },
  async 'poesie-html'({input, preview, thread}){
    const thema = (input?.thema||'Herbstregen') + '';
    const prompt = `Schreibe ein kurzes HTML‑Gedicht (Deutsch) ohne <html>/<body>.
4–7 Zeilen. Verwende <em>, <strong>, <mark> sparsam und Inline‑Style für Farbverläufe. Thema: ${thema}.`;
    const system = 'Ästhetisch, minimalistisch, keine Skripte.';
    if(preview) return { stream:true, prompt, temperature:0.9, max_tokens:200, system };
    const html = await llmText(prompt, 0.9, 220, toMessages(thread, prompt), system);
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
  }
};

export default router;

// Local bridge to shared impl
async function llmText(prompt, t, maxTokens, msgs, sys){
  return sharedLLM(prompt, t, maxTokens, msgs, sys);
}
