// ===================================================================
// HOHL.ROCKS BACKEND - Node.js/Express Server (OPTIMIZED)
// Features: Prompt Generator + Optimizer + Library + Model Battle + Daily Challenge
// Version: 2.0 - Optimized & Modularized
// ===================================================================

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || "development";

// ===================================================================
// LOGGING MIDDLEWARE (NEW)
// ===================================================================

const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
};

app.use(requestLogger);

// ===================================================================
// MIDDLEWARE
// ===================================================================

app.use(express.json({ limit: "10mb" }));

// CORS Configuration - Fixed for Production
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:8080",
      "https://hohl.rocks",
      "https://www.hohl.rocks"
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ===================================================================
// API CLIENTS
// ===================================================================

// Anthropic (Claude)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

// OpenAI (GPT)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Perplexity (via fetch)
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// ===================================================================
// API KEY VALIDATION (NEW)
// ===================================================================

const validateApiKeys = () => {
  const errors = [];
  
  if (!process.env.ANTHROPIC_API_KEY) {
    errors.push("❌ ANTHROPIC_API_KEY missing");
  }
  
  if (!process.env.OPENAI_API_KEY) {
    errors.push("❌ OPENAI_API_KEY missing");
  }
  
  if (!process.env.PERPLEXITY_API_KEY) {
    errors.push("❌ PERPLEXITY_API_KEY missing");
  }
  
  if (errors.length > 0) {
    console.error("\n⚠️  API KEY VALIDATION FAILED:");
    errors.forEach(err => console.error(err));
    console.error("\n");
  } else {
    console.log("✅ All API keys validated");
  }
  
  return errors.length === 0;
};

// ===================================================================
// FEATURED PROMPTS DATABASE
// ===================================================================

const FEATURED_PROMPTS = [
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

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

async function callClaude(systemPrompt, userPrompt, maxTokens = 1500) {
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    return message.content[0].text;
  } catch (error) {
    console.error("Anthropic API Error:", error);
    throw error;
  }
}

// ===================================================================
// HEALTH CHECK & INFO ROUTES
// ===================================================================

// Main Health Check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "hohl.rocks backend is running",
    version: "2.0",
    features: [
      "prompt-generator",
      "prompt-optimizer",
      "prompt-library",
      "model-battle",
      "daily-challenge"
    ],
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Health Check Route (NEW)
app.get("/health", (req, res) => {
  const health = {
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      api: "ok",
      database: "ok"
    }
  };
  
  res.status(200).json(health);
});

// Self Route (NEW) - Required by Frontend
app.get("/api/self", (req, res) => {
  res.json({
    status: "ok",
    user: null, // Later mit Auth erweitern
    features: [
      "prompt-generator",
      "prompt-optimizer",
      "prompt-library",
      "model-battle",
      "daily-challenge"
    ],
    availableModels: ["claude", "gpt", "perplexity"],
    limits: {
      maxPromptLength: 2000,
      maxResponseTokens: 1024,
      rateLimit: "100/hour"
    },
    timestamp: new Date().toISOString()
  });
});

// ===================================================================
// FEATURE #1: PROMPT GENERATOR
// ===================================================================

app.post("/api/prompt-generator", async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Topic is required and must be a non-empty string",
      });
    }

    if (topic.length > 500) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Topic too long (max 500 characters)",
      });
    }

    const systemPrompt = `Du bist ein Prompt Engineering Experte. Deine Aufgabe ist es, für ein gegebenes Thema 5 verschiedene Prompt-Styles zu generieren.

Die 5 Styles sind:
1. EXECUTIVE: Business-strategisch, ROI-fokussiert, für C-Level
2. TECHNICAL: Entwickler-orientiert, implementierungs-fokussiert, technisch präzise
3. CREATIVE: Out-of-the-box, metaphorisch, visuell anregend
4. TUTORIAL: Step-by-step, didaktisch, für Anfänger geeignet
5. EXPERT: Deep-dive, akademisch, für Experten

Jeder Prompt sollte:
- Spezifisch und actionable sein
- Den jeweiligen Style klar repräsentieren
- 2-4 Sätze lang sein
- Deutsche Sprache nutzen

Ausgabeformat (genau so formatieren):
[STYLE_NAME]
[Prompt Text hier]

[STYLE_NAME]
[Prompt Text hier]

etc.`;

    const userPrompt = `Thema: ${topic.trim()}

Generiere 5 verschiedene Prompt-Styles (Executive, Technical, Creative, Tutorial, Expert) für dieses Thema.`;

    const response = await callClaude(systemPrompt, userPrompt, 2000);

    // Parse die Antwort
    const styles = {};
    const sections = response.split("\n\n").filter((s) => s.trim());

    const styleNames = ["executive", "technical", "creative", "tutorial", "expert"];
    let currentIndex = 0;

    sections.forEach((section) => {
      const lines = section.split("\n").filter((l) => l.trim());
      if (lines.length >= 2) {
        const styleName = styleNames[currentIndex] || `style_${currentIndex}`;
        const promptText = lines.slice(1).join(" ").trim();
        styles[styleName] = promptText;
        currentIndex++;
      }
    });

    res.json({
      success: true,
      topic: topic.trim(),
      styles: styles,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in prompt-generator:", error);
    res.status(500).json({
      error: "Generation failed",
      message: error.message,
    });
  }
});

