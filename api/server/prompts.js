/**
 * hohl.rocks – Promptkanon (DACH-kuratiert, komprimierte Auswahl)
 * Vollständige Pflege in Frontend `public/data/prompts.json` möglich.
 * Diese Server-Kopie dient für `/api/tips` sowie Bubble-Envelope-Verständnis.
 */
'use strict';

// Minimaler Satz – kann jederzeit erweitert werden.
// Felder: id, question, desc, prompt, tags, file, category, level, language
const PROMPTS = [
  {
    id: 1,
    question: "Schreibe eine freundliche E-Mail-Antwort",
    desc: "Kurz, klar, höflich – mit 3 Varianten.",
    prompt: "Formuliere eine kurze, freundliche Antwortmail. Kontext: [KONTEXT]. Gib 3 Varianten.",
    tags: ["Alltag", "Business"],
    file: false,
    category: "Alltag",
    level: "Einfach",
    language: "de"
  },
  {
    id: 2,
    question: "Meeting-Zusammenfassung",
    desc: "Stichpunkte und To-Dos aus Notizen extrahieren.",
    prompt: "Erstelle aus diesen Notizen eine prägnante Zusammenfassung und To-Dos: [NOTIZEN]",
    tags: ["Business", "Produktivität"],
    file: false,
    category: "Business",
    level: "Mittel",
    language: "de"
  },
  {
    id: 3,
    question: "Social-Post (LinkedIn)",
    desc: "Sachlich, 3 Hook-Varianten, Call-to-Action.",
    prompt: "Schreibe einen sachlichen LinkedIn-Post zum Thema: [THEMA]. Gib 3 Hook-Varianten und 1 CTA.",
    tags: ["Marketing"],
    file: false,
    category: "Marketing",
    level: "Mittel",
    language: "de"
  },
  // --- Neue Medien/Entscheidungs-Bubbles ---
  {
    id: 18,
    question: "Wie würde dein Bild aussehen?",
    desc: "Beschreibe ein Bild – KI erstellt es.",
    prompt: "[BESCHREIBUNG]",
    tags: ["Kreativ","Medien"],
    file: false,
    category: "Kreativ",
    level: "Mittel",
    language: "de"
  },
  {
    id: 19,
    question: "Was siehst du auf dem Bild?",
    desc: "Bildanalyse: KI beschreibt hochgeladenes Bild.",
    prompt: "Bitte lade ein Bild hoch: [BILD]",
    tags: ["Medien"],
    file: true,
    category: "Medien",
    level: "Mittel",
    language: "de"
  },
  {
    id: 20,
    question: "Willst du einen KI‑Witz hören?",
    desc: "Einfacher Ja/Nein‑Pfad mit passender Antwort.",
    prompt: "Antwortmöglichkeiten: Ja / Nein. [ANTWORT]",
    tags: ["Alltag","Fun"],
    file: false,
    category: "Alltag",
    level: "Einfach",
    language: "de"
  },
  {
    id: 21,
    question: "Welcher Sound passt dazu?",
    desc: "Kurzes Musik‑Snippet generieren lassen.",
    prompt: "[BESCHREIBUNG]",
    tags: ["Medien","Audio"],
    file: false,
    category: "Medien",
    level: "Mittel",
    language: "de"
  }
];

function getTipsList() {
  // Aus Prompts (How-to/Prompting) eine kurze Tippsliste erzeugen
  return PROMPTS.slice(0, 10).map(p => ({
    id: p.id,
    title: p.question,
    why: p.desc,
    tags: p.tags,
    category: p.category,
    level: p.level,
    language: p.language
  }));
}

module.exports = { PROMPTS, getTipsList };
