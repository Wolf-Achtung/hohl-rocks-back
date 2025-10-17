import express from "express";
export const newsRouter = express.Router();

const DACH_NEWS = [
  { title:"Tagesschau | KI – aktuelle Nachrichten", url:"https://www.tagesschau.de/thema/kuenstliche_intelligenz/" },
  { title:"heise online | KI – Ratgeber & News", url:"https://www.heise.de/thema/Kuenstliche-Intelligenz" },
  { title:"ZEIT | KI – wie sie unsere Zukunft verändert", url:"https://www.zeit.de/thema/kuenstliche-intelligenz" },
  { title:"SRF Wissen | KI – Hintergründe", url:"https://www.srf.ch/wissen/kuenstliche-intelligenz" },
  { title:"DER STANDARD | KI in Österreich", url:"https://www.derstandard.at/thema/kuenstliche-intelligenz" },
  { title:"Netzpolitik.org | KI & Gesellschaft", url:"https://netzpolitik.org/tag/kuenstliche-intelligenz/" }
];

newsRouter.get("/", (req,res)=>{
  res.json({ ok:true, items: DACH_NEWS, count: DACH_NEWS.length, at: Date.now() });
});

// Daily ticker (static but modernized format)
const DAILY = [
  { title:"„Museum verlorener Träume“: neue Räume kuratiert" },
  { title:"Briefing‑Assistent jetzt mit Risiko‑Heatmap" },
  { title:"Bubbles: sanfter Drift & Neon‑Monochrom" },
  { title:"Ticker: DACH‑News mit Direktlinks" }
];

newsRouter.get("/daily", (req,res)=>{
  res.json({ ok:true, items: DAILY, at: Date.now() });
});