// ===================================================================
// FEATURE #2: PROMPT OPTIMIZER
// ===================================================================

app.post("/api/prompt-optimizer", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Prompt is required and must be a non-empty string",
      });
    }

    if (prompt.length > 1000) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Prompt too long (max 1000 characters)",
      });
    }

    const systemPrompt = `Du bist ein Prompt Engineering Experte. Deine Aufgabe ist es, einen gegebenen Prompt zu analysieren, zu bewerten und zu optimieren.

Analyse-Kriterien:
1. Klarheit: Ist der Prompt eindeutig verständlich?
2. Spezifität: Sind die Anforderungen konkret genug?
3. Kontext: Ist genug Kontext für eine gute Antwort gegeben?
4. Struktur: Ist der Prompt gut strukturiert?
5. Actionability: Ist klar, was das gewünschte Output sein soll?

Ausgabeformat (EXAKT so formatieren, keine zusätzlichen Zeichen):
SCORE: [Zahl von 1-10]
PROBLEMS:
- [Problem 1]
- [Problem 2]
- [Problem 3]
IMPROVED:
[Optimierter Prompt hier]
EXPLANATION:
[Erklärung warum besser]`;

    const userPrompt = `Original Prompt: "${prompt.trim()}"

Analysiere und optimiere diesen Prompt. Gib einen Score (1-10), liste Probleme, erstelle einen verbesserten Prompt und erkläre die Verbesserungen.`;

    const response = await callClaude(systemPrompt, userPrompt, 2500);

    // Parse die Antwort
    const scoreMatch = response.match(/SCORE:\s*(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;

    const problemsMatch = response.match(/PROBLEMS:\s*([\s\S]*?)(?=IMPROVED:|$)/);
    const problemsText = problemsMatch ? problemsMatch[1].trim() : "";
    const problems = problemsText
      .split("\n")
      .filter((line) => line.trim().startsWith("-"))
      .map((line) => line.replace(/^-\s*/, "").trim())
      .filter((p) => p.length > 0);

    const improvedMatch = response.match(/IMPROVED:\s*([\s\S]*?)(?=EXPLANATION:|$)/);
    const improvedPrompt = improvedMatch ? improvedMatch[1].trim() : prompt;

    const explanationMatch = response.match(/EXPLANATION:\s*([\s\S]*?)$/);
    const explanation = explanationMatch ? explanationMatch[1].trim() : "Verbesserungen wurden vorgenommen.";

    res.json({
      success: true,
      original: {
        prompt: prompt.trim(),
        score: score,
      },
      analysis: {
        problems: problems.length > 0 ? problems : ["Prompt könnte spezifischer sein"],
      },
      improved: {
        prompt: improvedPrompt,
        score: Math.min(score + 3, 10),
        explanation: explanation,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in prompt-optimizer:", error);
    res.status(500).json({
      error: "Optimization failed",
      message: error.message,
    });
  }
});

// ===================================================================
// FEATURE #3: PROMPT LIBRARY
// ===================================================================

app.get("/api/prompts", (req, res) => {
  try {
    const { category, search, featured } = req.query;

    let filteredPrompts = [...FEATURED_PROMPTS];

    // Filter by category
    if (category && category !== "all") {
      filteredPrompts = filteredPrompts.filter((p) => p.category === category);
    }

    // Filter by featured
    if (featured === "true") {
      filteredPrompts = filteredPrompts.filter((p) => p.featured === true);
    }

    // Search in title, prompt, and tags
    if (search && search.trim().length > 0) {
      const searchLower = search.toLowerCase().trim();
      filteredPrompts = filteredPrompts.filter(
        (p) =>
          p.title.toLowerCase().includes(searchLower) ||
          p.prompt.toLowerCase().includes(searchLower) ||
          p.tags.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }

    // Sort by rating (descending) then by uses (descending)
    filteredPrompts.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return b.uses - a.uses;
    });

    res.json({
      success: true,
      count: filteredPrompts.length,
      prompts: filteredPrompts,
      categories: ["all", "creative", "business", "technical", "education", "writing", "ai", "communication", "data", "marketing", "productivity", "design", "innovation"],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in prompts:", error);
    res.status(500).json({
      error: "Failed to fetch prompts",
      message: error.message,
    });
  }
});

// Get single prompt by ID
app.get("/api/prompts/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        error: "Invalid ID",
        message: "ID must be a number"
      });
    }
    
    const prompt = FEATURED_PROMPTS.find((p) => p.id === id);

    if (!prompt) {
      return res.status(404).json({
        error: "Not found",
        message: `Prompt with ID ${id} not found`,
      });
    }

    res.json({
      success: true,
      prompt: prompt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching prompt:", error);
    res.status(500).json({
      error: "Failed to fetch prompt",
      message: error.message,
    });
  }
});

