// server.js - Vollständiges Backend für hohl.rocks mit LLM-Integration
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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
const hasPerplexity = !!process.env.PERPLEXITY_API_KEY;

console.log('[SERVER] API Keys Status:');
console.log('  - OpenAI:', hasOpenAI ? '✅' : '❌');
console.log('  - Anthropic:', hasAnthropic ? '✅' : '❌');
console.log('  - OpenRouter:', hasOpenRouter ? '✅' : '❌');
console.log('  - Perplexity:', hasPerplexity ? '✅' : '❌');

// Initialize API Clients
const anthropic = hasAnthropic ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai = hasOpenAI ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ==================== FEATURE #2: MODEL BATTLE LEADERBOARD ====================
let battleLeaderboard = {
  'claude-sonnet-4': { wins: 0, totalSpeed: 0, battles: 0 },
  'gpt-4o-mini': { wins: 0, totalSpeed: 0, battles: 0 },
  'sonar-pro': { wins: 0, totalSpeed: 0, battles: 0 }
};

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
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: NODE_ENV,
    apis: {
      openai: hasOpenAI,
      anthropic: hasAnthropic,
      openrouter: hasOpenRouter,
      perplexity: hasPerplexity
    },
    endpoints: [
      'GET /health',
      'GET /api/self',
      'GET /api/spark/today',
      'GET /api/news',
      'GET /api/tips',
      'POST /api/complete',
      'POST /api/prompt-generator',
      'POST /api/prompt-optimizer',
      'POST /api/model-battle (SSE)',
      'POST /api/model-battle/vote',
      'GET /api/model-battle/leaderboard'
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
      openrouter: hasOpenRouter,
      perplexity: hasPerplexity
    }
  });
});

// ==================== API ROUTES ====================

// API: Self-Check
app.get('/api/self', (req, res) => {
  console.log('[API] /api/self called');
  res.status(200).json({
    ok: true,
    version: '3.0.0',
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
      openrouter: hasOpenRouter,
      perplexity: hasPerplexity
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
  
  const date = new Date().toISOString().split('T')[0];
  const tipIndex = new Date().getDate() % sparkTips.length;
  const baseTip = sparkTips[tipIndex];
  
  if (!hasAnthropic && !hasOpenAI) {
    return res.json({
      title: baseTip.title,
      text: baseTip.text,
      type: baseTip.type,
      date,
      fallback: true
    });
  }
  
  try {
    const prompt = `Erstelle einen prägnanten, inspirie renden KI-Tipp für heute zum Thema "${baseTip.title}".
Fokus: ${baseTip.type === 'prompt' ? 'Prompt Engineering' : baseTip.type === 'insight' ? 'KI-Insights' : baseTip.type === 'tool' ? 'KI-Tools' : 'KI-Förderung'}
Max. 2 Sätze, praktisch & actionable.`;
    
    const dynamicText = await completeText(prompt, { maxTokens: 150 });
    
    res.json({
      title: baseTip.title,
      text: dynamicText || baseTip.text,
      type: baseTip.type,
      date,
      dynamic: !!dynamicText,
      fallback: !dynamicText
    });
  } catch (error) {
    console.error('[SPARK] Error:', error);
    res.json({
      title: baseTip.title,
      text: baseTip.text,
      type: baseTip.type,
      date,
      fallback: true,
      error: error.message
    });
  }
});

// API: KI-News
app.get('/api/news', (req, res) => {
  console.log('[API] /api/news called');
  
  const newsItems = [
    {
      id: 'n1',
      title: 'EU AI Act tritt in Kraft',
      summary: 'Erste KI-Verordnung weltweit setzt neue Standards für KI-Systeme in Europa.',
      date: '2024-08-01',
      source: 'EU Commission'
    },
    {
      id: 'n2',
      title: 'Claude 4 veröffentlicht',
      summary: 'Anthropic präsentiert Claude 4 mit verbessertem Reasoning und 200k Context.',
      date: '2024-11-05',
      source: 'Anthropic'
    },
    {
      id: 'n3',
      title: 'DSGVO-konforme KI-Tools',
      summary: 'Neue Richtlinien für datenschutzkonforme KI-Implementierung in Deutschland.',
      date: '2024-10-15',
      source: 'BSI'
    }
  ];
  
  res.json(newsItems);
});

// API: KI-Tips
app.get('/api/tips', (req, res) => {
  console.log('[API] /api/tips called');
  res.json(sparkTips);
});

// API: Complete (Generic LLM Endpoint)
app.post('/api/complete', async (req, res) => {
  console.log('[API] /api/complete called');
  
  const { prompt, system, provider, euOnly, maxTokens } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'missing_prompt' });
  }
  
  const result = await completeText(prompt, { system, provider, euOnly, maxTokens });
  
  if (!result) {
    return res.status(503).json({ error: 'no_llm_available' });
  }
  
  res.json({ result });
});

