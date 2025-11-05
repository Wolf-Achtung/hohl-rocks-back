// server.js - Minimales Backend für hohl.rocks
// Deploy auf Railway: https://railway.app/

const express = require('express');
const cors = require('cors');
const app = express();

// Environment Variables
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://hohl.rocks';

// Middleware
app.use(cors({ 
  origin: [ALLOWED_ORIGIN, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true 
}));
app.use(express.json());

// Logging Middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API: Self-Check
app.get('/api/self', (req, res) => {
  res.json({
    ok: true,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    ui: {
      modalShade: 0.6,
      removeNavSound: false
    },
    life: {
      extendClick: 2000,
      maxExtends: 3
    },
    backend: 'railway',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API: Today's Spark (Daily Tip)
const sparkTips = [
  {
    title: 'KI-Prompt Basics',
    text: 'Strukturierte Prompts mit Rolle, Ziel und Format führen zu besseren Ergebnissen.'
  },
  {
    title: 'Claude Best Practice',
    text: 'Nutze Beispiele in deinen Prompts – Claude lernt schnell von konkreten Cases.'
  },
  {
    title: 'Token-Optimierung',
    text: 'Spare Kosten durch klare, präzise Prompts statt langer, verschachtelter Anweisungen.'
  },
  {
    title: 'Context Windows',
    text: 'Nutze die vollen 200k Token von Claude für umfassende Analysen und Dokumentationen.'
  },
  {
    title: 'Iteratives Prompting',
    text: 'Arbeite in Phasen: Erst Ideensammlung, dann Auswahl, dann Feinschliff.'
  },
  {
    title: 'DSGVO & KI',
    text: 'Datensparsamkeit, Pseudonymisierung und EU-Anbieter sind die drei Säulen.'
  },
  {
    title: 'RAG-Systeme',
    text: 'Retrieval-Augmented Generation ermöglicht KI mit eigenem Wissensarchiv.'
  }
];

app.get('/api/spark/today', (req, res) => {
  // Deterministischer Index basierend auf Datum
  const today = new Date();
  const dayIndex = today.getDate() % sparkTips.length;
  const tip = sparkTips[dayIndex];
  
  res.json({
    title: tip.title,
    text: tip.text,
    date: today.toISOString().split('T')[0]
  });
});

// API: News Feed
const newsItems = [
  {
    title: 'EU AI Act – Neue Regelungen ab 2024',
    url: 'https://digital-strategy.ec.europa.eu/en/policies/european-ai-act',
    summary: 'Die EU führt umfassende Regelungen für KI-Systeme ein. Unternehmen müssen Risikostufen bewerten und Transparenzpflichten erfüllen.',
    source: 'EU Commission',
    date: '2024-10-15'
  },
  {
    title: 'OpenAI stellt GPT-5 vor',
    url: 'https://openai.com/blog',
    summary: 'Neue Multimodal-Fähigkeiten und verbesserte Reasoning-Kapazitäten charakterisieren die nächste Generation.',
    source: 'OpenAI',
    date: '2024-11-01'
  },
  {
    title: 'Claude 3.5 Sonnet Update',
    url: 'https://anthropic.com/news',
    summary: 'Anthropic verbessert die Coding-Fähigkeiten und führt neue Safety-Features ein.',
    source: 'Anthropic',
    date: '2024-10-28'
  },
  {
    title: 'Google Gemini 2.0 Release',
    url: 'https://deepmind.google/technologies/gemini/',
    summary: 'Erweiterte Context-Windows und native Tool-Verwendung machen Gemini zum Konkurrenten.',
    source: 'Google DeepMind',
    date: '2024-11-03'
  }
];

app.get('/api/news', (req, res) => {
  // Query-Parameter für Filterung
  const { limit = 10, source } = req.query;
  
  let filtered = newsItems;
  if (source) {
    filtered = filtered.filter(item => 
      item.source.toLowerCase().includes(source.toLowerCase())
    );
  }
  
  res.json({
    items: filtered.slice(0, parseInt(limit)),
    total: filtered.length,
    timestamp: new Date().toISOString()
  });
});

// API: Tips
const tips = [
  {
    id: 'prompt-basics',
    title: 'AI Prompt Engineering Basics',
    category: 'Praxis',
    problem: 'Unklare Prompts liefern unzuverlässige Ergebnisse.',
    solution: 'Nutze Rollen, Ziel, Format und Qualitätskriterien. Baue Beispiele ein.',
    prompt: 'Rolle: Du bist ein präziser technischer Redakteur.\nZiel: Erkläre [Thema] verständlich für Einsteiger.\nFormat: Überschrift, 3 Bulletpoints, 1 Beispiel.\nQualität: Korrigiere Fachfehler, nenne Quellenideen.',
    tags: ['Prompting', 'Best Practice']
  },
  {
    id: 'claude-best',
    title: 'Claude 3.5 Sonnet Best Practices',
    category: 'Effizienz',
    problem: 'Sonnet liefert viel Text, aber nicht die gewünschte Struktur.',
    solution: 'Definiere strukturierte Ausgaben (JSON/Markdown) und nutze Follow-up-Refinement.',
    prompt: 'Du bist ein strukturierter KI-Analyst. Erzeuge eine Markdown-Checkliste zu [Aufgabe] mit: Ziel, Schritte, Risiken, Zeitbedarf.',
    tags: ['Claude', 'Struktur']
  },
  {
    id: 'eu-ai-act',
    title: 'EU AI Act – Was Sie wissen müssen',
    category: 'Compliance',
    problem: 'Neue Pflichten für KI-Anbieter sind unklar.',
    solution: 'Stufe eigene Systeme ein (Risiko-Level), implementiere Transparenz, dokumentiere Tests.',
    prompt: 'Fasse die Pflichten für [Use Case] nach EU AI Act zusammen (5 Punkte), inkl. Risikostufe & To-do-Liste.',
    tags: ['Regulierung', 'Legal']
  }
];

app.get('/api/tips', (req, res) => {
  res.json({
    items: tips,
    total: tips.length,
    timestamp: new Date().toISOString()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'internal_server_error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Start Server
app.listen(PORT, () => {
  console.log('🚀 hohl.rocks Backend');
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ CORS enabled for: ${ALLOWED_ORIGIN}`);
  console.log('\n📋 Available Endpoints:');
  console.log('  GET  /health');
  console.log('  GET  /api/self');
  console.log('  GET  /api/spark/today');
  console.log('  GET  /api/news?limit=10&source=OpenAI');
  console.log('  GET  /api/tips');
  console.log('\n✨ Backend ready!\n');
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
