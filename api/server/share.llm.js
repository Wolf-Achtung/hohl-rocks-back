import fetch from 'node-fetch';

const AKey = process.env.ANTHROPIC_API_KEY || '';
const OKey = process.env.OPENAI_API_KEY || '';
const ORKey = process.env.OPENROUTER_API_KEY || '';
const SiteURL = process.env.SITE_URL || 'https://hohl.rocks';

async function streamAnthropic({ prompt, system, temperature = 0.2, model = 'claude-3-5-sonnet-20241022', onToken }) {
  const url = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': AKey,
    'anthropic-version': '2023-06-01'
  };
  const body = {
    model,
    system: system || undefined,
    max_tokens: 1024,
    temperature,
    stream: true,
    messages: [{ role: 'user', content: prompt }]
  };
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`anthropic_http_${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    // Anthropic streams JSON lines 'event: message_start|content_block_delta|... data: {...}'
    for (const line of chunk.split('\n')) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const json = s.slice(5).trim();
      if (!json || json === '[DONE]') continue;
      try {
        const obj = JSON.parse(json);
        if (obj?.type === 'content_block_delta' && obj.delta?.text) {
          onToken(obj.delta.text);
        }
      } catch {}
    }
  }
}

async function streamOpenAI({ prompt, system, temperature = 0.2, model = 'gpt-4o-mini', onToken }) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OKey}`
  };
  const body = {
    model,
    temperature,
    stream: true,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt }
    ]
  };
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`openai_http_${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const obj = JSON.parse(payload);
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta) onToken(delta);
      } catch {}
    }
  }
}

async function streamOpenRouter({ prompt, system, temperature = 0.2, model = 'anthropic/claude-3.5-sonnet', onToken }) {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ORKey}`,
    'HTTP-Referer': SiteURL,
    'X-Title': 'hohl.rocks'
  };
  const body = {
    model,
    temperature,
    stream: true,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt }
    ]
  };
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`openrouter_http_${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const obj = JSON.parse(payload);
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta) onToken(delta);
      } catch {}
    }
  }
}

export async function runLLM({ prompt, system, temperature = 0.2, model, provider, onToken, onDone, onError }) {
  const tried = [];
  async function tryOne(name, fn) {
    tried.push(name);
    await fn().catch((e) => { throw new Error(`${name}:${e.message || e}`); });
  }
  try {
    if (provider === 'anthropic' && AKey) {
      await tryOne('anthropic', () => streamAnthropic({ prompt, system, temperature, model, onToken }));
    } else if (provider === 'openai' && OKey) {
      await tryOne('openai', () => streamOpenAI({ prompt, system, temperature, model, onToken }));
    } else if (provider === 'openrouter' && ORKey) {
      await tryOne('openrouter', () => streamOpenRouter({ prompt, system, temperature, model, onToken }));
    } else {
      // default priority
      if (AKey) await tryOne('anthropic', () => streamAnthropic({ prompt, system, temperature, model, onToken }));
      else if (OKey) await tryOne('openai', () => streamOpenAI({ prompt, system, temperature, model, onToken }));
      else if (ORKey) await tryOne('openrouter', () => streamOpenRouter({ prompt, system, temperature, model, onToken }));
      else throw new Error('no_provider_keys');
    }
    onDone && onDone({ ok: true, tried });
  } catch (e) {
    onError && onError(e);
  }
}
