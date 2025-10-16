import express from "express";
const router = express.Router();

router.post("/", async (req,res)=>{
  const q = (req.body?.q||"").trim();
  if(!q) return res.status(400).json({ error:"missing_query" });
  return res.json({ answer:`(Demo) Zusammenfassung für: ${q}`, sources:[] });
});

export default router;
