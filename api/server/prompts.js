// api/server/prompts.js
export const TOP_PROMPTS = [
  { id: 1, question: "Wo verlierst du im Alltag Zeit?", prompt: "Sortiere diese Aufgaben in drei Stufen (Sofort/Heute/Kann warten). Erstelle daraus eine 5‑Punkte‑Reihenfolge mit kurzer Begründung je Schritt. Aufgaben: " },
  { id: 2, question: "Was kochst du aus 3 Zutaten?", prompt: "Ich habe diese Zutaten: [ZUTATEN]. Schlage ein Gericht (1 Portion) vor, mit Einkaufsliste (fehlende Zutaten) und 20‑Minuten‑Schrittplan." },
  { id: 3, question: "Wie kannst du ein nerviges Problem neu framen?", prompt: "Formuliere 3 neue Blickwinkel (Reframing) für dieses Problem und gib je eine konkrete Mini‑Handlung: " },
  { id: 4, question: "Wie schläfst du nächste Woche besser?", prompt: "Entwirf eine minimalistische 7‑Tage‑Schlaf‑Routine. Vorgaben: 3 Kernregeln, 1 Abendritual, 1 Notfallplan bei schlechtem Schlaf." },
  { id: 5, question: "Was willst du in 30 Minuten verstehen?", prompt: "Leite mich durch einen Lern‑Sprint (30 Minuten) für das Thema: [THEMA]. Gib mir einen Blockplan und 5 Quizfragen mit Lösungen." },
  { id: 6, question: "Welche 3 Captions funktionieren am besten?", prompt: "Erzeuge 3 Captions in verschiedenen Tönen (seriös, freundlich, spielerisch) für ein Foto. Thema/Kontext: [KONTEXT]." },
  { id: 7, question: "Kannst du es einem 5‑Jährigen erklären?", prompt: "Erkläre mir [THEMA] so, dass es ein Kind (5) versteht. Benutze ein greifbares Bild/Analogien und max. 140 Wörter." },
  { id: 8, question: "Wie triffst du heute eine gute Entscheidung?", prompt: "Gib mir ein Chef‑Briefing in 6 Bulletpoints. Struktur: Kontext · Zahlen · Risiko · Optionen A/B · Empfehlung · Nächste Schritte. Thema: " },
  { id: 9, question: "Wie bereitest du ein heikles Gespräch vor?", prompt: "Hilf mir, ein heikles Gespräch vorzubereiten. Gib 5 Fragen und 5 Ich‑Botschaften. Kontext: " },
  { id: 10, question: "Wie pitchst du deine Idee in 60 Sekunden?", prompt: "Erzeuge einen 60‑Sekunden‑Pitch für: " },
  { id: 11, question: "Was sind heute deine 3 wichtigsten Aufgaben?", prompt: "Gib mir die 3 wichtigsten Aufgaben für heute und je die ersten 2 Schritte. Kontext: " },
  { id: 12, question: "Welche Formel löst dein Tabellenproblem?", prompt: "Welche Excel/Google‑Sheets‑Formel löst dieses Problem? Kontext: " },
  { id: 13, question: "Wie sähe eine straffe 30‑Minuten‑Agenda aus?", prompt: "Plane eine 30‑Minuten‑Agenda. Thema/Teilnehmende: " },
  { id: 14, question: "Wo lauern hier die 3 größten Risiken?", prompt: "Analysiere die 3 größten Risiken, gib Eintrittswahrscheinlichkeit (Low/Med/High) und Gegenmaßnahme. Kontext: " },
  { id: 15, question: "Kannst du aus diesem Link ein Chef‑Briefing machen?", prompt: "Fasse den verlinkten Artikel stichpunktartig als Entscheidungsbriefing (max. 8 Bulletpoints) zusammen. Gliedere in: Kontext · Kernaussagen · Auswirkungen · Risiken · Nächste Schritte. Link/URL: " },
  { id: 16, question: "Was sagt dein zukünftiges Ich in 12 Monaten?", prompt: "Schreibe einen kurzen Tagebucheintrag aus der Sicht meines zukünftigen Ichs in 12 Monaten. Stichworte: KI im Alltag, gesunde Gewohnheiten, Fokus aufs Wesentliche." },
  { id: 17, question: "Welche 5 Hebel bringen dein Projekt schneller voran?", prompt: "Analysiere mein Vorhaben und liste die 5 größten Hebel. Gib zu jedem Hebel konkrete nächste Schritte für die nächsten 48 Stunden mit Aufwand/Nutzen‑Skala (1‑5). Vorhaben: " }
  ,
  // ----- KI‑Medien und Entscheidungsprompts (IDs 18–21) -----
  // Diese Einträge erweitern das Bubble‑System um visuelle und audio‑basierte
  // Interaktionen.  Sie werden serverseitig speziell behandelt, indem
  // Replicate‑Modelle aufgerufen oder logische Entscheidungen gefällt werden.
  { id: 18, question: "Wie würde dein Bild aussehen?", prompt: "Erzeuge ein KI‑Bild zu folgender Beschreibung: [BESCHREIBUNG]" },
  { id: 19, question: "Was siehst du auf dem Bild?", prompt: "Bitte analysiere dieses Bild. Beschreibe präzise, was du siehst: [BILD]" },
  { id: 20, question: "Willst du einen KI‑Witz hören?", prompt: "Antworte mit Ja oder Nein auf die Frage: Willst du einen KI‑Witz hören? [ANTWORT]" },
  { id: 21, question: "Welcher Sound passt dazu?", prompt: "Erzeuge einen kurzen Musik‑Loop passend zur folgenden Beschreibung: [BESCHREIBUNG]" }
];
