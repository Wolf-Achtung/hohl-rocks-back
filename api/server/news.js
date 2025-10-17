export function getDachNews(){
  return [
    { title:'Tagesschau: KI – aktuelle Nachrichten', url:'https://www.tagesschau.de/thema/kuenstliche-intelligenz/' },
    { title:'ZDF: KI – Hintergründe & News', url:'https://www.zdf.de/thema/kuenstliche-intelligenz-ki-100.html' },
    { title:'ZEIT: Wie KI unsere Zukunft verändert', url:'https://www.zeit.de/thema/kuenstliche-intelligenz' },
    { title:'heise online: KI – News, Tipps', url:'https://www.heise.de/thema/Kuenstliche-Intelligenz' },
    { title:'SRF Wissen: KI – Hintergründe', url:'https://www.srf.ch/wissen/kuenstliche-intelligenz' },
    { title:'the decoder – KI-News', url:'https://the-decoder.de/' },
    { title:'BMWK: KI in Deutschland', url:'https://www.plattform-lernende-systeme.de/ki-in-deutschland.html' },
    { title:'20min Digital (CH): KI', url:'https://www.20min.ch/digital/ai' }
  ];
}

export function getDaily(){
  // simple static selection for ticker
  const base = getDachNews();
  return base.slice(0,6).map(x=>({ title:x.title, url:x.url }));
}
