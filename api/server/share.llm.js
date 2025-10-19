import { createParser } from 'eventsource-parser';

function pickProvider({ provider, euOnly }){
  const has = { openai: !!process.env.OPENAI_API_KEY, anthropic: !!process.env.ANTHROPIC_API_KEY, openrouter: !!process.env.OPENROUTER_API_KEY };
  if (provider) return provider;
  if (euOnly){ if (has.openrouter) return 'openrouter'; return has.anthropic ? 'anthropic' : (has.openai ? 'openai' : 'none'); }
  return has.anthropic ? 'anthropic' : (has.openai ? 'openai' : (has.openrouter ? 'openrouter' : 'none'));
}

export async function completeText(prompt, { system, provider, euOnly } = {}){
  const picked = pickProvider({ provider, euOnly });
  try{
    if (picked === 'openai' && process.env.OPENAI_API_KEY){
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: [ system ? { role:'system', content: system } : null, { role:'user', content: prompt } ].filter(Boolean), temperature: 0.7 })
      });
      const j = await r.json(); return j?.choices?.[0]?.message?.content?.trim() || 'Keine Antwort.';
    }
    if (picked === 'anthropic' && process.env.ANTHROPIC_API_KEY){
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
        body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022', system, max_tokens: 900, messages: [{ role:'user', content: prompt }] })
      });
      const j = await r.json(); const content = Array.isArray(j?.content) ? j.content.map(x => x.text || '').join('\n').trim() : (j?.content || ''); return content || 'Keine Antwort.';
    }
    if (picked === 'openrouter' && process.env.OPENROUTER_API_KEY){
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
        body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'mistralai/mistral-small', messages: [ system ? { role:'system', content: system } : null, { role:'user', content: prompt } ].filter(Boolean), temperature: 0.7 })
      });
      const j = await r.json(); return j?.choices?.[0]?.message?.content?.trim() || 'Keine Antwort.';
    }
  } catch(e){ console.error('[llm.complete] error', e); return 'Fehler bei der Modell-Abfrage.'; }
  return `Demo-Antwort (kein Provider):\n\n${prompt.slice(0,500)}`;
}

export async function streamText(prompt, { system, provider, euOnly } = {}, onToken){
  const picked = pickProvider({ provider, euOnly });
  async function stream(url, headers, payload, pickDelta){
    const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(payload) });
    const reader = r.body.getReader(); const decoder = new TextDecoder(); const parser = createParser((ev)=>{
      if (ev.type === 'event'){
        if (ev.data === '[DONE]') return;
        try { const j = JSON.parse(ev.data); const tok = pickDelta(j) || ''; if (tok) onToken(tok); } catch {}
      }
    });
    while(true){ const {done, value} = await reader.read(); if (done) break; parser.feed(decoder.decode(value)); }
  }
  try{
    if (picked === 'openai' && process.env.OPENAI_API_KEY){
      return stream('https://api.openai.com/v1/chat/completions',
        { 'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}` },
        { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', stream:true, messages:[ system ? {role:'system', content:system}:null, {role:'user', content:prompt}].filter(Boolean), temperature:0.7 },
        j=> j?.choices?.[0]?.delta?.content);
    }
    if (picked === 'anthropic' && process.env.ANTHROPIC_API_KEY){
      return stream('https://api.anthropic.com/v1/messages',
        { 'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01' },
        { model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022', stream:true, system, max_tokens:900, messages:[{role:'user', content:prompt}] },
        j=> j?.type==='content_block_delta' && j?.delta?.text ? j.delta.text : '');
    }
    if (picked === 'openrouter' && process.env.OPENROUTER_API_KEY){
      return stream('https://openrouter.ai/api/v1/chat/completions',
        { 'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENROUTER_API_KEY}` },
        { model: process.env.OPENROUTER_MODEL || 'mistralai/mistral-small', stream:true, messages:[ system ? {role:'system', content:system}:null, {role:'user', content:prompt}].filter(Boolean), temperature:0.7 },
        j=> j?.choices?.[0]?.delta?.content);
    }
  } catch(e){ console.error('[llm.stream] error', e); }
  onToken(`⟪${prompt.slice(0,80)}⟫`);
}
