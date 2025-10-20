'use strict';

/**
 * Provider-agnostische LLM-Helfer für Textkompletion & Streaming
 * Unterstützt OpenRouter (bevorzugt), OpenAI (fallback) und Anthropic (fallback).
 * Hinweis: Für Streaming verwenden wir das OpenAI/OpenRouter Chat-Completion-Format.
 */

const DEFAULT_SYSTEM = "Du bist ein hilfreicher, präziser Assistent. Antworte knapp, klar und auf Deutsch.";
const READ_TIMEOUT_MS = 60_000;

function env(name, fallback) {
  return process.env[name] ?? fallback;
}

function pickModel() {
  if (env('OPENROUTER_API_KEY')) return { provider: 'openrouter', model: env('OPENROUTER_MODEL','mistralai/mistral-small') };
  if (env('OPENAI_API_KEY')) return { provider: 'openai', model: env('OPENAI_MODEL','gpt-4o-mini') };
  if (env('ANTHROPIC_API_KEY')) return { provider: 'anthropic', model: env('CLAUDE_MODEL','claude-3-5-sonnet-20241022') };
  return { provider: null, model: null };
}

function withTimeout(promise, ms=READ_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
}

async function completeText(userPrompt, opts={}) {
  const { provider, model } = pickModel();
  const system = opts.system || DEFAULT_SYSTEM;
  if (!provider) {
    return "[LLM nicht konfiguriert] " + userPrompt.slice(0, 200);
  }

  if (provider === 'openrouter') {
    const resp = await withTimeout(fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization":`Bearer ${env('OPENROUTER_API_KEY')}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3
      })
    }));
    if (!resp.ok) {
      const t = await resp.text().catch(()=>'');
      throw new Error("openrouter failed " + resp.status + " " + t.slice(0,180));
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  if (provider === 'openai') {
    const resp = await withTimeout(fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization":`Bearer ${env('OPENAI_API_KEY')}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3
      })
    }));
    if (!resp.ok) {
      const t = await resp.text().catch(()=>'');
      throw new Error("openai failed " + resp.status + " " + t.slice(0,180));
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  if (provider === 'anthropic') {
    const resp = await withTimeout(fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers: {
        "Content-Type":"application/json",
        "x-api-key": env('ANTHROPIC_API_KEY'),
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        system,
        max_tokens: 512,
        messages: [{ role:"user", content: userPrompt }]
      })
    }));
    if (!resp.ok) {
      const t = await resp.text().catch(()=>'');
      throw new Error("anthropic failed " + resp.status + " " + t.slice(0,180));
    }
    const data = await resp.json();
    const content = data.content?.[0]?.text ?? "";
    return content;
  }

  return "";
}

async function *streamText(userPrompt, opts={}) {
  const { provider, model } = pickModel();
  const system = opts.system || DEFAULT_SYSTEM;
  if (!provider) {
    yield "LLM nicht konfiguriert.";
    return;
  }

  if (provider === 'openrouter' || provider === 'openai') {
    const url = provider === 'openrouter'
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const headers = {
      "Content-Type":"application/json",
      "Authorization": provider === 'openrouter'
        ? `Bearer ${env('OPENROUTER_API_KEY')}`
        : `Bearer ${env('OPENAI_API_KEY')}`
    };
    const body = JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      stream: true
    });
    const resp = await fetch(url, { method:"POST", headers, body });
    if (!resp.ok || !resp.body) {
      const t = await resp.text().catch(()=>'');
      throw new Error(provider+" stream failed " + resp.status + " " + t.slice(0,180));
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") { return; }
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta?.content ?? "";
          if (delta) yield delta;
        } catch (e) {
          // ignore non-JSON keepalive chunks
        }
      }
    }
    return;
  }

  // Anthropic – kein SSE hier (einfacher Fallback)
  const text = await completeText(userPrompt, { system });
  yield text;
}

module.exports = { completeText, streamText };