// ===================================================================
// FEATURE #4: MODEL BATTLE ARENA - Compare 3 AI Models
// ===================================================================

app.post("/api/model-battle", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ 
        error: "Prompt is required" 
      });
    }

    if (prompt.length > 2000) {
      return res.status(400).json({ 
        error: "Prompt too long (max 2000 characters)" 
      });
    }

    console.log(`\n⚔️  Model Battle: "${prompt.slice(0, 50)}..."`);

    // Parallel API Calls mit Response Time Tracking
    const results = await Promise.allSettled([
      // Claude Sonnet 4
      (async () => {
        const startTime = Date.now();
        try {
          const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            messages: [{
              role: "user",
              content: prompt
            }]
          });
          
          return {
            model: "claude",
            name: "Claude Sonnet 4",
            response: message.content[0].text,
            responseTime: Date.now() - startTime,
            success: true
          };
        } catch (error) {
          console.error("Claude error:", error.message);
          return {
            model: "claude",
            name: "Claude Sonnet 4",
            response: "Fehler bei der Anfrage",
            error: error.message,
            responseTime: Date.now() - startTime,
            success: false
          };
        }
      })(),

      // GPT-4o-mini
      (async () => {
        const startTime = Date.now();
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 1024,
            messages: [{
              role: "user",
              content: prompt
            }]
          });
          
          return {
            model: "gpt",
            name: "GPT-4o Mini",
            response: completion.choices[0].message.content,
            responseTime: Date.now() - startTime,
            success: true
          };
        } catch (error) {
          console.error("GPT error:", error.message);
          return {
            model: "gpt",
            name: "GPT-4o Mini",
            response: "Fehler bei der Anfrage",
            error: error.message,
            responseTime: Date.now() - startTime,
            success: false
          };
        }
      })(),

      // Perplexity Sonar Pro
      (async () => {
        const startTime = Date.now();
        try {
          const response = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${PERPLEXITY_API_KEY}`
            },
            body: JSON.stringify({
              model: "sonar-pro",
              max_tokens: 1024,
              messages: [{
                role: "user",
                content: prompt
              }]
            })
          });

          if (!response.ok) {
            throw new Error(`Perplexity API error: ${response.status}`);
          }

          const data = await response.json();
          
          return {
            model: "perplexity",
            name: "Perplexity Sonar Pro",
            response: data.choices[0].message.content,
            responseTime: Date.now() - startTime,
            success: true
          };
        } catch (error) {
          console.error("Perplexity error:", error.message);
          return {
            model: "perplexity",
            name: "Perplexity Sonar Pro",
            response: "Fehler bei der Anfrage",
            error: error.message,
            responseTime: Date.now() - startTime,
            success: false
          };
        }
      })()
    ]);

    // Extract results
    const responses = results.map(result => 
      result.status === 'fulfilled' ? result.value : result.reason
    );

    // Log response times
    console.log("⏱️  Response Times:");
    responses.forEach(r => {
      console.log(`   ${r.name}: ${r.responseTime}ms ${r.success ? '✓' : '✗'}`);
    });

    res.json({
      success: true,
      prompt,
      responses,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Model Battle error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message
    });
  }
});

// ===================================================================
// FEATURE #5: DAILY CHALLENGE - Get Challenge of the Day
// ===================================================================

app.get("/api/daily-challenge", async (req, res) => {
  try {
    // Get current date (UTC) as seed for challenge
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`\n🎯 Fetching Daily Challenge for ${dateString}`);

    // Generate challenge based on date (same challenge for everyone on same day)
    const systemPrompt = `Du bist ein KI-Challenge-Designer. Erstelle eine tägliche KI-Challenge für das Datum ${dateString}.

Die Challenge sollte:
1. Praktisch und im echten Leben nützlich sein
2. In 10-15 Minuten lösbar sein
3. Kreativität fördern
4. Klare Bewertungskriterien haben

Erstelle eine Challenge mit 3 Schwierigkeitsgraden:
- **Beginner**: Einfach, klare Struktur, wenig Erfahrung nötig
- **Intermediate**: Moderater Anspruch, etwas strategisches Denken
- **Expert**: Komplex, erfordert tiefes Verständnis

Antworte NUR mit einem JSON-Objekt, keine zusätzlichen Erklärungen.`;

    const userPrompt = `Erstelle eine Daily Challenge im folgenden Format:

{
  "date": "${dateString}",
  "theme": "Kurzes Thema (z.B. 'Content Creation', 'Problem Solving')",
  "challenges": {
    "beginner": {
      "title": "Challenge Titel",
      "description": "Was soll gemacht werden? (2-3 Sätze)",
      "task": "Konkrete Aufgabe",
      "hint": "Hilfreicher Tipp",
      "estimatedTime": "10 Min"
    },
    "intermediate": {
      "title": "Challenge Titel",
      "description": "Was soll gemacht werden? (2-3 Sätze)",
      "task": "Konkrete Aufgabe",
      "hint": "Hilfreicher Tipp",
      "estimatedTime": "12 Min"
    },
    "expert": {
      "title": "Challenge Titel",
      "description": "Was soll gemacht werden? (2-3 Sätze)",
      "task": "Konkrete Aufgabe",
      "hint": "Hilfreicher Tipp",
      "estimatedTime": "15 Min"
    }
  }
}

Sei kreativ! Wechsle zwischen verschiedenen Themen: Content, Strategie, Analyse, Kommunikation, etc.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `${systemPrompt}\n\n${userPrompt}`
      }]
    });

    const responseText = message.content[0].text;
    
    // Extract JSON from response
    let challenge;
    try {
      challenge = JSON.parse(responseText);
    } catch (e) {
      const jsonMatch = responseText.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch) {
        challenge = JSON.parse(jsonMatch[1]);
      } else {
        const objectMatch = responseText.match(/{[\s\S]+}/);
        if (objectMatch) {
          challenge = JSON.parse(objectMatch[0]);
        } else {
          throw new Error("Could not parse JSON from response");
        }
      }
    }

    console.log(`✅ Generated challenge: "${challenge.theme}"`);

    res.json({
      success: true,
      challenge,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error generating daily challenge:", error);
    res.status(500).json({
      error: "Failed to generate daily challenge",
      message: error.message
    });
  }
});