// ==================== PROMPT GENERATOR API ====================

app.post('/api/prompt-generator', async (req, res) => {
  console.log('[API] /api/prompt-generator called');
  
  const { topic } = req.body;
  
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({
      error: 'missing_topic',
      message: 'Topic is required'
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
  
  if (!hasAnthropic && !hasOpenAI) {
    const fallbackStyles = [
      {
        name: 'Executive',
        prompt: `Analysiere die strategischen Business-Implikationen von ${cleanTopic} für C-Level Entscheidungsträger.`,
        description: 'Business-strategisch',
        icon: '💼'
      },
      {
        name: 'Technical',
        prompt: `Erkläre die technische Implementierung und Architektur von ${cleanTopic} mit Code-Beispielen.`,
        description: 'Entwickler-fokussiert',
        icon: '⚙️'
      },
      {
        name: 'Creative',
        prompt: `Entwickle 5 innovative, out-of-the-box Ideen wie ${cleanTopic} disruptiv eingesetzt werden kann.`,
        description: 'Innovativ & Kreativ',
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
    
    return res.json({
      topic: cleanTopic,
      styles: fallbackStyles,
      timestamp: new Date().toISOString(),
      fallback: true
    });
  }
  
  try {
    const systemPrompt = `Du bist ein Expert Prompt Engineer. Erstelle 5 verschiedene Prompt-Styles für das Thema.
Jeder Style soll einen anderen Blickwinkel bieten.

Antworte NUR mit folgendem JSON Format (ohne Markdown):
{
  "styles": [
    {
      "name": "Executive",
      "prompt": "Der komplette Prompt hier...",
      "description": "Kurze Beschreibung",
      "icon": "💼"
    }
  ]
}

Die 5 Styles sind:
1. Executive (💼) - Business/C-Level Perspektive
2. Technical (⚙️) - Entwickler/Implementation
3. Creative (🎨) - Innovative Ansätze
4. Tutorial (📚) - Anfänger-freundlich
5. Expert (🎓) - Deep-dive Analyse`;

    const result = await completeText(
      `Erstelle 5 Prompt-Styles für: ${cleanTopic}`,
      { system: systemPrompt, maxTokens: 1500 }
    );
    
    if (!result) throw new Error('LLM returned empty');
    
    let cleaned = result.trim();
    if (cleaned.includes('```json')) {
      cleaned = cleaned.split('```json')[1].split('```')[0].trim();
    }
    
    const parsed = JSON.parse(cleaned);
    
    res.json({
      topic: cleanTopic,
      styles: parsed.styles || [],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[GENERATOR] Error:', error);
    
    const fallbackStyles = [
      {
        name: 'Executive',
        prompt: `Analysiere die strategischen Business-Implikationen von ${cleanTopic} für C-Level Entscheidungsträger.`,
        description: 'Business-strategisch',
        icon: '💼'
      },
      {
        name: 'Technical',
        prompt: `Erkläre die technische Implementierung und Architektur von ${cleanTopic} mit Code-Beispielen.`,
        description: 'Entwickler-fokussiert',
        icon: '⚙️'
      },
      {
        name: 'Creative',
        prompt: `Entwickle 5 innovative, out-of-the-box Ideen wie ${cleanTopic} disruptiv eingesetzt werden kann.`,
        description: 'Innovativ & Kreativ',
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

// ==================== PROMPT OPTIMIZER API ====================

app.post('/api/prompt-optimizer', async (req, res) => {
  console.log('[API] /api/prompt-optimizer called');
  
  const { prompt } = req.body;
  
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({
      error: 'missing_prompt',
      message: 'Prompt is required and must be a string'
    });
  }
  
  const cleanPrompt = prompt.trim();
  
  if (cleanPrompt.length < 5) {
    return res.status(400).json({
      error: 'prompt_too_short',
      message: 'Prompt must be at least 5 characters'
    });
  }
  
  if (cleanPrompt.length > 1000) {
    return res.status(400).json({
      error: 'prompt_too_long',
      message: 'Prompt must be max 1000 characters'
    });
  }
  
  if (!hasAnthropic && !hasOpenAI) {
    return res.status(503).json({
      error: 'no_llm_available',
      message: 'Keine LLM-APIs konfiguriert für Prompt-Optimierung'
    });
  }
  
  try {
    const systemPrompt = `Du bist ein Expert Prompt Engineer mit jahrelanger Erfahrung.
Deine Aufgabe ist es, Prompts zu analysieren und zu verbessern.

Bewerte den gegebenen Prompt nach folgenden Kriterien:
1. Klarheit (Ist das Ziel klar?)
2. Spezifität (Ist der Prompt konkret genug?)
3. Kontext (Ist ausreichend Kontext gegeben?)
4. Struktur (Ist der Prompt gut strukturiert?)
5. Umsetzbarkeit (Ist der Prompt actionable?)

Gib eine ehrliche Bewertung von 1-10 und identifiziere konkrete Probleme.
Dann erstelle einen DEUTLICH verbesserten Prompt (Score 8-10).

Antworte NUR mit folgendem JSON Format (ohne Markdown):
{
  "original_score": 4,
  "improved_score": 9,
  "problems": [
    "Zu vage formuliert",
    "Kein Kontext gegeben",
    "Keine Qualitätskriterien"
  ],
  "improvements": [
    "Klare Rolle definiert",
    "Spezifisches Ziel formuliert",
    "Output-Format festgelegt",
    "Qualitätskriterien hinzugefügt"
  ],
  "improved_prompt": "Der komplett neu formulierte, deutlich bessere Prompt hier...",
  "explanation": "Kurze Erklärung (2-3 Sätze) warum der neue Prompt besser ist"
}

WICHTIG: 
- Der verbesserte Prompt sollte 3-5x länger sein als das Original
- Füge Struktur, Kontext, Beispiele und Qualitätskriterien hinzu
- Sei ehrlich beim Score - schlechte Prompts bekommen 2-4/10
- Verbesserte Prompts sollten 8-10/10 erreichen`;

    const userPrompt = `Analysiere und verbessere diesen Prompt:\n\n"${cleanPrompt}"`;
    
    const result = await completeText(userPrompt, {
      system: systemPrompt,
      provider: hasAnthropic ? 'anthropic' : 'openai',
      maxTokens: 2000
    });
    
    if (!result) {
      throw new Error('LLM returned empty result');
    }
    
    let cleanedResult = result.trim();
    
    if (cleanedResult.includes('```json')) {
      cleanedResult = cleanedResult.split('```json')[1].split('```')[0].trim();
    } else if (cleanedResult.includes('```')) {
      cleanedResult = cleanedResult.split('```')[1].split('```')[0].trim();
    }
    
    let analysis;
    try {
      analysis = JSON.parse(cleanedResult);
    } catch (parseError) {
      console.error('[OPTIMIZER] JSON Parse Error:', parseError);
      throw new Error('JSON parsing failed');
    }
    
    if (analysis.original_score < 1 || analysis.original_score > 10) {
      analysis.original_score = Math.max(1, Math.min(10, analysis.original_score));
    }
    if (analysis.improved_score < 1 || analysis.improved_score > 10) {
      analysis.improved_score = Math.max(1, Math.min(10, analysis.improved_score));
    }
    
    res.json({
      original_prompt: cleanPrompt,
      original_score: analysis.original_score,
      improved_score: analysis.improved_score,
      problems: analysis.problems || [],
      improvements: analysis.improvements || [],
      improved_prompt: analysis.improved_prompt || cleanPrompt,
      explanation: analysis.explanation || 'Keine Erklärung verfügbar',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[OPTIMIZER] Error:', error);
    
    const fallbackAnalysis = {
      original_prompt: cleanPrompt,
      original_score: 4,
      improved_score: 8,
      problems: [
        'Prompt zu unspezifisch',
        'Kein Kontext gegeben',
        'Keine Struktur vorhanden'
      ],
      improvements: [
        'Klare Rolle definiert',
        'Spezifisches Ziel formuliert',
        'Strukturiertes Output-Format',
        'Qualitätskriterien hinzugefügt'
      ],
      improved_prompt: `Als erfahrener AI-Assistent mit Expertise in [Themenbereich]:

Aufgabe: ${cleanPrompt}

Bitte berücksichtige:
1. Stelle ausreichend Kontext bereit
2. Erkläre Zusammenhänge verständlich
3. Gib konkrete, umsetzbare Empfehlungen
4. Nenne Quellen oder Beispiele wo möglich

Format: Strukturierte Antwort mit klaren Abschnitten

Qualität: Präzise, faktentreu und hilfreich`,
      explanation: 'Der verbesserte Prompt fügt Rolle, Struktur und Qualitätskriterien hinzu, was zu deutlich besseren Ergebnissen führt.',
      timestamp: new Date().toISOString(),
      fallback: true
    };
    
    res.json(fallbackAnalysis);
  }
});

// ==================== FEATURE #2: MODEL BATTLE ARENA ====================

/**
 * POST /api/model-battle
 * Server-Sent Events (SSE) Stream für parallele LLM-Antworten
 */
app.post('/api/model-battle', async (req, res) => {
  console.log('🥊 Model Battle started');
  
  const { prompt } = req.body;

  // Validation
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ 
      success: false, 
      error: 'Prompt ist erforderlich' 
    });
  }

  if (prompt.length > 500) {
    return res.status(400).json({ 
      success: false, 
      error: 'Prompt zu lang (max 500 Zeichen)' 
    });
  }

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Track timing
  const startTimes = {
    claude: Date.now(),
    openai: Date.now(),
    perplexity: Date.now()
  };

  const endTimes = {
    claude: null,
    openai: null,
    perplexity: null
  };

  const responses = {
    claude: '',
    openai: '',
    perplexity: ''
  };

  // ========================================
  // 1. CLAUDE STREAM
  // ========================================
  const claudeStream = async () => {
    try {
      sendEvent({ 
        type: 'status', 
        model: 'claude', 
        message: 'Claude Sonnet 4 startet...' 
      });

      if (!anthropic) {
        throw new Error('Anthropic API not configured');
      }

      const stream = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ 
          role: 'user', 
          content: prompt 
        }],
        stream: true
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && 
            chunk.delta?.type === 'text_delta') {
          
          const text = chunk.delta.text;
          responses.claude += text;
          
          sendEvent({
            type: 'chunk',
            model: 'claude',
            text: text,
            fullText: responses.claude
          });
        }
      }

      endTimes.claude = Date.now();
      const speed = ((endTimes.claude - startTimes.claude) / 1000).toFixed(2);

      sendEvent({
        type: 'complete',
        model: 'claude',
        speed: speed,
        text: responses.claude
      });

      console.log(`✅ Claude finished in ${speed}s`);

    } catch (error) {
      console.error('❌ Claude error:', error);
      sendEvent({
        type: 'error',
        model: 'claude',
        error: 'Claude hat nicht geantwortet'
      });
      responses.claude = '❌ Fehler bei Claude';
      endTimes.claude = Date.now();
    }
  };

  // ========================================
  // 2. OPENAI STREAM
  // ========================================
  const openaiStream = async () => {
    try {
      sendEvent({ 
        type: 'status', 
        model: 'openai', 
        message: 'GPT-4 startet...' 
      });

      if (!openai) {
        throw new Error('OpenAI API not configured');
      }

      const stream = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ 
          role: 'user', 
          content: prompt 
        }],
        max_tokens: 1000,
        stream: true
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          responses.openai += text;
          
          sendEvent({
            type: 'chunk',
            model: 'openai',
            text: text,
            fullText: responses.openai
          });
        }
      }

      endTimes.openai = Date.now();
      const speed = ((endTimes.openai - startTimes.openai) / 1000).toFixed(2);

      sendEvent({
        type: 'complete',
        model: 'openai',
        speed: speed,
        text: responses.openai
      });

      console.log(`✅ OpenAI finished in ${speed}s`);

    } catch (error) {
      console.error('❌ OpenAI error:', error);
      sendEvent({
        type: 'error',
        model: 'openai',
        error: 'GPT-4 hat nicht geantwortet'
      });
      responses.openai = '❌ Fehler bei GPT-4';
      endTimes.openai = Date.now();
    }
  };

  // ========================================
  // 3. PERPLEXITY STREAM
  // ========================================
  const perplexityStream = async () => {
    try {
      sendEvent({ 
        type: 'status', 
        model: 'perplexity', 
        message: 'Perplexity Sonar Pro startet...' 
      });

      if (!hasPerplexity) {
        throw new Error('Perplexity API not configured');
      }

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.PERPLEXITY_MODEL || 'sonar-pro',
          messages: [{ 
            role: 'user', 
            content: prompt 
          }],
          max_tokens: 1000,
          stream: true
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const text = json.choices[0]?.delta?.content || '';
              
              if (text) {
                responses.perplexity += text;
                
                sendEvent({
                  type: 'chunk',
                  model: 'perplexity',
                  text: text,
                  fullText: responses.perplexity
                });
              }
            } catch (e) {
              // Skip parsing errors
            }
          }
        }
      }

      endTimes.perplexity = Date.now();
      const speed = ((endTimes.perplexity - startTimes.perplexity) / 1000).toFixed(2);

      sendEvent({
        type: 'complete',
        model: 'perplexity',
        speed: speed,
        text: responses.perplexity
      });

      console.log(`✅ Perplexity finished in ${speed}s`);

    } catch (error) {
      console.error('❌ Perplexity error:', error);
      sendEvent({
        type: 'error',
        model: 'perplexity',
        error: 'Perplexity hat nicht geantwortet'
      });
      responses.perplexity = '❌ Fehler bei Perplexity';
      endTimes.perplexity = Date.now();
    }
  };

  // ========================================
  // PARALLEL EXECUTION
  // ========================================
  try {
    // Start all 3 streams parallel
    await Promise.all([
      claudeStream(),
      openaiStream(),
      perplexityStream()
    ]);

    // All done - send final summary
    sendEvent({
      type: 'battle-complete',
      speeds: {
        claude: ((endTimes.claude - startTimes.claude) / 1000).toFixed(2),
        openai: ((endTimes.openai - startTimes.openai) / 1000).toFixed(2),
        perplexity: ((endTimes.perplexity - startTimes.perplexity) / 1000).toFixed(2)
      },
      responses: {
        claude: responses.claude,
        openai: responses.openai,
        perplexity: responses.perplexity
      }
    });

    console.log('🎉 Battle complete!');
    res.end();

  } catch (error) {
    console.error('❌ Battle error:', error);
    sendEvent({
      type: 'error',
      error: 'Battle konnte nicht abgeschlossen werden'
    });
    res.end();
  }
});

