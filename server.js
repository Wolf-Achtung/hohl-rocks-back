// ===================================================================
// HOHL.ROCKS BACKEND - Node.js/Express Server
// Features: Prompt Generator + Optimizer + Library (+ Model Battle wenn OpenAI installiert)
// ===================================================================

import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8080;

// ===================================================================
// OPTIONAL OPENAI IMPORT (Crash-Safe)
// ===================================================================

let openai = null;
let PERPLEXITY_API_KEY = null;
let OPENAI_AVAILABLE = false;

try {
  const OpenAI = (await import("openai")).default;
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
  OPENAI_AVAILABLE = true;
  console.log("✅ OpenAI SDK loaded - Model Battle enabled!");
} catch (error) {
  console.log("⚠️  OpenAI SDK not found - Model Battle disabled");
  console.log("   Run: npm install openai");
}

// ===================================================================
// MIDDLEWARE
// ===================================================================

app.use(express.json({ limit: "10mb" }));

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000", "http://localhost:5173"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

// ===================================================================
// API CLIENTS
// ===================================================================

// Anthropic (Claude)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

// ===================================================================
// FEATURED PROMPTS DATABASE (Static for now)
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
    tags: ["roi", "sales", "consulting"],
    rating: 4.8,
    uses: 1456,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 6,
    title: "Meeting Minutes Master",
    prompt: "Erstelle aus [MEETING-NOTIZEN] ein strukturiertes Meeting Protocol mit: 1) Decisions Made (was wurde entschieden?), 2) Action Items (wer macht was bis wann?), 3) Parking Lot (offene Fragen für später), 4) Follow-up Next Steps. Nutze klare Bullet Points und Verantwortlichkeiten.",
    category: "business",
    tags: ["meetings", "productivity", "documentation"],
    rating: 4.7,
    uses: 982,
    author: "hohl.rocks",
    featured: true
  },

  // 💻 TECHNICAL CATEGORY
  {
    id: 7,
    title: "Code Review Strategist",
    prompt: "Du bist ein erfahrener Tech Lead. Review diesen Code [CODE] und gib strukturiertes Feedback in 3 Kategorien: 1) Critical Issues (Security, Performance, Bugs), 2) Best Practices (Code Quality, Maintainability), 3) Nice-to-Have (Optimizations, Refactoring Ideas). Priorisiere nach Impact vs. Effort.",
    category: "technical",
    tags: ["code-review", "development", "quality"],
    rating: 4.9,
    uses: 2134,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 8,
    title: "API Documentation Generator",
    prompt: "Erstelle eine professionelle API-Dokumentation für [ENDPOINT]. Inkludiere: 1) Endpoint Description & Use Case, 2) Request Parameters (mit Typen & Validierung), 3) Response Schema (Success & Error Cases), 4) Code Examples (curl, JavaScript, Python), 5) Rate Limits & Authentication. Nutze OpenAPI 3.0 Format.",
    category: "technical",
    tags: ["api", "documentation", "development"],
    rating: 4.8,
    uses: 1567,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 9,
    title: "Debug Strategy Architect",
    prompt: "Ich habe diesen Bug: [BUG-DESCRIPTION]. Entwickle eine systematische Debug-Strategie: 1) Root Cause Hypotheses (3 wahrscheinlichste Ursachen), 2) Investigation Steps (wie kann ich jede Hypothese testen?), 3) Quick Fixes vs. Proper Solutions, 4) Prevention Strategy (wie verhindere ich das in Zukunft?).",
    category: "technical",
    tags: ["debugging", "problem-solving", "development"],
    rating: 4.7,
    uses: 1789,
    author: "hohl.rocks",
    featured: true
  },

  // 📢 MARKETING CATEGORY
  {
    id: 10,
    title: "LinkedIn Content Engine",
    prompt: "Erstelle 5 LinkedIn Posts für [THEMA/PRODUKT] die verschiedene Content-Formate nutzen: 1) Personal Story (mit Lesson Learned), 2) Contrarian Take (polarisierender Standpunkt), 3) Data-Driven Insight (mit Zahlen), 4) How-To Guide (praktische Tipps), 5) Question Post (Community Engagement). Jeder Post max. 150 Wörter, Hook in erster Zeile.",
    category: "marketing",
    tags: ["linkedin", "social-media", "content"],
    rating: 4.9,
    uses: 2456,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 11,
    title: "Email Sequence Builder",
    prompt: "Entwickle eine 5-Email-Sequence für [ZIEL/CONVERSION]. Jede Email hat einen spezifischen Purpose: 1) Welcome & Value Proposition, 2) Educational Content (Problem Deep Dive), 3) Social Proof & Case Studies, 4) Objection Handling, 5) Strong CTA & Urgency. Schreibe überzeugende Subject Lines und CTAs.",
    category: "marketing",
    tags: ["email", "conversion", "copywriting"],
    rating: 4.8,
    uses: 1923,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 12,
    title: "Landing Page Optimizer",
    prompt: "Analysiere diese Landing Page [URL/DESCRIPTION] und gib Optimization-Empfehlungen für: 1) Above the Fold (Headline, Hero Image, Value Prop), 2) Trust Signals (Social Proof, Testimonials), 3) CTA Strategy (Placement, Copy, Design), 4) Conversion Funnel (Friction Points). Priorisiere nach Expected Impact auf Conversion Rate.",
    category: "marketing",
    tags: ["conversion", "landing-page", "optimization"],
    rating: 4.7,
    uses: 1654,
    author: "hohl.rocks",
    featured: true
  },

  // ⚡ PRODUCTIVITY CATEGORY
  {
    id: 13,
    title: "Task Prioritization Matrix",
    prompt: "Ich habe diese Tasks: [TASK-LIST]. Erstelle eine Eisenhower Matrix (Urgent/Important) und kategorisiere jede Task. Für jede Task gib: 1) Priorität (Do First, Schedule, Delegate, Delete), 2) Estimated Time, 3) Dependencies, 4) Next Action (konkrete erste Schritte). Schlage eine Tagesplanung vor.",
    category: "productivity",
    tags: ["time-management", "planning", "organization"],
    rating: 4.8,
    uses: 1876,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 14,
    title: "Note-Taking System Designer",
    prompt: "Entwickle ein Zettelkasten-System für [THEMA/PROJEKT]. Erstelle: 1) Note Categories (Fleeting, Literature, Permanent), 2) Tagging Strategy (max. 5 Tag-Kategorien), 3) Linking Principles (wie verknüpfe ich Notes?), 4) Review Process (wie halte ich System aktuell?). Nutze Markdown-Format.",
    category: "productivity",
    tags: ["note-taking", "knowledge-management", "learning"],
    rating: 4.7,
    uses: 1234,
    author: "hohl.rocks",
    featured: true
  },
  {
    id: 15,
    title: "Focus Session Planner",
    prompt: "Plane eine Deep Work Session für [AUFGABE]. Erstelle: 1) Environment Setup (Was brauche ich? Was muss weg?), 2) Time Blocking (25/50/90 Min?), 3) Break Strategy (kurz/lang, was mache ich?), 4) Success Metrics (wie messe ich Fortschritt?), 5) Distraction Management (wenn ich abgelenkt werde?). Nutze Pomodoro oder Time Blocking.",
    category: "productivity",
    tags: ["focus", "deep-work", "time-management"],
    rating: 4.9,
    uses: 2145,
    author: "hohl.rocks",
    featured: true
  },

  // Additional Prompts for variety
  {
    id: 16,
    title: "Newsletter Hook Writer",
    prompt: "Schreibe 10 verschiedene Opening Hooks für meinen Newsletter über [THEMA]. Jeder Hook sollte einen anderen psychologischen Trigger nutzen: Curiosity Gap, FOMO, Contrarian View, Personal Story, Bold Claim, Question, Statistic, Quote, Metaphor, Current Event. Max 2 Sätze pro Hook.",
    category: "creative",
    tags: ["newsletter", "copywriting", "hooks"],
    rating: 4.6,
    uses: 876,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 17,
    title: "Competitive Analysis Framework",
    prompt: "Analysiere [COMPETITOR] und erstelle ein Competitive Intel Report: 1) Positioning & Value Prop, 2) Pricing Strategy, 3) Customer Reviews (was lieben/hassen Kunden?), 4) Marketing Channels, 5) Unique Selling Points vs. Our Advantages. Identifiziere Gaps die wir nutzen können.",
    category: "business",
    tags: ["competitive-analysis", "strategy", "research"],
    rating: 4.8,
    uses: 1432,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 18,
    title: "System Architecture Designer",
    prompt: "Entwirf eine System Architecture für [PROJEKT/FEATURE]. Beschreibe: 1) Components & Their Responsibilities, 2) Data Flow (wie kommunizieren Components?), 3) Tech Stack Decisions (warum diese Technologie?), 4) Scalability Considerations, 5) Potential Bottlenecks. Nutze C4 Model Notation.",
    category: "technical",
    tags: ["architecture", "system-design", "planning"],
    rating: 4.9,
    uses: 1678,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 19,
    title: "Social Media Calendar Builder",
    prompt: "Erstelle einen 30-Tage Content Calendar für [BRAND/THEMA] über [PLATFORM]. Für jeden Post gib: 1) Content Type (Carousel, Video, Text), 2) Topic & Angle, 3) Best Posting Time, 4) Hashtag Strategy, 5) Engagement Goal. Mix aus Educational, Promotional, und Engaging Content im 80/20 Verhältnis.",
    category: "marketing",
    tags: ["social-media", "content-planning", "calendar"],
    rating: 4.7,
    uses: 1543,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 20,
    title: "Meeting Agenda Architect",
    prompt: "Erstelle eine effektive Meeting Agenda für [MEETING-TYP] mit [TEILNEHMER]. Inkludiere: 1) Meeting Goal (was ist Success?), 2) Agenda Items (mit Zeitslots), 3) Pre-Read Materials (was sollten alle vorher lesen?), 4) Decision Points (was muss entschieden werden?), 5) Next Steps Template. Max 60 Minuten Meeting.",
    category: "productivity",
    tags: ["meetings", "agenda", "planning"],
    rating: 4.6,
    uses: 987,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 21,
    title: "Metaphor Generator",
    prompt: "Ich erkläre [KOMPLEXES-KONZEPT]. Generiere 5 verschiedene Metaphern die das Konzept vereinfachen: 1) Everyday Object Metaphor, 2) Nature Metaphor, 3) Sports/Games Metaphor, 4) Cooking Metaphor, 5) Building/Architecture Metaphor. Jede Metapher sollte einen anderen Aspekt highlighten.",
    category: "creative",
    tags: ["metaphors", "communication", "teaching"],
    rating: 4.5,
    uses: 654,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 22,
    title: "OKR Framework Builder",
    prompt: "Erstelle OKRs für [TEAM/PROJEKT] für Q[X]. Definiere: 1) Objective (inspiring, qualitativ), 2) 3-5 Key Results (measurable, quantitativ, ambitious but achievable), 3) Initiatives (wie erreichen wir die KRs?), 4) Success Metrics (wie messen wir?). Nutze SMART Framework für Key Results.",
    category: "business",
    tags: ["okr", "goals", "planning"],
    rating: 4.8,
    uses: 1765,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 23,
    title: "Git Commit Message Writer",
    prompt: "Schreibe aussagekräftige Git Commit Messages für diese Änderungen: [CHANGES]. Nutze Conventional Commits Format: type(scope): description. Types: feat, fix, docs, style, refactor, test, chore. Inkludiere: 1) Was wurde geändert?, 2) Warum?, 3) Breaking Changes? Max 50 chars für Subject, Details im Body.",
    category: "technical",
    tags: ["git", "documentation", "development"],
    rating: 4.6,
    uses: 1234,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 24,
    title: "Sales Objection Handler",
    prompt: "Ich bekomme diesen Einwand: [OBJECTION]. Erstelle eine Response-Strategie: 1) Acknowledge & Empathize (zeige Verständnis), 2) Clarify (stelle Fragen um echten Grund zu verstehen), 3) Address (gib konkrete Antwort mit Proof), 4) Reframe (drehe Objection in Vorteil), 5) Next Step (wie weiter?).",
    category: "marketing",
    tags: ["sales", "objection-handling", "communication"],
    rating: 4.7,
    uses: 1432,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 25,
    title: "Learning Path Designer",
    prompt: "Ich will [SKILL/THEMA] lernen. Erstelle einen 90-Tage Learning Path: 1) Foundations (Was sind Basics? Welche Ressourcen?), 2) Intermediate (Hands-on Projects), 3) Advanced (Deep Dives & Specializations), 4) Practice Strategy (wie übe ich täglich?), 5) Success Milestones (wie messe ich Progress?).",
    category: "productivity",
    tags: ["learning", "skill-development", "education"],
    rating: 4.8,
    uses: 1876,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 26,
    title: "Video Script Architect",
    prompt: "Schreibe ein Video-Script für [VIDEO-THEMA] (Länge: [MINUTEN]). Struktur: 1) Hook (erste 5 Sekunden - warum weiterschauen?), 2) Value Promise (was lernt Zuschauer?), 3) Main Content (3-5 Key Points), 4) Examples/Stories, 5) Strong CTA. Inkludiere Scene Descriptions und Visual Suggestions.",
    category: "creative",
    tags: ["video", "script", "content"],
    rating: 4.7,
    uses: 1345,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 27,
    title: "User Story Writer",
    prompt: "Erstelle User Stories für [FEATURE] nach Format: 'As a [ROLE], I want [ACTION], so that [BENEFIT]'. Inkludiere: 1) Acceptance Criteria (Definition of Done), 2) Technical Considerations, 3) Edge Cases, 4) Dependencies, 5) Story Points Estimate. Nutze INVEST Prinzip (Independent, Negotiable, Valuable, Estimable, Small, Testable).",
    category: "technical",
    tags: ["agile", "user-stories", "product"],
    rating: 4.8,
    uses: 1567,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 28,
    title: "PR Strategy Generator",
    prompt: "Entwickle eine PR-Strategie für [ANNOUNCEMENT/LAUNCH]. Plane: 1) Key Messages (3 Core Messages), 2) Target Media (welche Outlets/Journalisten?), 3) Press Release Structure, 4) Pitch Email Template, 5) Follow-up Strategy, 6) Crisis Preparation (was wenn negatives Feedback?). Timeline: [ZEITRAUM].",
    category: "marketing",
    tags: ["pr", "communications", "media"],
    rating: 4.6,
    uses: 876,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 29,
    title: "Decision Framework Builder",
    prompt: "Ich muss diese Entscheidung treffen: [DECISION]. Erstelle einen Decision Framework: 1) Options (alle möglichen Optionen), 2) Criteria (nach was bewerte ich? Gewichtung?), 3) Pros/Cons Matrix, 4) Risk Assessment (Was kann schiefgehen?), 5) Reversibility (kann ich Entscheidung rückgängig machen?). Nutze Weighted Scoring.",
    category: "productivity",
    tags: ["decision-making", "framework", "problem-solving"],
    rating: 4.9,
    uses: 1987,
    author: "hohl.rocks",
    featured: false
  },
  {
    id: 30,
    title: "Feedback Framework Writer",
    prompt: "Ich muss Feedback geben zu [SITUATION/PERSON]. Nutze SBI Framework (Situation-Behavior-Impact): 1) Describe Specific Situation, 2) Describe Observable Behavior (ohne Interpretation), 3) Explain Impact (auf dich, Team, Projekt), 4) Ask Questions (verstehe andere Perspektive), 5) Agree on Next Steps. Constructive & Actionable.",
    category: "business",
    tags: ["feedback", "communication", "management"],
    rating: 4.8,
    uses: 1654,
    author: "hohl.rocks",
    featured: false
  }
];

