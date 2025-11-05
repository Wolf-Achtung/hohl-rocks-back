// server.js - Vollständiges Backend für hohl.rocks mit LLM-Integration
import express from 'express';
import cors from 'cors';

const app = express();

// Environment Variables
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

const ALLOWED_ORIGINS = [
  'https://hohl.rocks',
  'https://www.hohl.rocks',
  'https://unbedingt-noch-lesbar.netlify.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

console.log('[SERVER] Starting hohl.rocks Backend...');
console.log('[SERVER] PORT:', PORT);
console.log('[SERVER] NODE_ENV:', NODE_ENV);
console.log('[SERVER] ALLOWED_ORIGINS:', ALLOWED_ORIGINS);

// API Keys Check
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

console.log('[SERVER] API Keys Status:');
console.log('  - OpenAI:', hasOpenAI ? '✅' : '❌');
console.log('  - Anthropic:', hasAnthropic ? '✅' : '❌');
console.log('  - OpenRouter:', hasOpenRouter ? '✅' : '❌');

// Middleware
app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin) {
      console.log('[CORS] No origin - allowing');
      return callback(null, true);
    }
    console.log('[CORS] Request from origin:', origin);
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

// ==================== LLM INTEGRATION ====================

/**
 * Wählt den verfügbaren LLM Provider aus
 */
function pickProvider({ provider, euOnly } = {}) {
  if (provider) return provider;
  
  if (euOnly) {
    if (hasOpenRouter) return 'openrouter';
    return hasAnthropic ? 'anthropic' : (hasOpenAI ? 'openai' : 'none');
  }
  
  return hasAnthropic ? 'anthropic' : (hasOpenAI ? 'openai' : (hasOpenRouter ? 'openrouter' : 'none'));
}

/**
 * LLM Completion - Generiert Text mit verfügbaren APIs
 */
async function completeText(prompt, { system, provider, euOnly, maxTokens = 1000 } = {}) {
  const picked = pickProvider({ provider, euOnly });
  
  try {
    // OpenAI Integration
    if (picked === 'openai' && hasOpenAI) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            system ? { role: 'system', content: system } : null,
            { role: 'user', content: prompt }
          ].filter(Boolean),
          temperature: 0.7
        })
      });
      
      const data = await response.json();
      return data?.choices?.[0]?.message?.content?.trim() || 'Keine Antwort.';
    }
    
    // Anthropic Integration
    if (picked === 'anthropic' && hasAnthropic) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
          system,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      const data = await response.json();
      const content = Array.isArray(data?.content) 
        ? data.content.map(x => x.text || '').join('\n').trim() 
        : (data?.content || '');
      return content || 'Keine Antwort.';
    }
    
    // OpenRouter Integration
    if (picked === 'openrouter' && hasOpenRouter) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'mistralai/mistral-small',
          messages: [
            system ? { role: 'system', content: system } : null,
            { role: 'user', content: prompt }
          ].filter(Boolean),
          temperature: 0.7
        })
      });
      
      const data = await response.json();
      return data?.choices?.[0]?.message?.content?.trim() || 'Keine Antwort.';
    }
  } catch (error) {
    console.error('[LLM] Error:', error.message);
    return null;
  }
  
  return null;
}

// ==================== ROOT HEALTH CHECK ====================

app.get('/', (req, res) => {
  console.log('[ROOT] / called');
  res.json({ 
    status: 'ok',
    message: 'hohl.rocks Backend API',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: NODE_ENV,
    apis: {
      openai: hasOpenAI,
      anthropic: hasAnthropic,
      openrouter: hasOpenRouter
    },
    endpoints: [
      'GET /health',
      'GET /api/self',
      'GET /api/spark/today',
      'GET /api/news',
      'GET /api/tips',
      'POST /api/complete',
      'POST /api/prompt-generator'
    ]
  });
});

