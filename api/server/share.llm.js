import fetch from 'node-fetch';

export async function generate({ title, prompt }){
  // choose provider
  const anth = process.env.ANTHROPIC_API_KEY;
  const openai = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  let text = null;
  if(anth){
    try{
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-api-key': anth,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620',
          max_tokens: 400,
          system: 'Du bist ein prägnanter, wohlwollender Assistent.',
          messages:[{ role:'user', content:`${prompt}` }]
        })
      });
      const j = await res.json();
      text = j?.content?.[0]?.text || j?.content?.[0]?.content?.[0]?.text;
      if(text) return text;
    }catch(e){}
  }
  if(openai){
    try{
      const url = process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
      const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
      const res = await fetch(url, {
        method:'POST',
        headers:{ 'content-type':'application/json', 'authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages:[{ role:'user', content: prompt }],
          max_tokens: 400
        })
      });
      const j = await res.json();
      text = j?.choices?.[0]?.message?.content;
      if(text) return text;
    }catch(e){}
  }
  // fallback text
  return `*(Fallback)* ${title}: Der KI‑Provider ist aktuell nicht konfiguriert. Bitte hinterlege einen API‑Key.`;
}