// ===================================================================
// HEALTH CHECK
// ===================================================================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "hohl.rocks backend is running",
    features: [
      "Prompt Generator",
      "Prompt Optimizer",
      "Prompt Library",
      OPENAI_AVAILABLE ? "Model Battle (enabled)" : "Model Battle (disabled - install openai)"
    ],
    timestamp: new Date().toISOString(),
  });
});

// ===================================================================
// PROMPT GENERATOR
// ===================================================================

app.post("/api/prompt-generator", async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({ error: "Topic is required" });
    }

    console.log(`\n✨ Generating prompts for: "${topic}"`);

    const systemPrompt = `Du bist ein KI-Prompt-Experte. Deine Aufgabe ist es, für ein gegebenes Thema 5 verschiedene Prompts zu generieren, die unterschiedliche Perspektiven und Anwendungsfälle abdecken.

Die 5 Prompt-Styles sind:
1. **Executive Summary**: Kurz, prägnant, fokussiert auf Key Insights
2. **Deep Dive**: Detailliert, analytisch, comprehensive
3. **Creative Angle**: Innovativ, out-of-the-box, unkonventionell
4. **Practical Guide**: Step-by-step, actionable, hands-on
5. **Expert Analysis**: Technisch, wissenschaftlich, data-driven

Für jedes Style generiere einen konkreten, direkt verwendbaren Prompt. Der Prompt sollte:
- Klar und spezifisch sein
- Den gewünschten Output-Format definieren
- Relevante Kontext-Informationen enthalten
- 2-4 Sätze lang sein

Antworte NUR mit einem JSON-Array, keine zusätzlichen Erklärungen.`;

    const userPrompt = `Thema: "${topic}"

Erstelle 5 Prompts in diesem Format:
[
  {
    "style": "Executive Summary",
    "prompt": "...",
    "useCase": "..."
  },
  ...
]`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `${systemPrompt}\n\n${userPrompt}`,
        },
      ],
    });

    const responseText = message.content[0].text;
    
    // Extract JSON from response
    let prompts;
    try {
      // Try to parse directly
      prompts = JSON.parse(responseText);
    } catch (e) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch) {
        prompts = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON array in text
        const arrayMatch = responseText.match(/\[\s*{[\s\S]+}\s*\]/);
        if (arrayMatch) {
          prompts = JSON.parse(arrayMatch[0]);
        } else {
          throw new Error("Could not parse JSON from response");
        }
      }
    }

    console.log(`✅ Generated ${prompts.length} prompts`);

    res.json({
      success: true,
      topic,
      prompts,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Error generating prompts:", error);
    res.status(500).json({
      error: "Failed to generate prompts",
      message: error.message,
    });
  }
});

