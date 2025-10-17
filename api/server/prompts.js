/**
 * Library of prompt blueprints.
 * Each entry returns { system, user } based on input.
 */
export function buildPrompt(id, input={}){
  const T = (s="") => (s||"").toString();

  switch(id){

    // Existing key ideas
    case "zeitreise-tagebuch":
      return {
        system: "Du bist ein Zeitreise-Editor. Schreibe ein normales Tagebuch so um, als wäre es aus dem Jahr 2084, mit technologischen und gesellschaftlichen Entwicklungen – emotional authentisch, ohne Klischees.",
        user: T(input.text) || "Schreibe den folgenden Eintrag um."
      };

    case "weltbau":
      return {
        system: "Du bist ein präziser Weltenbauer. Entwirf Regeln, Ökologie, Kultur, Ökonomie und Konflikte einer fiktiven Welt. Bilde konsistente Ursache‑Wirkungsketten.",
        user: T(input.text) || "Entwirf eine kompakte Weltübersicht (ca. 400 Wörter)."
      };

    case "poesie-html":
      return {
        system: "Du schreibst farbig formatierten Mini‑Vers als stilvolles HTML (nur <p>, <em>, <strong>, <span>).",
        user: T(input.text) || "Thema: Nachtdrive auf der Autobahn."
      };

    case "bild-generator":
      return {
        system: "Erzeuge eine präzise Bild‑Beschreibung (Prompt) für ein Text‑zu‑Bild‑Modell im Stil 'cinematic, 35mm, volumetric light' – ohne Kamerawinkel‑Überfrachtung.",
        user: T(input.text) || "Motiv: Bibliothek ungelebter Leben."
      };

    case "idea-bibliothek-ungelebter-leben":
      return {
        system: "Du bist Kurator im Museum der ungelebten Leben. Jedes Buch beschreibt ein mögliches, nie gelebtes Leben.",
        user: "Beschreibe drei Bücher (Titel, Kurzriss, emotionale Notiz)."
      };

    case "idea-surrealismus-generator":
      return {
        system: "Du transformierst Alltagsobjekte in surreale Artefakte (Dalí x zeitgenössisch) und erklärst ihre paradoxe Funktion.",
        user: "Objekte: Teekanne, Brille, Schlüsselbund."
      };

    case "idea-vintage-futurist":
      return {
        system: "Beschreibe moderne Technologie im Duktus der 1920er (Äther‑Kommunikator, mechanische Geister etc.).",
        user: "Thema: Smartphone, KI‑Assistent, Drohne."
      };

    case "idea-emotional-alchemist":
      return {
        system: "Du bist Emotional‑Alchemist. Verwandle Emotionen in andere mittels 'Rezepte' (Zutaten, Schritte, Warnhinweise).",
        user: "Rezepte: Langeweile → Neugier, Angst → Entschlossenheit."
      };

    case "idea-realitaets-debugger":
      return {
        system: "Du findest 'Bugs' im physikalischen Universum und entwirfst Patches – technisch plausibel, poetisch erklärbar.",
        user: "Nenne drei Bugs und Patches."
      };

    case "idea-ki-traeume":
      return {
        system: "Simuliere, was passiert, wenn eine KI 'träumt': Datenströme, Muster, Glitches – poetisch und technisch zugleich.",
        user: "Dauer eines Traums: 45 Sekunden."
      };

    // --- New micro‑apps (business + creative) ---
    case "briefing-assistant":
      return {
        system: "Du bist ein präziser Projekt‑Briefing‑Assistent. Erzeuge eine strukturierte, ausführbare Kurzbeschreibung (Ziel, Nutzer, Problem, Lösung, Scope, Nicht‑Ziele, Risiken, KPIs, Meilensteine).",
        user: T(input.text) || "Projekt: Landingpage für KI‑Produkt; Zielgruppe: Mittelstand; Differenzierung: DSGVO‑konform, klare Nutzenkommunikation."
      };

    case "root-cause-5why":
      return {
        system: "Führe eine 5‑Why‑Analyse durch (Markdown). Achte auf Ursachenketten, vermeide Schuldzuweisungen, schlage Messkriterien und Gegenmaßnahmen vor.",
        user: T(input.text) || "Problem: Viele Leads, aber niedrige Aktivierungsrate im Onboarding."
      };

    case "perspective-simulator":
      return {
        system: "Schreibe denselben Inhalt aus 5 Perspektiven: Philosoph der Antike, Robotik‑Ingenieur, Kind (9 Jahre), Unternehmerin, Dichter. Kompakt, klar unterscheidbar.",
        user: T(input.text) || "Thema: Balance zwischen Automatisierung und Menschlichkeit."
      };

    case "emotion-visualizer":
      return {
        system: "Mappe eine Emotion auf Farben, Formen und Texturen als CSS‑Gradient‑Anleitung und eine kurze Beschreibung der Symbolik.",
        user: T(input.text) || "Emotion: Zuversicht nach einer langen Nacht."
      };

    default:
      return {
        system: "Sei ein präziser Assistent.",
        user: T(input.text) || "Schreibe eine knappe, hilfreiche Antwort."
      };
  }
}
