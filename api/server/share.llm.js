/**
 * Provider chain: Anthropic → OpenAI → OpenRouter → (fallback) echo
 * Returns unified {text}
 */
export async function runLLM({system="", user="", maxTokens=750}){
  const tryOrder = [
    anthropicRun, openaiRun, openrouterRun, fallbackRun
  ];
  for(const fn of tryOrder){
    try{
      const out = await fn({system, user, maxTokens});
      if(out && out.text) return out;
    }catch(e){ /* continue */ }
  }
  return {text:"(Kein Provider verfügbar)"};
}

async function anthropicRun({system, user, maxTokens}){
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022";
  if(!key) throw new Error("no anthropic");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": key,
      "anthropic-version":"2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages:[{role:"user", content:user}]
    })
  });
  if(!res.ok) throw new Error("anthropic bad");
  const data = await res.json();
  const text = (data?.content?.[0]?.text) || "";
  return {text};
}

async function openaiRun({system, user, maxTokens}){
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if(!key) throw new Error("no openai");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+key
    },
    body: JSON.stringify({
      model,
      messages: [
        {role:"system", content:system},
        {role:"user", content:user}
      ],
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });
  if(!res.ok) throw new Error("openai bad");
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return {text};
}

async function openrouterRun({system, user, maxTokens}){
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  if(!key) throw new Error("no openrouter");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+key
    },
    body: JSON.stringify({
      model,
      messages:[{role:"system", content:system},{role:"user", content:user}],
      max_tokens: maxTokens
    })
  });
  if(!res.ok) throw new Error("openrouter bad");
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return {text};
}

async function fallbackRun({system, user}){
  // echo fallback – helpful for offline testing
  const text = `SYSTEM:\n${system}\n\nUSER:\n${user}\n\n(Hinweis: Fallback ohne LLM-Schlüssel)`;
  return {text};
}
