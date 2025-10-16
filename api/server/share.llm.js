/* Shared LLM utilities: streams Anthropic or OpenAI, whichever key is present */
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function activeProvider() {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export async function* streamLLM({ system = "", user = "" }) {
  const provider = activeProvider();
  if (!provider) throw new Error("no_llm_key");

  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        system,
        max_tokens: 1200,
        stream: true,
        messages: [{ role: "user", content: user || "Los geht's." }]
      })
    });
    if (!r.ok || !r.body) throw new Error("anthropic_http_" + r.status);

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split("\n\n");
      buf = chunks.pop() || "";
      for (const c of chunks) {
        const line = c.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          if (j.type === "content_block_delta" && j.delta?.text) {
            yield j.delta.text;
          }
        } catch {}
      }
    }
    return;
  }

  if (provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        stream: true,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user || "Los geht's." }
        ]
      })
    });
    if (!r.ok || !r.body) throw new Error("openai_http_" + r.status);

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const p of parts) {
        if (!p.startsWith("data:")) continue;
        const payload = p.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {}
      }
    }
    return;
  }

  throw new Error("unsupported_provider");
}