app.get('/health', (req, res) => {
  console.log('[HEALTH] /health called');
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    port: PORT,
    apis: {
      openai: hasOpenAI,
      anthropic: hasAnthropic,
      openrouter: hasOpenRouter
    }
  });
});

// ==================== API ROUTES ====================

// API: Self-Check
app.get('/api/self', (req, res) => {
  console.log('[API] /api/self called');
  res.status(200).json({
    ok: true,
    version: '2.1.0',
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
    environment: NODE_ENV,
    port: PORT,
    apis: {
      openai: hasOpenAI,
      anthropic: hasAnthropic,
      openrouter: hasOpenRouter
    }
  });
});

// API: Today's Spark (Dynamic with LLM or Static Fallback)
const sparkTips = [
  {
    title: 'KI-Prompt Basics',
    text: 'Strukturierte Prompts mit Rolle, Ziel und Format führen zu besseren Ergebnissen.',
    type: 'prompt'
  },
  {
    title: 'Claude Best Practice',
    text: 'Nutze Beispiele in deinen Prompts – Claude lernt schnell von konkreten Cases.',
    type: 'insight'
  },
  {
    title: 'Token-Optimierung',
    text: 'Spare Kosten durch klare, präzise Prompts statt langer, verschachtelter Anweisungen.',
    type: 'tool'
  },
  {
    title: 'Context Windows',
    text: 'Nutze die vollen 200k Token von Claude für umfassende Analysen und Dokumentationen.',
    type: 'insight'
  },
  {
    title: 'Iteratives Prompting',
    text: 'Arbeite in Phasen: Erst Ideensammlung, dann Auswahl, dann Feinschliff.',
    type: 'prompt'
  },
  {
    title: 'DSGVO & KI',
    text: 'Datensparsamkeit, Pseudonymisierung und EU-Anbieter sind die drei Säulen.',
    type: 'funding'
  },
  {
    title: 'RAG-Systeme',
    text: 'Retrieval-Augmented Generation ermöglicht KI mit eigenem Wissensarchiv.',
    type: 'tool'
  }
];

