/**
 * Unified text generation with provider fallback.
 * Order: Anthropic -> OpenAI -> OpenRouter -> Replicate (optional placeholder)
 * Returns **string** (we stream to client by chunking that string).
 */
const env = (k, d=undefined) => (process.env[k] ?? d);

const fetchJson = async (url, opts) => {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const txt = await r.text().catch(()=> "");
    throw new Error(`HTTP ${r.status} ${url}: ${txt}`);
  }
  return r.json();
};

export async function genText({system="", user="", maxTokens=900}){
  // 1) Anthropic
  const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
  if(ANTHROPIC_API_KEY){
    const model = env("CLAUDE_MODEL","claude-3-5-sonnet-latest");
    const url = "https://api.anthropic.com/v1/messages";
    const body = {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{role:"user", content:user}]
    };
    const j = await fetchJson(url, {
      method:"POST",
      headers: {
        "content-type":"application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
    });
    const text = (j?.content?.[0]?.text ?? "").toString();
    if(text) return text;
  }

  // 2) OpenAI
  const OPENAI_API_KEY = env("OPENAI_API_KEY");
  if(OPENAI_API_KEY){
    const model = env("OPENAI_MODEL","gpt-4o-mini");
    const url = "https://api.openai.com/v1/chat/completions";
    const body = {
      model,
      temperature: 0.3,
      messages: [
        ...(system? [{role:"system", content:system}] : []),
        {role:"user", content:user}
      ],
      max_tokens: maxTokens
    };
    const j = await fetchJson(url, {
      method:"POST",
      headers:{
        "content-type":"application/json",
        "authorization":"Bearer " + OPENAI_API_KEY
      },
      body: JSON.stringify(body)
    });
    const text = (j?.choices?.[0]?.message?.content ?? "").toString();
    if(text) return text;
  }

  // 3) OpenRouter
  const OPENROUTER_API_KEY = env("OPENROUTER_API_KEY");
  if(OPENROUTER_API_KEY){
    const model = env("OPENROUTER_MODEL","anthropic/claude-3.5-sonnet");
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const body = {
      model,
      messages: [
        ...(system? [{role:"system", content:system}] : []),
        {role:"user", content:user}
      ]
    };
    const j = await fetchJson(url, {
      method:"POST",
      headers:{
        "content-type":"application/json",
        "authorization":"Bearer " + OPENROUTER_API_KEY
      },
      body: JSON.stringify(body)
    });
    const text = (j?.choices?.[0]?.message?.content ?? "").toString();
    if(text) return text;
  }

  // 4) Replicate (placeholder - requires version id via env)
  const REPLICATE_API_TOKEN = env("REPLICATE_API_TOKEN");
  const REPLICATE_TEXT_VERSION = env("REPLICATE_TEXTGEN_VERSION","");
  if(REPLICATE_API_TOKEN && REPLICATE_TEXT_VERSION){
    // Use generic text-gen prediction
    const url = "https://api.replicate.com/v1/predictions";
    const body = {
      version: REPLICATE_TEXT_VERSION,
      input: { prompt: (system? (system + "\n\n") : "") + user }
    };
    const start = await fetchJson(url, {
      method:"POST",
      headers:{
        "content-type":"application/json",
        "authorization":"Token " + REPLICATE_API_TOKEN
      },
      body: JSON.stringify(body)
    });
    // poll
    let id = start?.id;
    let status = start?.status;
    let out = "";
    for(let i=0;i<90;i++){
      await new Promise(r=> setTimeout(r, 2000));
      const j = await fetchJson(url + "/" + id, {
        headers:{ "authorization":"Token " + REPLICATE_API_TOKEN }
      });
      status = j?.status;
      if(status === "succeeded"){
        const o = j?.output;
        out = Array.isArray(o)? o.join("\n") : (o ?? "");
        break;
      }
      if(status === "failed" || status === "canceled") break;
    }
    if(out) return out.toString();
  }

  // As a final fallback, return a clear message
  return "Entschuldigung – kein aktiver LLM‑Provider konfiguriert. Bitte API‑Keys setzen (Anthropic/OpenAI/OpenRouter/Replicate).";
}

// Simple chunk streamer
export async function streamText(res, text){
  // simulate streaming by chunking
  const chunks = text.split(/(\n\n|\n|\s+)/g).filter(Boolean);
  for(const c of chunks){
    res.write(`data: ${JSON.stringify({ delta: c })}\n\n`);
    await new Promise(r=> setTimeout(r, 12)); // fast but visible
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
}