/**
 * POST /api/model-battle/vote
 * User voting für Leaderboard
 */
app.post('/api/model-battle/vote', async (req, res) => {
  const { winner, speeds } = req.body;

  if (!winner || !['claude-sonnet-4', 'gpt-4o-mini', 'sonar-pro'].includes(winner)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid winner' 
    });
  }

  // Update Leaderboard
  battleLeaderboard[winner].wins += 1;

  // Update speeds
  if (speeds) {
    if (speeds.claude) {
      battleLeaderboard['claude-sonnet-4'].totalSpeed += parseFloat(speeds.claude);
      battleLeaderboard['claude-sonnet-4'].battles += 1;
    }
    if (speeds.openai) {
      battleLeaderboard['gpt-4o-mini'].totalSpeed += parseFloat(speeds.openai);
      battleLeaderboard['gpt-4o-mini'].battles += 1;
    }
    if (speeds.perplexity) {
      battleLeaderboard['sonar-pro'].totalSpeed += parseFloat(speeds.perplexity);
      battleLeaderboard['sonar-pro'].battles += 1;
    }
  }

  res.json({ 
    success: true, 
    leaderboard: battleLeaderboard 
  });
});

/**
 * GET /api/model-battle/leaderboard
 * Aktuelles Leaderboard abrufen
 */
