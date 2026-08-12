// ===================================================================
// STATIC DATA - Prompts, News, Sparks
// ===================================================================

export const FEATURED_PROMPTS = [
  // 🎨 CREATIVE CATEGORY
  {
    id: 1,
    title: "Story Architect",
    prompt: "Du bist ein erfahrener Story-Architekt. Entwickle eine dreistufige Story-Struktur für [THEMA] mit: 1) Einem Hook der in 3 Sekunden fesselt, 2) Einer emotionalen Wendung in der Mitte, 3) Einem unvergesslichen Ende. Nutze die 'Show, don't tell' Methode und baue visuell starke Metaphern ein.",
    category: "creative",
    tags: ["storytelling", "content", "marketing"],
    rating: 4.8,
    uses: 1247,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 2,
    title: "Brand Voice Sculptor",
    prompt: "Analysiere die Brand Voice von [MARKE] und erstelle darauf basierend 5 alternative Headline-Varianten für [PRODUKT/SERVICE]. Jede Variante sollte einen anderen emotionalen Trigger nutzen: Neugier, FOMO, Belonging, Empowerment, Humor. Begründe jeweils, warum dieser Trigger für die Zielgruppe funktioniert.",
    category: "creative",
    tags: ["branding", "copywriting", "marketing"],
    rating: 4.9,
    uses: 892,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 3,
    title: "Visual Concept Generator",
    prompt: "Ich brauche 3 unterschiedliche visuelle Konzepte für [KAMPAGNE/PROJEKT]. Für jedes Konzept beschreibe: 1) Die zentrale visuelle Metapher, 2) Farbpalette mit emotionaler Begründung, 3) Typografie-Stil, 4) Einen Moodboard-Vorschlag mit konkreten Referenzen. Denke wie ein Art Director, nicht wie ein Designer.",
    category: "creative",
    tags: ["design", "concept", "visual"],
    rating: 4.7,
    uses: 654,
    author: "hohl.rocks",
    featured: true
  },

  // 💼 BUSINESS CATEGORY
  {
    id: 4,
    title: "Pitch Deck Strategist",
    prompt: "Erstelle eine Pitch Deck Struktur (12 Slides) für [STARTUP/PRODUKT] die speziell auf [INVESTOR-TYP] zugeschnitten ist. Für jede Slide: 1) Headline die Investor Hook triggert, 2) Kernbotschaft in einem Satz, 3) Datenvisualisierungs-Empfehlung. Fokus auf: Problem-Solution-Fit, Market Size, Traction, Team Credibility.",
    category: "business",
    tags: ["pitch", "startup", "investment"],
    rating: 4.9,
    uses: 1891,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 5,
    title: "ROI Calculator Builder",
    prompt: "Entwickle eine ROI-Kalkulation für [LÖSUNG/SERVICE] die in 3 Schritten zeigt: 1) Current State Costs (was kostet das Problem jetzt?), 2) Implementation Investment (einmalig + laufend), 3) Expected Savings/Revenue (konservativ, realistisch, optimistisch). Baue eine Excel-Formel-Struktur die der Kunde selbst anpassen kann.",
    category: "business",
    tags: ["roi", "sales", "b2b"],
    rating: 4.6,
    uses: 723,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 6,
    title: "Competitive Analysis Framework",
    prompt: "Erstelle ein Competitive Analysis Framework für [BRANCHE/PRODUKT] mit folgenden Dimensionen: Feature-Vergleich, Pricing-Strategie, Market Positioning, Customer Reviews Sentiment, GTM-Approach. Identifiziere für jeden Competitor: Unique Strength, Critical Weakness, Opportunity Gap. Leite daraus 3 strategische Empfehlungen ab.",
    category: "business",
    tags: ["strategy", "analysis", "competition"],
    rating: 4.8,
    uses: 1034,
    author: "hohl.rocks",
    featured: true
  },

  // ⚙️ TECHNICAL CATEGORY
  {
    id: 7,
    title: "Code Review Assistant",
    prompt: "Review folgenden Code-Block für [PROGRAMMIERSPRACHE]: [CODE]. Analysiere auf 3 Ebenen: 1) Funktionalität & Edge Cases, 2) Performance & Optimization Potenzial, 3) Code Quality & Best Practices. Für jedes Issue: Severity (Critical/Major/Minor), Begründung, Konkrete Lösung mit Code-Beispiel.",
    category: "technical",
    tags: ["code", "review", "development"],
    rating: 4.7,
    uses: 2156,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 8,
    title: "API Documentation Generator",
    prompt: "Erstelle eine vollständige API-Dokumentation für [ENDPOINT/SERVICE] im OpenAPI 3.0 Format. Inkludiere: Request/Response Schemas, Error Codes mit Troubleshooting, Rate Limits, Authentication Flow, Code Examples in 3 Sprachen (Python, JavaScript, cURL). Zielgruppe: Developer die das API in 5 Minuten verstehen müssen.",
    category: "technical",
    tags: ["api", "documentation", "development"],
    rating: 4.6,
    uses: 891,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 9,
    title: "Database Schema Architect",
    prompt: "Designe ein relationales Datenbank-Schema für [ANWENDUNGSFALL]. Definiere: Tabellen mit Feldern & Datentypen, Primary/Foreign Keys, Indizes für Performance, Constraints für Datenintegrität. Berücksichtige: Normalisierung (3NF), Query-Performance, Skalierbarkeit. Liefere SQL CREATE TABLE Statements und ein ER-Diagramm in Text-Form.",
    category: "technical",
    tags: ["database", "schema", "sql"],
    rating: 4.9,
    uses: 1456,
    author: "hohl.rocks",
    featured: true
  },

  // 📚 EDUCATION CATEGORY
  {
    id: 10,
    title: "ELI5 Explainer",
    prompt: "Erkläre [KOMPLEXES THEMA] in 3 Schwierigkeitsstufen: 1) ELI5 (für 5-Jährige mit Analogien), 2) High School Level (mit Fakten aber ohne Jargon), 3) Expert Level (mit Technical Details). Nutze für jede Stufe ein konkretes Real-World Beispiel. Ziel: Komplexität schrittweise aufbauen, nie überfordern.",
    category: "education",
    tags: ["explanation", "learning", "teaching"],
    rating: 4.8,
    uses: 3421,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 11,
    title: "Tutorial Step Builder",
    prompt: "Erstelle ein Tutorial für [SKILL/TOOL] in 5-7 Schritten. Jeder Schritt: 1) Was du lernen wirst (Learning Objective), 2) Detaillierte Anleitung, 3) Häufiger Fehler + wie man ihn vermeidet, 4) Check dein Verständnis (Mini-Challenge). Endgoal: User kann nach Tutorial eigenständig [ERGEBNIS] produzieren.",
    category: "education",
    tags: ["tutorial", "learning", "howto"],
    rating: 4.7,
    uses: 2789,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 12,
    title: "Study Guide Synthesizer",
    prompt: "Erstelle einen Study Guide für [THEMA/KURS] der diese Komponenten vereint: 1) Mindmap der Key Concepts mit Relationen, 2) Flashcards für die wichtigsten 20 Facts, 3) Practice Questions (Multiple Choice + Open Ended), 4) Mnemonic Devices für schwer zu merkende Infos, 5) Recommended Deep-Dive Resources.",
    category: "education",
    tags: ["study", "learning", "exam"],
    rating: 4.9,
    uses: 1876,
    author: "hohl.rocks",
    featured: true
  },

  // 📝 WRITING CATEGORY
  {
    id: 13,
    title: "LinkedIn Post Formula",
    prompt: "Schreibe einen LinkedIn Post über [THEMA] nach der 'Hook-Story-Value-CTA' Formel: 1) Hook erste Zeile (überraschender Fakt oder provokante These), 2) Kurze persönliche Story (60-80 Wörter), 3) Actionable Value (3 konkrete Takeaways), 4) Engagement CTA (Frage an Community). Ton: Authentisch, nicht verkauferisch. Länge: 150-200 Wörter.",
    category: "writing",
    tags: ["linkedin", "social", "content"],
    rating: 4.8,
    uses: 4512,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 14,
    title: "Email Subject Line Lab",
    prompt: "Generiere 10 Email Subject Lines für [KAMPAGNE/NEWSLETTER] die verschiedene Psychological Triggers nutzen: Curiosity Gap, Urgency, Social Proof, Personalization, Benefit-Driven, Question-Based, Number-Driven, Humor, Controversy, Simplicity. Für jede Line: Geschätzter Open Rate Potential (Low/Med/High) + Begründung.",
    category: "writing",
    tags: ["email", "marketing", "copywriting"],
    rating: 4.7,
    uses: 3245,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 15,
    title: "Blog Post Outliner",
    prompt: "Erstelle einen SEO-optimierten Blog Post Outline für [KEYWORD/THEMA]. Struktur: 1) Attention-Grabbing Title (mit Power Word), 2) Introduction mit Hook, 3) H2 Subheadings (mindestens 5) die Search Intent abdecken, 4) Key Points unter jedem H2, 5) FAQ Section (5 Fragen), 6) Conclusion mit CTA. Ziel: Featured Snippet + 8+ Min Lesedauer.",
    category: "writing",
    tags: ["blog", "seo", "content"],
    rating: 4.9,
    uses: 2891,
    author: "hohl.rocks",
    featured: true
  },

  // 🤖 AI/PROMPT ENGINEERING CATEGORY
  {
    id: 16,
    title: "System Prompt Builder",
    prompt: "Erstelle einen System Prompt für einen AI Assistant der [ROLLE/AUFGABE] erfüllt. Inkludiere: 1) Role Definition (Wer bist du, was ist deine Expertise?), 2) Task Boundaries (Was tust du, was nicht?), 3) Output Format (Struktur der Antworten), 4) Tone & Style Guidelines, 5) Edge Case Handling (Was bei unklaren Anfragen?). Teste mit 3 Example Inputs.",
    category: "ai",
    tags: ["prompt", "ai", "llm"],
    rating: 4.9,
    uses: 1789,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 17,
    title: "Few-Shot Prompt Designer",
    prompt: "Designe einen Few-Shot Prompt für [AUFGABE] mit dieser Struktur: 1) Clear Instruction (Was soll Output sein?), 2) 3 Diverse Examples (Input → Output Pairs), 3) Edge Case Example (wie mit Ausnahmen umgehen), 4) Output Format Specification (JSON, Markdown, etc.), 5) Quality Criteria (was macht Output 'gut'?). Optimiere für Consistency.",
    category: "ai",
    tags: ["prompt", "few-shot", "llm"],
    rating: 4.8,
    uses: 1234,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 18,
    title: "Chain-of-Thought Optimizer",
    prompt: "Konvertiere [SIMPLE PROMPT] in einen Chain-of-Thought Prompt der bessere Reasoning produziert. Struktur: 1) Problem Decomposition (Zerlege in Sub-Problems), 2) Step-by-Step Reasoning (Denke laut), 3) Self-Verification (Check deine Logik), 4) Final Answer. Vergleiche Output-Qualität vorher/nachher und erkläre den Unterschied.",
    category: "ai",
    tags: ["prompt", "cot", "reasoning"],
    rating: 4.7,
    uses: 987,
    author: "hohl.rocks",
    featured: true
  },

  // 💬 COMMUNICATION CATEGORY
  {
    id: 19,
    title: "Feedback Sandwich Maker",
    prompt: "Formuliere konstruktives Feedback für [SITUATION/PERSON] nach der 'Context-Behavior-Impact-Future' Methode: 1) Context (Was war die Situation?), 2) Observed Behavior (Was hast du gesehen? Fakten ohne Interpretation), 3) Impact (Wie hat es sich ausgewirkt?), 4) Future Action (Konkrete Verbesserungs-Vorschläge). Ton: Constructive, empathetic, action-oriented.",
    category: "communication",
    tags: ["feedback", "management", "leadership"],
    rating: 4.8,
    uses: 1567,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 20,
    title: "Meeting Agenda Architect",
    prompt: "Erstelle eine Meeting Agenda für [MEETING-TYP] die in [DAUER] durchführbar ist. Für jedes Agenda Item: 1) Time Block (realistisch!), 2) Objective (Was soll erreicht werden?), 3) Owner (Wer führt?), 4) Prep Required (Was müssen Teilnehmer vorbereiten?). Endgoal: Alle wissen vor Meeting was erwartet wird + nach Meeting was next steps sind.",
    category: "communication",
    tags: ["meeting", "productivity", "management"],
    rating: 4.6,
    uses: 2134,
    author: "hohl.rocks",
    featured: true
  },

  // 📊 DATA/ANALYTICS CATEGORY
  {
    id: 21,
    title: "Dashboard KPI Designer",
    prompt: "Designe ein Dashboard für [BUSINESS FUNCTION] mit diesen Komponenten: 1) North Star Metric (Die EINE wichtigste Zahl), 2) Supporting KPIs (5-7 Metriken die North Star treiben), 3) Trend Indicators (WoW, MoM, YoY), 4) Alert Thresholds (Ab wann Action nötig?), 5) Recommended Visualizations (Chart Type + Why). Ziel: Actionable Insights auf einen Blick.",
    category: "data",
    tags: ["analytics", "kpi", "dashboard"],
    rating: 4.7,
    uses: 1456,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 22,
    title: "A/B Test Hypothesis Builder",
    prompt: "Formuliere eine A/B Test Hypothese für [ÄNDERUNG/FEATURE] nach dem Format: 'Wir glauben dass [CHANGE] zu [EXPECTED OUTCOME] führt, weil [REASONING]. Wir messen das mit [PRIMARY METRIC] und erwarten [X% LIFT]. Wir brauchen [SAMPLE SIZE] über [DURATION].' Inkludiere: Success Criteria, Risk Assessment, Learning Objective.",
    category: "data",
    tags: ["testing", "hypothesis", "optimization"],
    rating: 4.8,
    uses: 1123,
    author: "hohl.rocks",
    featured: true
  },

  // 🎯 MARKETING CATEGORY
  {
    id: 23,
    title: "Customer Persona Builder",
    prompt: "Erstelle eine detaillierte Customer Persona für [PRODUKT/SERVICE] basierend auf Jobs-To-Be-Done Framework. Inkludiere: 1) Demographic Basics, 2) Job to be Done (funktional + emotional), 3) Pains & Gains, 4) Buying Triggers & Barriers, 5) Information Sources & Influencers, 6) 'A Day in the Life' Narrative. Mache die Persona real, nicht abstrakt.",
    category: "marketing",
    tags: ["persona", "customer", "strategy"],
    rating: 4.9,
    uses: 2345,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 24,
    title: "Value Proposition Canvas",
    prompt: "Fülle einen Value Proposition Canvas für [PRODUKT] aus. Linke Seite (Customer Profile): Jobs, Pains, Gains. Rechte Seite (Value Map): Products/Services, Pain Relievers, Gain Creators. Für jedes Element: Konkrete Beispiele, nicht generische Statements. Identifiziere den stärksten Fit und formuliere daraus einen One-Liner Value Prop.",
    category: "marketing",
    tags: ["value", "proposition", "strategy"],
    rating: 4.8,
    uses: 1789,
    author: "hohl.rocks",
    featured: true
  },

  // 🚀 PRODUCTIVITY CATEGORY
  {
    id: 25,
    title: "Sprint Planning Template",
    prompt: "Erstelle einen Sprint Plan für [PROJEKT/FEATURE] nach dieser Struktur: 1) Sprint Goal (Was ist Success?), 2) User Stories mit Acceptance Criteria, 3) Task Breakdown mit Effort Estimates, 4) Dependency Map, 5) Risk Assessment & Mitigation. Nutze Story Points (Fibonacci) und berücksichtige Team Capacity. Endgoal: Realistic, achievable Sprint.",
    category: "productivity",
    tags: ["agile", "sprint", "project"],
    rating: 4.7,
    uses: 1567,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 26,
    title: "Decision Matrix Builder",
    prompt: "Erstelle eine Decision Matrix für [ENTSCHEIDUNG] mit diesen Schritten: 1) Liste alle Optionen (min. 3), 2) Definiere Evaluation Criteria mit Weights (Total = 100%), 3) Score jede Option pro Criterion (1-10), 4) Calculate Weighted Scores, 5) Sensitivity Analysis (was wenn Weights ändern?). Empfehle die beste Option mit Begründung.",
    category: "productivity",
    tags: ["decision", "framework", "analysis"],
    rating: 4.8,
    uses: 1891,
    author: "hohl.rocks",
    featured: true
  },

  // 🎨 DESIGN CATEGORY
  {
    id: 27,
    title: "UX Research Plan",
    prompt: "Erstelle einen UX Research Plan für [FEATURE/PRODUKT] mit: 1) Research Questions (Was wollen wir lernen?), 2) Methodology (Interviews, Surveys, Usability Tests?), 3) Participant Criteria & Recruitment, 4) Discussion Guide / Test Script, 5) Analysis Framework, 6) Timeline & Resources. Ziel: Actionable Insights, nicht nur 'interesting findings'.",
    category: "design",
    tags: ["ux", "research", "testing"],
    rating: 4.7,
    uses: 1234,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 28,
    title: "Design System Foundation",
    prompt: "Lege das Foundation für ein Design System für [PRODUKT/BRAND] fest: 1) Color Palette (Primary, Secondary, Semantic Colors mit Hex), 2) Typography Scale (Font Families, Sizes, Line Heights), 3) Spacing System (4pt/8pt Grid?), 4) Component Naming Convention, 5) Accessibility Standards (WCAG Level). Liefere Design Tokens in JSON Format.",
    category: "design",
    tags: ["design-system", "ui", "foundation"],
    rating: 4.9,
    uses: 1678,
    author: "hohl.rocks",
    featured: true
  },

  // 💡 INNOVATION CATEGORY
  {
    id: 29,
    title: "SCAMPER Ideation",
    prompt: "Nutze die SCAMPER Methode um [PRODUKT/SERVICE] neu zu denken: S - Substitute (Was ersetzen?), C - Combine (Was kombinieren?), A - Adapt (Was anpassen?), M - Modify (Was verändern?), P - Put to other use (Andere Nutzung?), E - Eliminate (Was weglassen?), R - Reverse (Was umkehren?). Für jede Dimension: 2-3 konkrete Ideen. Bewerte Top 3 nach Feasibility & Impact.",
    category: "innovation",
    tags: ["ideation", "creativity", "innovation"],
    rating: 4.8,
    uses: 987,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 30,
    title: "Trend Forecasting Framework",
    prompt: "Analysiere Trends in [INDUSTRIE/BEREICH] und forecaste Entwicklungen für die nächsten 12-24 Monate. Nutze PESTEL Framework (Political, Economic, Social, Technological, Environmental, Legal). Für jeden Trend: Current State, Driving Forces, Potential Disruptions, Strategic Implications. Identifiziere 3 'Weak Signals' die andere noch nicht sehen.",
    category: "innovation",
    tags: ["trends", "forecast", "strategy"],
    rating: 4.7,
    uses: 1345,
    author: "hohl.rocks",
    featured: true
  }
];

