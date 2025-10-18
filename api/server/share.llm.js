/**
 * Simple LLM abstraction. Chooses a provider based on available env vars.
 * Returns plain text. If no provider is configured, returns a deterministic fallback.
 */
export async function completeText(prompt, { system, provider } = {}){
  const headers = (obj)=> ({ 'Content-Type': 'application/json', ...obj });

  // Prefer explicit provider
  const has = {
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY
  };
  const pick = provider || (has.openai ? 'openai' : has.anthropic ? 'anthropic' : has.openrouter ? 'openrouter' : 'none');

  try {
    if (pick === 'openai' && has.openai){
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: headers({ 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }),
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            system ? { role: 'system', content: system } : null,
            { role: 'user', content: prompt }
          ].filter(Boolean),
          temperature: 0.7
        })
      });
      const j = await r.json();
      return j?.choices?.[0]?.message?.content?.trim() || 'Keine Antwort.';
    }

    if (pick === 'anthropic' && has.anthropic){
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: headers({
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }),
        body: JSON.stringify({
          model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
          system,
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const j = await r.json();
      const content = Array.isArray(j?.content) ? j.content.map(x => x.text || '').join('\n').trim() : (j?.content || '');
      return content || 'Keine Antwort.';
    }

    if (pick === 'openrouter' && has.openrouter){
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: headers({
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        }),
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku:beta',
          messages: [
            system ? { role: 'system', content: system } : null,
            { role: 'user', content: prompt }
          ].filter(Boolean),
          temperature: 0.7
        })
      });
      const j = await r.json();
      return j?.choices?.[0]?.message?.content?.trim() || 'Keine Antwort.';
    }
  } catch (err) {
    console.error('[llm] error', err);
    return 'Fehler bei der Modell-Abfrage.';
  }

  // Fallback: deterministic text (makes UI usable without keys)
  return `Demo-Antwort: (kein KI-Provider konfiguriert)\n\n${prompt.slice(0, 300)}`;
}