app.get('/api/model-battle/leaderboard', (req, res) => {
  // Calculate averages
  const leaderboard = Object.entries(battleLeaderboard).map(([model, stats]) => ({
    model,
    wins: stats.wins,
    avgSpeed: stats.battles > 0 
      ? (stats.totalSpeed / stats.battles).toFixed(2) 
      : 0,
    battles: stats.battles
  }));

  // Sort by wins
  leaderboard.sort((a, b) => b.wins - a.wins);

  res.json({ 
    success: true, 
    leaderboard 
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
      'GET /api/tips',
      'POST /api/complete',
      'POST /api/prompt-generator',
      'POST /api/prompt-optimizer',
      'POST /api/model-battle',
      'POST /api/model-battle/vote',
      'GET /api/model-battle/leaderboard'
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
  console.log('\n🚀 hohl.rocks Backend v3.0.0');
  console.log(`📡 Listening on 0.0.0.0:${PORT}`);
  console.log(`🌐 Environment: ${NODE_ENV}`);
  console.log(`✅ CORS enabled for: ${ALLOWED_ORIGINS.join(', ')}`);
  console.log('\n🤖 LLM Status:');
  console.log(`  - OpenAI: ${hasOpenAI ? '✅ Ready' : '❌ Not configured'}`);
  console.log(`  - Anthropic: ${hasAnthropic ? '✅ Ready' : '❌ Not configured'}`);
  console.log(`  - OpenRouter: ${hasOpenRouter ? '✅ Ready' : '❌ Not configured'}`);
  console.log(`  - Perplexity: ${hasPerplexity ? '✅ Ready' : '❌ Not configured'}`);
  console.log('\n📋 Available Endpoints:');
  console.log('  GET  /');
  console.log('  GET  /health');
  console.log('  GET  /api/self');
  console.log('  GET  /api/spark/today (🤖 Dynamic with LLM)');
  console.log('  GET  /api/news?limit=10&source=OpenAI');
  console.log('  GET  /api/tips');
  console.log('  POST /api/complete (🤖 LLM Completion)');
  console.log('  POST /api/prompt-generator (✨ Feature #1)');
  console.log('  POST /api/prompt-optimizer (⚡ Feature #3)');
  console.log('  POST /api/model-battle (🥊 Feature #2: SSE Stream)');
  console.log('  POST /api/model-battle/vote (👍 Vote System)');
  console.log('  GET  /api/model-battle/leaderboard (🏆 Leaderboard)');
  console.log('\n✨ Backend ready! 3/5 Features active!\n');
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
