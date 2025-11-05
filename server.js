// server.js - Backend für hohl.rocks (ES Module)
// WICHTIG: Diese Datei muss im ROOT des Repos liegen!
import express from 'express';
import cors from 'cors';

const app = express();

// Environment Variables
const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGINS = [
  'https://hohl.rocks',
  'https://www.hohl.rocks',
  'https://unbedingt-noch-lesbar.netlify.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

console.log('[SERVER] Starting hohl.rocks Backend...');
console.log('[SERVER] PORT:', PORT);
console.log('[SERVER] ALLOWED_ORIGINS:', ALLOWED_ORIGINS);

// Middleware
app.use(cors({ 
  origin: (origin, callback) => {
    console.log('[CORS] Request from origin:', origin);
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      console.log('[CORS] No origin - allowing');
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      console.log('[CORS] Origin allowed:', origin);
      callback(null, true);
    } else {
      console.log('[CORS] Origin BLOCKED:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true 
}));

app.use(express.json());

// Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ==================== ROOT HEALTH CHECK ====================
app.get('/', (req, res) => {
  console.log('[ROOT] / called');
  res.json({ 
    status: 'ok',
    message: 'hohl.rocks Backend API',
    version: '1.0.1',
    timestamp: new Date().toISOString(),
    port: PORT,
    endpoints: [
      'GET /health',
      'GET /api/self',
      'GET /api/spark/today',
      'GET /api/news',
      'GET /api/tips'
    ]
  });
});

app.get('/health', (req, res) => {
  console.log('[HEALTH] /health called');
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    port: PORT
  });
});

// ==================== API ROUTES ====================

// API: Self-Check
app.get('/api/self', (req, res) => {
  console.log('[API] /api/self called - sending response');
  res.status(200).json({
    ok: true,
    version: '1.0.1',
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
    environment: process.env.NODE_ENV || 'development',
    port: PORT
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
  console.log('[API] /api/spark/today called - sending response');
  const today = new Date();
  const dayIndex = today.getDate() % sparkTips.length;
  const tip = sparkTips[dayIndex];
  
  res.status(200).json({
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
  console.log('[API] /api/news called - sending response');
  const { limit = 10, source } = req.query;
  
  let filtered = newsItems;
  if (source) {
    filtered = filtered.filter(item => 
      item.source.toLowerCase().includes(source.toLowerCase())
    );
  }
  
  res.status(200).json({
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
  console.log('[API] /api/tips called - sending response');
  res.status(200).json({
    items: tips,
    total: tips.length,
    timestamp: new Date().toISOString()
  });
});

// ==================== ERROR HANDLERS ====================

// 404 Handler
app.use((req, res) => {
  console.log('[404] Route not found:', req.method, req.path);
  res.status(404).json({
    error: 'not_found',
    message: `Route ${req.method} ${req.path} not found`,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /api/self',
      'GET /api/spark/today',
      'GET /api/news',
      'GET /api/tips'
    ],
    timestamp: new Date().toISOString()
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'internal_server_error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// ==================== START SERVER ====================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 hohl.rocks Backend');
  console.log(`📡 Listening on 0.0.0.0:${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ CORS enabled for: ${ALLOWED_ORIGINS.join(', ')}`);
  console.log('\n📋 Available Endpoints:');
  console.log('  GET  /');
  console.log('  GET  /health');
  console.log('  GET  /api/self');
  console.log('  GET  /api/spark/today');
  console.log('  GET  /api/news?limit=10&source=OpenAI');
  console.log('  GET  /api/tips');
  console.log('\n✨ Backend ready!\n');
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});
