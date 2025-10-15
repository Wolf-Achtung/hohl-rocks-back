// Shared LLM helper (Anthropic > OpenAI > OpenRouter)
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620';
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free';

function pickLLM(){
  if(ANTHROPIC_API_KEY) return 'anthropic';
  if(OPENAI_API_KEY) return 'openai';
  if(OPENROUTER_API_KEY) return 'openrouter';
  return null;
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

export async function llmText(prompt, temperature=0.7, max_tokens=700, messages=null, system=null){
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
    const r = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{ 'Authorization':'Bearer '+OPENAI_API_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    return j.choices?.[0]?.message?.content || '';
  }
  if(provider==='openrouter'){
    const body={ model: OPENROUTER_MODEL, messages: norm.messages, temperature };
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST',
      headers:{
        'Authorization':'Bearer '+OPENROUTER_API_KEY,
        'HTTP-Referer':'https://hohl.rocks',
        'X-Title':'hohl.rocks',
        'Content-Type':'application/json'
      },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    return j.choices?.[0]?.message?.content || '';
  }
  throw new Error('no_llm_key');
}