app.get('/api/spark/today', async (req, res) => {
  console.log('[API] /api/spark/today called');
  
  const today = new Date();
  const dayIndex = today.getDate() % sparkTips.length;
  const staticTip = sparkTips[dayIndex];
  
  // Versuche dynamischen Content zu generieren
  if (hasAnthropic || hasOpenAI) {
    try {
      const prompt = `Generiere einen kurzen, prägnanten KI-Tipp für deutsche Unternehmer.
Themenbereich: ${staticTip.type}
Format: Titel (max 6 Wörter) + Text (max 120 Zeichen)
Stil: Praktisch, konkret, umsetzbar
Sprache: Deutsch`;
      
      const generated = await completeText(prompt, {
        system: 'Du bist ein KI-Experte der präzise, umsetzbare Tipps gibt.',
        provider: hasAnthropic ? 'anthropic' : 'openai'
      });
      
      if (generated && generated.length > 20) {
        // Parse generated content
        const lines = generated.split('\n').filter(l => l.trim());
        const title = lines[0]?.replace(/^(Titel:|Title:)/i, '').trim() || staticTip.title;
        const text = lines[1]?.replace(/^(Text:|Tipp:)/i, '').trim() || staticTip.text;
        
        return res.json({
          title,
          text,
          date: today.toISOString().split('T')[0],
          source: 'dynamic',
          type: staticTip.type
        });
      }
    } catch (error) {
      console.error('[SPARK] Dynamic generation failed:', error.message);
    }
  }
  
  // Fallback auf statischen Content
  res.json({
    title: staticTip.title,
    text: staticTip.text,
    date: today.toISOString().split('T')[0],
    source: 'static',
    type: staticTip.type
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
  console.log('[API] /api/news called');
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
  console.log('[API] /api/tips called');
  res.json({
    items: tips,
    total: tips.length,
    timestamp: new Date().toISOString()
  });
});

// API: LLM Completion Endpoint
app.post('/api/complete', async (req, res) => {
  console.log('[API] /api/complete called');
  
  const { prompt, system, provider, euOnly } = req.body;
  
  if (!prompt) {
    return res.status(400).json({
      error: 'missing_prompt',
      message: 'Prompt is required'
    });
  }
  
  // Check if any LLM is available
  if (!hasOpenAI && !hasAnthropic && !hasOpenRouter) {
    return res.status(503).json({
      error: 'no_llm_available',
      message: 'Keine LLM-APIs konfiguriert. Bitte API-Keys setzen.'
    });
  }
  
  try {
    const result = await completeText(prompt, { system, provider, euOnly });
    
    if (!result) {
      return res.status(500).json({
        error: 'completion_failed',
        message: 'LLM konnte keine Antwort generieren.'
      });
    }
    
    res.json({
      result,
      timestamp: new Date().toISOString(),
      provider: pickProvider({ provider, euOnly })
    });
  } catch (error) {
    console.error('[COMPLETE] Error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error.message
    });
  }
});

// ==================== PROMPT GENERATOR API ====================

/**
 * Live Prompt Generator - Generates 5 different prompt styles
 */
app.post('/api/prompt-generator', async (req, res) => {
  console.log('[API] /api/prompt-generator called');
  
  const { topic } = req.body;
  
  // Validation
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({
      error: 'missing_topic',
      message: 'Topic is required and must be a string'
    });
  }
  
  const cleanTopic = topic.trim();
  
  if (cleanTopic.length < 3) {
    return res.status(400).json({
      error: 'topic_too_short',
      message: 'Topic must be at least 3 characters'
    });
  }
  
  if (cleanTopic.length > 200) {
    return res.status(400).json({
      error: 'topic_too_long',
      message: 'Topic must be max 200 characters'
    });
  }
  
  // Check if LLM is available
  if (!hasAnthropic && !hasOpenAI) {
    return res.status(503).json({
      error: 'no_llm_available',
      message: 'Keine LLM-APIs konfiguriert für Prompt-Generierung'
    });
  }
  
  try {
    const systemPrompt = `Du bist ein Expert Prompt Engineer. 
Deine Aufgabe ist es, für ein gegebenes Thema 5 verschiedene Prompt-Styles zu generieren.

Die 5 Styles sind:
1. EXECUTIVE: Business-fokussiert, strategisch, ROI-orientiert
2. TECHNICAL: Entwickler-friendly, präzise, implementation-ready
3. CREATIVE: Out-of-the-box, innovative Perspektiven, unkonventionell
4. TUTORIAL: Step-by-step, pädagogisch, für Anfänger geeignet
5. EXPERT: Deep-dive, fortgeschritten, nuanciert

Jeder Prompt sollte:
- 2-4 Sätze lang sein
- Konkret und actionable
- Den spezifischen Style widerspiegeln
- Sofort verwendbar sein

Antworte NUR mit einem JSON Array, ohne zusätzlichen Text:
[
  {
    "name": "Executive",
    "prompt": "...",
    "description": "Business-strategische Perspektive"
  },
  {
    "name": "Technical",
    "prompt": "...",
    "description": "Entwickler-fokussierte Analyse"
  },
  {
    "name": "Creative",
    "prompt": "...",
    "description": "Innovative Perspektiven"
  },
  {
    "name": "Tutorial",
    "prompt": "...",
    "description": "Pädagogischer Ansatz"
  },
  {
    "name": "Expert",
    "prompt": "...",
    "description": "Deep-dive Analyse"
  }
]`;

    const userPrompt = `Generiere 5 Prompt-Styles für das Thema: "${cleanTopic}"`;
    
    const result = await completeText(userPrompt, {
      system: systemPrompt,
      provider: hasAnthropic ? 'anthropic' : 'openai',
      maxTokens: 2000
    });
    
    if (!result) {
      throw new Error('LLM returned empty result');
    }
    
    // Parse JSON from result
    let cleanedResult = result.trim();
    
    // Remove markdown code blocks if present
    if (cleanedResult.includes('```json')) {
      cleanedResult = cleanedResult.split('```json')[1].split('```')[0].trim();
    } else if (cleanedResult.includes('```')) {
      cleanedResult = cleanedResult.split('```')[1].split('```')[0].trim();
    }
    
    let styles;
    try {
      styles = JSON.parse(cleanedResult);
    } catch (parseError) {
      console.error('[PROMPT-GEN] JSON Parse Error:', parseError);
      // Fallback to static prompts
      throw new Error('JSON parsing failed');
    }
    
    // Add icons to styles
    const iconMapping = {
      'Executive': '💼',
      'Technical': '⚙️',
      'Creative': '🎨',
      'Tutorial': '📚',
      'Expert': '🎓'
    };
    
    const enrichedStyles = styles.map(style => ({
      ...style,
      icon: iconMapping[style.name] || '✨'
    }));
    
    res.json({
      topic: cleanTopic,
      styles: enrichedStyles,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[PROMPT-GEN] Error:', error);
    
    // Fallback: Static prompts
    const fallbackStyles = [
      {
        name: 'Executive',
        prompt: `Analysiere ${cleanTopic} aus geschäftsstrategischer Sicht. Welche ROI-Potenziale, Marktchancen und Wettbewerbsvorteile ergeben sich?`,
        description: 'Business-strategische Perspektive',
        icon: '💼'
      },
      {
        name: 'Technical',
        prompt: `Erkläre die technische Implementation von ${cleanTopic}. Welche Technologien, APIs und Best Practices sind relevant?`,
        description: 'Entwickler-fokussierte Analyse',
        icon: '⚙️'
      },
      {
        name: 'Creative',
        prompt: `Betrachte ${cleanTopic} aus unkonventionellen Blickwinkeln. Welche überraschenden Anwendungen oder Kombinationen sind möglich?`,
        description: 'Innovative Perspektiven',
        icon: '🎨'
      },
      {
        name: 'Tutorial',
        prompt: `Erstelle eine Schritt-für-Schritt Anleitung zu ${cleanTopic}. Wie kann ein Anfänger damit starten?`,
        description: 'Pädagogischer Ansatz',
        icon: '📚'
      },
      {
        name: 'Expert',
        prompt: `Analysiere ${cleanTopic} auf Expertenniveau. Welche subtilen Nuancen, fortgeschrittenen Patterns und Edge Cases gibt es?`,
        description: 'Deep-dive Analyse',
        icon: '🎓'
      }
    ];
    
    res.json({
      topic: cleanTopic,
      styles: fallbackStyles,
      timestamp: new Date().toISOString(),
      fallback: true
    });
  }
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
      'GET /api/tips',
      'POST /api/complete',
      'POST /api/prompt-generator'
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
  console.log(`🌐 Environment: ${NODE_ENV}`);
  console.log(`✅ CORS enabled for: ${ALLOWED_ORIGINS.join(', ')}`);
  console.log('\n🤖 LLM Status:');
  console.log(`  - OpenAI: ${hasOpenAI ? '✅ Ready' : '❌ Not configured'}`);
  console.log(`  - Anthropic: ${hasAnthropic ? '✅ Ready' : '❌ Not configured'}`);
  console.log(`  - OpenRouter: ${hasOpenRouter ? '✅ Ready' : '❌ Not configured'}`);
  console.log('\n📋 Available Endpoints:');
  console.log('  GET  /');
  console.log('  GET  /health');
  console.log('  GET  /api/self');
  console.log('  GET  /api/spark/today (🤖 Dynamic with LLM)');
  console.log('  GET  /api/news?limit=10&source=OpenAI');
  console.log('  GET  /api/tips');
  console.log('  POST /api/complete (🤖 LLM Completion)');
  console.log('  POST /api/prompt-generator (✨ NEW: 5 Prompt Styles)');
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
