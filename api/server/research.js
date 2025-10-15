import { Router } from 'express';

const router = Router();

const PPLX_KEY = process.env.PERPLEXITY_API_KEY || '';
const PPLX_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';
const BLOCK = (process.env.RESEARCH_BLOCK || '').toLowerCase() === 'true';
const ALLOW = (process.env.RESEARCH_ALLOW || 'true').toLowerCase() !== 'false';

function guard(res){
  if(BLOCK || !ALLOW) { res.status(403).json({error:'research_blocked'}); return true; }
  if(!PPLX_KEY){ res.status(200).json({note:'perplexity_key_missing'}); return true; }
  return false;
}

router.get('/answer', async (req,res)=>{
  try{
    if(guard(res)) return;
    const q = (req.query.q||'').toString().slice(0,400);
    if(!q) return res.status(400).json({error:'missing_q'});
    const body = { model: PPLX_MODEL, messages:[{role:'user', content:q}] };
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method:'POST', headers:{'Authorization': 'Bearer '+PPLX_KEY, 'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const j = await r.json();
    res.json({ text: j?.choices?.[0]?.message?.content || '' });
  }catch(e){
    console.error('research/answer failed', e);
    res.status(500).json({error:'research_failed'});
  }
});

export default router;