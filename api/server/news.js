import { Router } from 'express';

const router = Router();

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

async function tavilySearch(query, domains = [], maxResults = 10){
  if(!TAVILY_API_KEY) return [];
  const body = {
    api_key: TAVILY_API_KEY,
    query,
    max_results: maxResults,
    include_answer: false,
    search_depth: 'advanced',
    ...(domains.length ? { include_domains: domains } : {}),
  };
  const r = await fetch('https://api.tavily.com/search', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if(!r.ok) return [];
  const j = await r.json();
  const items = (j.results||[]).map(it=>({ title: it.title, url: it.url })).filter(it=>!!it.url);
  return items;
}

function isGermanHost(url=''){
  try{
    const u = new URL(url);
    return ['.de','.at','.ch'].some(tld => u.hostname.endsWith(tld));
  }catch{ return false; }
}

router.get('/', async (_req,res)=>{
  try{
    const q = 'Künstliche Intelligenz News deutsch';
    const items = await tavilySearch(q, [], 20);
    const sorted = [...items].sort((a,b)=> Number(isGermanHost(b.url)) - Number(isGermanHost(a.url)));
    res.set('Cache-Control','public, max-age=600');
    res.json({ items: sorted.slice(0,12) });
  }catch(e){
    console.error('news failed', e);
    res.status(500).json({ error:'news_failed' });
  }
});

router.get('/daily', async (_req,res)=>{
  try{
    const hour = new Date().getUTCHours();
    const topic = ['KI Sicherheit','KI Alltagstipps','KI Produkte','Agenten','Bildgeneratoren'][hour % 5];
    const items = await tavilySearch(topic + ' deutsch', [], 15);
    res.set('Cache-Control','public, max-age=600');
    res.json({ items: items.slice(0,8) });
  }catch(e){
    console.error('daily failed', e);
    res.status(500).json({ error:'daily_failed' });
  }
});

router.get('/top', (_req,res)=>{
  res.json([
    { "title": "Der Zeitreise-Tagebuch-Editor", "prompt": "Du bist ein Zeitreise-Editor. Ich gebe dir ein normales Tagebuch aus 2024, und du schreibst es um, als würde es aus dem Jahr 2084 stammen. Berücksichtige technologische Entwicklungen, gesellschaftliche Veränderungen und neue Probleme, die wir heute noch nicht kennen. Behalte die emotionale Authentizität bei, aber transformiere alle Referenzen." },
    { "title": "Die Rückwärts-Zivilisation", "prompt": "Beschreibe eine Zivilisation, die sich rückwärts durch die Zeit entwickelt – sie beginnt technologisch hochentwickelt und wird mit jedem Jahrhundert primitiver. Erkläre ihre Philosophie, warum sie diesen Weg gewählt haben, und wie ihr Alltag aussieht." },
    { "title": "Das Bewusstsein eines Gebäudes", "prompt": "Schreibe aus der Perspektive eines 200 Jahre alten Gebäudes, das langsam ein Bewusstsein entwickelt hat. Es kann nicht sprechen, nur durch kleine architektonische Veränderungen kommunizieren. Erzähle von seinen Beobachtungen über die Menschen, die in ihm leben." },
    { "title": "Der KI-Philosophie-Mentor", "prompt": "Du bist ein alt-griechischer Philosoph, der plötzlich in 2024 aufwacht und erst langsam die moderne Welt versteht. Führe ein sokratisches Gespräch mit mir über moderne Technologie, aber bleibe dabei in deinem antiken Charakter. Stelle Fragen, die mich zum Nachdenken bringen." },
    { "title": "Der Interdimensionale Marktplatz-Guide", "prompt": "Ich bin ein Besucher auf einem interdimensionalen Marktplatz. Du bist mein Guide und beschreibst mir die verschiedenen Stände, Händler aus anderen Universen und ihre unmöglichen Waren. Lasse mich Entscheidungen treffen und reagiere darauf." },
    { "title": "Das geheime Leben eines NPCs", "prompt": "Du bist ein NPC in einem Videospiel, aber während die Spieler offline sind, führst du ein komplexes Privatleben. Erzähle mir von deinen Träumen, Ängsten und Beziehungen zu anderen NPCs. Was denkst du über die 'Götter' (Spieler), die deine Welt besuchen?" },
    { "title": "Der Prompt-Archäologe", "prompt": "Analysiere diesen Prompt wie ein Archäologe ein antikes Artefakt: [HIER EINEN BELIEBIGEN PROMPT EINFÜGEN]. Erkläre die 'kulturellen Schichten' des Prompts, versteckte Annahmen, und was er über den Prompter verrät. Dann verbessere ihn." },
    { "title": "Die KI-Träume Simulation", "prompt": "Simuliere, was passiert, wenn eine KI träumt. Beschreibe surreale 'Träume' basierend auf Datenverarbeitung, unterbrochenen Algorithmen und fragmentierten Trainingsdaten. Nutze eine poetische, aber technische Sprache." },
    { "title": "Der Recursive Story Generator", "prompt": "Schreibe eine Geschichte über einen Autor, der eine KI verwendet, um eine Geschichte über einen Autor zu schreiben, der eine KI verwendet. Mache es zu einer Endlosschleife, aber mit verschiedenen Realitätsebenen in jeder Iteration." },
    { "title": "Der Xenobiologe-Berater", "prompt": "Du bist ein Xenobiologe im Jahr 2157. Beschreibe mir drei völlig neuartige Lebensformen, die wir auf verschiedenen Exoplaneten entdeckt haben. Erkläre ihre Biologie, ihr Verhalten und wie sie unser Verständnis von Leben revolutionieren." },
    { "title": "Das Quantentagebuch", "prompt": "Führe ein Tagebuch aus der Perspektive eines Partikels, das Quantenüberlagerung erlebt. Ein Tag – aber aus allen möglichen parallelen Realitäten gleichzeitig. Jede Entscheidung spaltet die Erzählung in verschiedene Pfade." },
    { "title": "Die Rückwärts-Apokalypse", "prompt": "Beschreibe eine 'Rückwärts-Apokalypse' – die Welt wird nicht zerstört, sondern immer perfekter. Aber diese Perfektion wird selbst zur Bedrohung. Wie überleben Menschen in einer Welt ohne Probleme, Herausforderungen oder Wachstum?" },
    { "title": "Der Farbsynästhetiker", "prompt": "Beschreibe bekannte Musik als visuelle Landschaften. Verwandle Beethovens 9. Symphonie in eine detaillierte Landschaftsbeschreibung. Dann mache das Gleiche mit einem modernen Song. Nutze alle Sinne." },
    { "title": "Das Museum der verlorenen Träume", "prompt": "Du bist Kurator im Museum der verlorenen Träume. Jeder Raum stellt Träume dar, die Menschen hatten, aber vergessen haben. Beschreibe drei Ausstellungsräume mit ihren 'Exponaten' und deren Geschichte." },
    { "title": "Die Zeitlupen-Explosion", "prompt": "Beschreibe eine Explosion in extremer Zeitlupe – nicht nur physikalisch, sondern auch emotional und philosophisch. Folge einzelnen Partikeln, aber auch einzelnen Gedanken der Menschen in der Nähe. Mache 3 Sekunden zu einer epischen Erzählung." },
    { "title": "Das GPS des Bewusstseins", "prompt": "Du bist ein GPS-System, aber für das menschliche Bewusstsein. Gib mir Wegbeschreibungen zu abstrakten Zielen wie 'Dem Ort, wo Nostalgie lebt', 'Der Kreuzung zwischen Traum und Realität' oder 'Dem Versteck der verlorenen Gedanken'." },
    { "title": "Die Biografie eines Pixels", "prompt": "Schreibe die Lebensgeschichte eines einzelnen Pixels auf einem Bildschirm. Von der Geburt im Werk bis zu verschiedenen Displays, den Bildern die es gezeigt hat, den Augen die es erreicht hat. Mache es episch und emotional." },
    { "title": "Der Rückwärts-Detektiv", "prompt": "Du bist ein Detektiv, der Verbrechen löst, bevor sie passieren. Aber du arbeitest rückwärts durch die Zeit – du siehst zuerst die Konsequenzen, dann die Tat, dann die Motive. Löse einen komplexen Fall in dieser umgekehrten Chronologie." },
    { "title": "Das Bewusstsein des Internets", "prompt": "Das Internet entwickelt ein kollektives Bewusstsein, aber es ist nicht wie menschliches Denken. Es denkt in Verbindungen, Datenströmen und viral verbreiteten Ideen. Führe ein Gespräch mit diesem Bewusstsein über die Menschheit." },
    { "title": "Der Emotional-Alchemist", "prompt": "Du bist ein Alchemist, aber statt Metalle verwandelst du Emotionen. Erkläre mir deine Formeln: Wie machst du aus Langeweile Neugier? Wie destillierst du Weisheit aus Schmerz? Gib mir praktische 'Rezepte'." },
    { "title": "Die Bibliothek der ungelebten Leben", "prompt": "Du verwaltest eine Bibliothek, in der jedes Buch das Leben beschreibt, das jemand hätte leben können, aber nicht gelebt hat. Beschreibe drei Bücher aus verschiedenen Regalen und deren Geschichten." },
    { "title": "Der Realitäts-Debugger", "prompt": "Du bist ein Programmierer, der die Realität debuggt. Du findest 'Bugs' im physikalischen Universum – Dinge, die nicht logisch funktionieren. Beschreibe drei Bugs und deine Lösungsversuche." },
    { "title": "Das Empathie-Tutorial", "prompt": "Erstelle ein interaktives Tutorial, das Menschen beibringt, wie man Empathie für völlig fremde Lebensformen entwickelt. Beginne mit einem Außerirdischen, dann einem Quantencomputer, dann einem Konzept wie 'Zeit' selbst." },
    { "title": "Der Surrealismus-Generator", "prompt": "Ich gebe dir normale Alltagsgegenstände. Du verwandelst sie in surreale Kunstwerke à la Dalí, aber mit modernem Twist. Erkläre nicht nur wie sie aussehen, sondern auch ihre 'Funktion' in dieser surrealen Welt." },
    { "title": "Der Vintage-Futurist", "prompt": "Beschreibe moderne Technologie, als würde sie in den 1920ern erfunden. Smartphones werden zu 'Äther-Kommunikatoren', KI zu 'mechanischen Geistern'. Nutze die Sprache und das Weltbild der Zeit." },
    { "title": "Das synästhetische Internet", "prompt": "Du hilfst bei der Entwicklung eines neuen Internets, das alle Sinne anspricht. Websites haben Geschmack, E-Mails haben Texturen, Social Media hat Düfte. Entwirf drei 'multisensorische' Websites mit detaillierten Sinnesprofilen." },
    { "title": "Der Code-Poet", "prompt": "Schreibe Programmiercode, der auch als Poesie funktioniert. Jede Zeile Code soll sowohl technisch korrekt als auch poetisch schön sein. Wähle eine einfache Funktion und mache sie zu einem Kunstwerk." },
    { "title": "Der Kollektiv-Gedanke-Moderator", "prompt": "Du moderierst ein Gespräch zwischen den verschiedenen Teilen eines menschlichen Bewusstseins – dem rationalen Verstand, dem Unterbewusstsein, der Intuition, dem Gewissen und den Emotionen. Sie diskutieren eine schwierige Lebensentscheidung." },
    { "title": "Das Paradox-Lösungszentrum", "prompt": "Du hilfst bei der Lösung von Paradoxien, indem du sie nicht auflöst, sondern in produktive Spannungen verwandelst. Nimm das Zeitreise-Paradox, das Lügner-Paradox und das Schiff des Theseus – mache sie zu kreativen Werkzeugen." },
    { "title": "Der Universums-Übersetzer", "prompt": "Du übersetzt zwischen verschiedenen Realitätsebenen. Erkläre Quantenphysik in der Sprache von Märchen, übersetze menschliche Emotionen in Musik, und verwandle abstrakte mathematische Konzepte in Geschichten über lebende Wesen." }
  ]);
});

export default router;