// ===================================================================
// PROMPT OPTIMIZER
// ===================================================================

app.post("/api/prompt-optimizer", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    console.log(`\n⚡ Optimizing prompt: "${prompt.slice(0, 50)}..."`);

    const systemPrompt = `Du bist ein KI-Prompt-Engineering-Experte. Deine Aufgabe ist es, einen gegebenen Prompt zu analysieren und zu verbessern.

Analysiere den Prompt auf diese Kriterien:
1. **Clarity**: Ist der Prompt klar und eindeutig?
2. **Specificity**: Ist der gewünschte Output spezifisch definiert?
3. **Context**: Enthält der Prompt ausreichend Kontext?
4. **Structure**: Ist der Prompt gut strukturiert?
5. **Actionability**: Kann eine KI damit direkt arbeiten?

Bewerte den Prompt mit einem Score von 1-100 und gib konkrete Verbesserungsvorschläge.

Antworte NUR mit einem JSON-Objekt, keine zusätzlichen Erklärungen.`;

    const userPrompt = `Original Prompt: "${prompt}"

Analysiere und verbessere diesen Prompt. Format:
{
  "originalScore": 65,
  "analysis": {
    "clarity": 7,
    "specificity": 6,
    "context": 5,
    "structure": 7,
    "actionability": 6
  },
  "improvements": [
    "Improvement 1",
    "Improvement 2",
    "Improvement 3"
  ],
  "optimizedPrompt": "Der verbesserte Prompt...",
  "optimizedScore": 88
}`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `${systemPrompt}\n\n${userPrompt}`,
        },
      ],
    });

    const responseText = message.content[0].text;
    
    // Extract JSON from response
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      const jsonMatch = responseText.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        const objectMatch = responseText.match(/{[\s\S]+}/);
        if (objectMatch) {
          result = JSON.parse(objectMatch[0]);
        } else {
          throw new Error("Could not parse JSON from response");
        }
      }
    }

    console.log(`✅ Optimized (${result.originalScore} → ${result.optimizedScore})`);

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Error optimizing prompt:", error);
    res.status(500).json({
      error: "Failed to optimize prompt",
      message: error.message,
    });
  }
});

