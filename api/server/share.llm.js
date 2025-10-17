/**
 * Provider chain with graceful fallback:
 * Anthropic -> OpenAI -> OpenRouter -> fallback echo
 */
export async function runLLM({ system = "", user = "", maxTokens = 750 }) {
  const chain = [runAnthropic, runOpenAI, runOpenRouter, runEcho];
  for (const fn of chain) {
    try {
      const out = await fn({ system, user, maxTokens });
      if (out && out.text) return out;
    } catch (e) { /* continue */ }
  }
  return { text: "Kein Provider verfügbar." };
}

async function runAnthropic({ system, user, maxTokens }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw 0;
  const model = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system,
      messages: [{ role: "user", content: user }]
    })
  });
  if (!r.ok) throw 0;
  const j = await r.json();
  const text = (j?.content?.[0]?.text) || "";
  return { text };
}

async function runOpenAI({ system, user, maxTokens }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw 0;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.7,
      messages: [{ role: "system", content: system }, { role: "user", content: user }]
    })
  });
  if (!r.ok) throw 0;
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content || "";
  return { text };
}

async function runOpenRouter({ system, user, maxTokens }) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw 0;
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content: user }]
    })
  });
  if (!r.ok) throw 0;
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content || "";
  return { text };
}

async function runEcho({ system, user }) {
  return { text: `SYSTEM:\n${system}\n\nUSER:\n${user}\n\n(Hinweis: Fallback ohne LLM-Key aktiv)` };
}
