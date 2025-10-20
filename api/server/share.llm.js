// api/server/share.llm.js
import { createParser } from 'eventsource-parser';

/**
 * Provider selection
 */
function pickProvider({ provider, euOnly } = {}){
  const has = {
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY
  };
  if (provider) return provider;
  if (euOnly){
    // Prefer OpenRouter in EU-only mode to give more control over routing
    if (has.openrouter) return 'openrouter';
    if (has.anthropic) return 'anthropic';
    if (has.openai) return 'openai';
    return 'none';
  }
  if (has.anthropic) return 'anthropic';
  if (has.openai) return 'openai';
  if (has.openrouter) return 'openrouter';
  return 'none';
}

/**
 * Non-streaming completion
 */
export async function completeText(prompt, { system, provider, euOnly } = {}){
  const picked = pickProvider({ provider, euOnly });
  try{
    if (picked === 'openai' && process.env.OPENAI_API_KEY){
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.7,
          messages: [ system ? { role:'system', content: system } : null, { role:'user', content: String(prompt) } ].filter(Boolean)
        })
      });
      const j = await r.json();
      return j?.choices?.[0]?.message?.content?.trim?.() || 'Keine Antwort.';
    }
    if (picked === 'anthropic' && process.env.ANTHROPIC_API_KEY){
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version':'2023-06-01'
        },
        body: JSON.stringify({
          model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
          system,
          max_tokens: 900,
          messages: [{ role:'user', content: String(prompt) }]
        })
      });
      const j = await r.json();
      const content = Array.isArray(j?.content)
        ? j.content.map(x=>x?.text || '').join('')
        : (j?.content || '');
      return (content || '').trim() || 'Keine Antwort.';
    }
    if (picked === 'openrouter' && process.env.OPENROUTER_API_KEY){
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku:beta',
          temperature: 0.7,
          messages: [ system ? { role:'system', content: system } : null, { role:'user', content: String(prompt) } ].filter(Boolean)
        })
      });
      const j = await r.json();
      return j?.choices?.[0]?.message?.content?.trim?.() || 'Keine Antwort.';
    }
  } catch(e){ console.error('[llm.complete] error', e); }
  return '⟪' + String(prompt).slice(0, 80) + '⟫';
}

/**
 * Streaming completion – calls onToken(fragment) repeatedly.
 */
export async function streamText(prompt, { system, provider, euOnly } = {}, onToken){
  const picked = pickProvider({ provider, euOnly });

  async function stream(url, headers, body, extract){
    const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
    if (!r.ok){
      const t = await r.text().catch(()=>String(r.status));
      throw new Error(`stream_http_${r.status}: ${t.slice(0,200)}`);
    }
    if (r.headers.get('content-type')?.includes('text/event-stream')){
      const parser = createParser((event) => {
        if (event.type !== 'event') return;
        try{
          if (event.data === '[DONE]') return;
          const j = JSON.parse(event.data);
          const frag = extract(j);
          if (frag) onToken(frag);
        } catch{}
      });
      for await (const chunk of r.body){
        parser.feed(chunk.toString());
      }
    } else {
      // Some providers return a ReadableStream of JSON chunks; fallback to text
      const t = await r.text();
      onToken(t);
    }
  }

  try{
    if (picked === 'openai' && process.env.OPENAI_API_KEY){
      return stream('https://api.openai.com/v1/chat/completions',
        { 'Content-Type':'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature:0.7, stream:true,
          messages: [ system ? { role:'system', content: system } : null, { role:'user', content: String(prompt) } ].filter(Boolean)
        },
        j => j?.choices?.[0]?.delta?.content
      );
    }
    if (picked === 'anthropic' && process.env.ANTHROPIC_API_KEY){
      return stream('https://api.anthropic.com/v1/messages',
        { 'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01' },
        { model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022', system, max_tokens:900, stream:true,
          messages:[{role:'user', content:String(prompt)}]
        },
        j => j?.type === 'content_block_delta' && j?.delta?.text ? j.delta.text : ''
      );
    }
    if (picked === 'openrouter' && process.env.OPENROUTER_API_KEY){
      return stream('https://openrouter.ai/api/v1/chat/completions',
        { 'Content-Type':'application/json', 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
        { model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku:beta', temperature:0.7, stream:true,
          messages: [ system ? { role:'system', content: system } : null, { role:'user', content: String(prompt) } ].filter(Boolean)
        },
        j => j?.choices?.[0]?.delta?.content
      );
    }
  } catch(e){ console.error('[llm.stream] error', e); }
  onToken('⟪' + String(prompt).slice(0, 80) + '⟫');
}