// ===================================================================
// FEATURE #5: DAILY CHALLENGE - Submit & Evaluate Answer
// ===================================================================

app.post("/api/submit-challenge", async (req, res) => {
  try {
    const { difficulty, task, answer } = req.body;

    if (!difficulty || !task || !answer) {
      return res.status(400).json({ 
        error: "Missing required fields: difficulty, task, answer" 
      });
    }

    if (answer.trim().length < 20) {
      return res.status(400).json({ 
        error: "Answer too short (minimum 20 characters)" 
      });
    }

    if (answer.length > 5000) {
      return res.status(400).json({ 
        error: "Answer too long (maximum 5000 characters)" 
      });
    }

    console.log(`\n🏆 Evaluating ${difficulty} challenge submission...`);

    const systemPrompt = `Du bist ein KI-Challenge-Bewerter. Bewerte die eingereichte Antwort auf eine Daily Challenge.

Bewertungskriterien:
- **Relevanz**: Passt die Antwort zur Aufgabe?
- **Qualität**: Ist die Antwort durchdacht und gut strukturiert?
- **Kreativität**: Zeigt die Antwort originelles Denken?
- **Vollständigkeit**: Wurden alle Aspekte der Aufgabe erfüllt?

Badge-Vergabe:
- **Bronze (60-74%)**: Grundlegende Anforderungen erfüllt, aber Verbesserungspotenzial
- **Silver (75-89%)**: Gute Qualität, durchdacht, erfüllt Anforderungen gut
- **Gold (90-100%)**: Exzellent, kreativ, professionell, übertrifft Erwartungen

Antworte NUR mit einem JSON-Objekt, keine zusätzlichen Erklärungen.`;

    const userPrompt = `Aufgabe (${difficulty}): "${task}"

Eingereichte Antwort:
"${answer}"

Bewerte die Antwort und erstelle ein JSON-Objekt:
{
  "score": 85,
  "badge": "silver",
  "feedback": {
    "positive": ["Was wurde gut gemacht?", "Stärken der Antwort"],
    "improvements": ["Was könnte besser sein?", "Verbesserungsvorschläge"]
  },
  "summary": "Kurze 1-2 Satz Zusammenfassung der Bewertung"
}`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `${systemPrompt}\n\n${userPrompt}`
      }]
    });

    const responseText = message.content[0].text;
    
    // Extract JSON from response
    let evaluation;
    try {
      evaluation = JSON.parse(responseText);
    } catch (e) {
      const jsonMatch = responseText.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[1]);
      } else {
        const objectMatch = responseText.match(/{[\s\S]+}/);
        if (objectMatch) {
          evaluation = JSON.parse(objectMatch[0]);
        } else {
          throw new Error("Could not parse JSON from response");
        }
      }
    }

    console.log(`✅ Evaluation complete: ${evaluation.badge.toUpperCase()} (${evaluation.score}%)`);

    res.json({
      success: true,
      evaluation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error evaluating challenge:", error);
    res.status(500).json({
      error: "Failed to evaluate challenge",
      message: error.message
    });
  }
});