export const SPARKS_DATABASE = [
      {
        spark: "KI ist nicht die Zukunft. KI ist jetzt.",
        author: "hohl.rocks",
        category: "mindset"
      },
      {
        spark: "Der beste Prompt ist der, der die richtigen Fragen stellt, nicht die perfekten Antworten erwartet.",
        author: "hohl.rocks",
        category: "prompting"
      },
      {
        spark: "Kreativität entsteht nicht durch Perfektion, sondern durch Iteration.",
        author: "hohl.rocks",
        category: "creativity"
      },
      {
        spark: "Wer KI nur als Tool sieht, unterschätzt das Medium. Wer KI nur als Partner sieht, überschätzt die Technologie.",
        author: "hohl.rocks",
        category: "philosophy"
      },
      {
        spark: "Der Wert eines Prompts liegt nicht in seiner Länge, sondern in seiner Präzision.",
        author: "hohl.rocks",
        category: "prompting"
      },
      {
        spark: "Innovation passiert nicht in der Komfortzone. Auch nicht beim Prompten.",
        author: "hohl.rocks",
        category: "innovation"
      },
      {
        spark: "KI demokratisiert Expertise. Aber Expertise ersetzt sie nicht.",
        author: "hohl.rocks",
        category: "expertise"
      },
      {
        spark: "Die beste KI-Strategie ist die, die du heute umsetzt. Nicht die perfekte für morgen.",
        author: "hohl.rocks",
        category: "strategy"
      },
      {
        spark: "Prompts sind wie Rezepte: Die Zutaten sind wichtig, aber die Reihenfolge macht den Unterschied.",
        author: "hohl.rocks",
        category: "prompting"
      },
      {
        spark: "Wer keine dummen Fragen stellt, bekommt keine klugen Antworten.",
        author: "hohl.rocks",
        category: "learning"
      },
      {
        spark: "KI ist der Verstärker deiner Intention. Gute Intention → bessere Ergebnisse.",
        author: "hohl.rocks",
        category: "mindset"
      },
      {
        spark: "Der größte Fehler beim Prompten: Zu früh aufgeben. Der zweitgrößte: Zu lange am selben Ansatz festhalten.",
        author: "hohl.rocks",
        category: "prompting"
      },
      {
        spark: "Automation ohne Vision ist Effizienz ohne Richtung.",
        author: "hohl.rocks",
        category: "automation"
      },
      {
        spark: "KI-Kompetenz ist keine technische Frage. Es ist eine Kulturelle.",
        author: "hohl.rocks",
        category: "culture"
      },
      {
        spark: "Der Unterschied zwischen einem guten und einem großartigen Prompt? Context. Immer Context.",
        author: "hohl.rocks",
        category: "prompting"
      },
      {
        spark: "Wer KI nutzt, um Zeit zu sparen, denkt zu klein. Nutze KI, um Dinge zu erreichen, die vorher unmöglich waren.",
        author: "hohl.rocks",
        category: "vision"
      },
      {
        spark: "Fehler sind keine Bugs. Sie sind Feedback auf deinem Weg zur besseren Lösung.",
        author: "hohl.rocks",
        category: "learning"
      },
      {
        spark: "Die Kunst des Promptens: Konkret genug für Relevanz, offen genug für Kreativität.",
        author: "hohl.rocks",
        category: "prompting"
      },
      {
        spark: "KI kann viel. Aber sie kann nicht wollen. Das ist dein Job.",
        author: "hohl.rocks",
        category: "philosophy"
      },
      {
        spark: "Der beste Use Case für KI ist der, den du noch nicht kennst. Also: Experimentiere.",
        author: "hohl.rocks",
        category: "innovation"
      },
      {
        spark: "Prompt Engineering ist 10% Technik, 40% Psychologie, 50% Iteration.",
        author: "hohl.rocks",
        category: "prompting"
      },
      {
        spark: "Wer auf den perfekten Prompt wartet, verpasst 1000 gute Prompts.",
        author: "hohl.rocks",
        category: "action"
      },
      {
        spark: "KI-Tools kommen und gehen. KI-Thinking bleibt.",
        author: "hohl.rocks",
        category: "mindset"
      },
      {
        spark: "Die größte Barriere bei KI-Adoption ist nicht die Technologie. Es ist die Vorstellungskraft.",
        author: "hohl.rocks",
        category: "adoption"
      },
      {
        spark: "Ein guter Prompt beantwortet die Frage. Ein großartiger Prompt stellt bessere Fragen.",
        author: "hohl.rocks",
        category: "prompting"
      },
      {
        spark: "KI macht nicht alles einfacher. Aber sie macht Unmögliches möglich.",
        author: "hohl.rocks",
        category: "possibility"
      },
      {
        spark: "Der Wert deiner KI-Strategie misst sich nicht an den Tools, sondern an den Ergebnissen.",
        author: "hohl.rocks",
        category: "strategy"
      },
      {
        spark: "Wer KI als Bedrohung sieht, unterschätzt seine eigene Rolle. Wer sie als Lösung sieht, unterschätzt die Herausforderung.",
        author: "hohl.rocks",
        category: "balance"
      },
      {
        spark: "Die Zukunft gehört denen, die heute anfangen zu lernen, nicht denen, die gestern perfekt waren.",
        author: "hohl.rocks",
        category: "future"
      },
      {
        spark: "Prompts sind Brücken zwischen deiner Intention und der KI-Execution. Baue stabile Brücken.",
        author: "hohl.rocks",
        category: "prompting"
      },
      {
        spark: "KI-Literacy ist die neue Digital Literacy. Und die neue Digital Literacy ist überlebenswichtig.",
        author: "hohl.rocks",
        category: "education"
      }
    ];