// ===================================================================
// PROMPT LIBRARY - Get All Prompts
// ===================================================================

app.get("/api/prompts", (req, res) => {
  try {
    console.log(`\n📚 Fetching all prompts (${FEATURED_PROMPTS.length} total)`);

    // Optional: Filter by category
    const { category } = req.query;
    
    let prompts = FEATURED_PROMPTS;
    
    if (category && category !== 'all') {
      prompts = FEATURED_PROMPTS.filter(p => p.category === category);
      console.log(`   Filtered by category '${category}': ${prompts.length} prompts`);
    }

    res.json({
      success: true,
      prompts,
      total: prompts.length,
      categories: ["creative", "business", "technical", "marketing", "productivity"],
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Error fetching prompts:", error);
    res.status(500).json({
      error: "Failed to fetch prompts",
      message: error.message,
    });
  }
});

// ===================================================================
// PROMPT LIBRARY - Get Single Prompt
// ===================================================================

app.get("/api/prompts/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const prompt = FEATURED_PROMPTS.find(p => p.id === id);

    if (!prompt) {
      return res.status(404).json({
        error: "Prompt not found",
        id,
      });
    }

    console.log(`\n📖 Fetching prompt #${id}: "${prompt.title}"`);

    res.json({
      success: true,
      prompt,
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
// MODEL BATTLE ARENA - Compare 3 AI Models
// ===================================================================

app.post("/api/model-battle", async (req, res) => {
  // Check if OpenAI is available
  if (!OPENAI_AVAILABLE) {
    return res.status(503).json({
      error: "Model Battle is currently unavailable",
      message: "OpenAI SDK not installed. Run: npm install openai",
      available: false
    });
  }

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
// START SERVER
// ===================================================================

app.listen(PORT, () => {
  console.log(`\n🚀 hohl.rocks backend running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🤖 Claude Model: ${MODEL}`);
  console.log(`📚 Featured Prompts: ${FEATURED_PROMPTS.length}`);
  console.log(`✨ Features: Generator + Optimizer + Library + ${OPENAI_AVAILABLE ? "Battle (enabled)" : "Battle (disabled)"}\n`);
});