// ===================================================================
// ERROR HANDLERS (NEW)
// ===================================================================

// 404 Handler - Muss VOR dem Error Handler kommen
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    message: `Route ${req.method} ${req.path} not found`,
    availableRoutes: [
      "GET /",
      "GET /health",
      "GET /api/self",
      "POST /api/prompt-generator",
      "POST /api/prompt-optimizer",
      "GET /api/prompts",
      "GET /api/prompts/:id",
      "POST /api/model-battle",
      "GET /api/daily-challenge",
      "POST /api/submit-challenge"
    ],
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler
app.use((error, req, res, next) => {
  console.error("❌ Global Error Handler:", error);
  
  // CORS Error
  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({
      error: "CORS Error",
      message: "Origin not allowed",
      timestamp: new Date().toISOString()
    });
  }
  
  // JSON Parsing Error
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      error: "Invalid JSON",
      message: "Request body must be valid JSON",
      timestamp: new Date().toISOString()
    });
  }
  
  // Generic Error
  res.status(500).json({
    error: "Internal Server Error",
    message: NODE_ENV === "development" ? error.message : "An error occurred",
    timestamp: new Date().toISOString()
  });
});

// ===================================================================
// GRACEFUL SHUTDOWN (NEW)
// ===================================================================

process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

// ===================================================================
// START SERVER
// ===================================================================

// Validate API Keys before starting
const apiKeysValid = validateApiKeys();

if (!apiKeysValid && NODE_ENV === "production") {
  console.error("\n❌ Cannot start server: API keys validation failed");
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    🚀 HOHL.ROCKS BACKEND                   ║
╠════════════════════════════════════════════════════════════╣
║  Version:          2.0 (Optimized)                         ║
║  Port:             ${PORT.toString().padEnd(44)}║
║  Environment:      ${NODE_ENV.padEnd(44)}║
║  Model:            ${MODEL.padEnd(44)}║
║  Prompts:          ${FEATURED_PROMPTS.length.toString().padEnd(44)}║
╠════════════════════════════════════════════════════════════╣
║  Features:                                                 ║
║    ✓ Prompt Generator (5 Styles)                          ║
║    ✓ Prompt Optimizer (Analysis & Improvement)            ║
║    ✓ Prompt Library (30 Featured)                         ║
║    ✓ Model Battle (Claude, GPT, Perplexity)               ║
║    ✓ Daily Challenge (Gamification)                       ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    • GET  /                                                ║
║    • GET  /health                                          ║
║    • GET  /api/self                                        ║
║    • POST /api/prompt-generator                            ║
║    • POST /api/prompt-optimizer                            ║
║    • GET  /api/prompts                                     ║
║    • POST /api/model-battle                                ║
║    • GET  /api/daily-challenge                             ║
║    • POST /api/submit-challenge                            ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  console.log(`✅ Server ready at http://localhost:${PORT}`);
  console.log(`⏰ Started at ${new Date().toISOString()}\n`);
});
