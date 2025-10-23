// api/server/server.js - OPTIMIERT v2.0
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8080;

// Import modules
const { getCorsConfig } = require('./cors');
const { registerNewsRoutes } = require('./news');
const { getTips } = require('./tips');
const llm = require('./share.llm');
const cache = require('./cache');

// ===== MIDDLEWARE =====

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors(getCorsConfig()));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request ID
app.use((req, res, next) => { 
  req.id = crypto.randomUUID?.() || Math.random().toString(36).slice(2); 
  res.setHeader('X-Request-Id', req.id); 
  next(); 
});

// Logging
morgan.token('id', (req) => req.id);
app.use(morgan(':remote-addr - :method :url :status :res[content-length] ":referrer" ":user-agent" req_id=:id'));

// Rate limiting (per IP)
app.use('/api', rateLimit({ 
  windowMs: 60 * 1000,  // 1 minute
  limit: 60,            // 60 requests per minute
  standardHeaders: true, 
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
}));

// ===== STATIC FILES =====

// Videos
const videosPath = path.join(__dirname, '..', 'videos');
app.use('/videos', express.static(videosPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4')) {
      res.set({
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      });
    }
  }
}));

// ===== HEALTH CHECK =====

app.get('/healthz', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: cache.getStats()
  };
  res.status(200).json(health);
});

// ===== API ROUTES =====

// NEWS - Delegate to news module (properly integrated)
registerNewsRoutes(app);

// TIPS - Use tips module
app.get('/api/tips', async (req, res) => {
  try {
    const cacheKey = 'tips:all';
    
    // Check cache first
    let tips = cache.get(cacheKey);
    
    if (!tips) {
      console.log('[API] Loading tips from source...');
      tips = await getTips();
      
      // Cache for 24 hours
      cache.set(cacheKey, tips, 24 * 60 * 60 * 1000);
    } else {
      console.log('[API] Serving tips from cache');
    }
    
    res.json({ 
      items: tips,
      cached: !!cache.has(cacheKey)
    });
  } catch (error) {
    console.error('[API] Error fetching tips:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tips',
      items: [] 
    });
  }
});

// VIDEOS
app.get('/api/videos', async (req, res) => {
  try {
    const videosDir = path.join(__dirname, '..', 'videos');
    const files = await fs.readdir(videosDir);
    const videos = files
      .filter(file => file.endsWith('.mp4'))
      .map(file => ({
        id: file.replace('.mp4', ''),
        filename: file,
        url: `/videos/${file}`,
        title: file.replace('.mp4', '').replace(/-/g, ' ').replace(/_/g, ' ')
      }));
    res.json({ videos });
  } catch (error) {
    console.error('[API] Error reading videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// SUMMARIZE
app.post('/api/summarize', async (req, res) => {
  try {
    const { text, max } = req.body || {};
    const maxSentences = Math.max(1, Math.min(3, parseInt(max || '2', 10)));
    
    if (!text || typeof text !== 'string' || text.length < 10) {
      return res.status(400).json({ error: 'Missing or too short "text" field' });
    }
    
    const cacheKey = `summary:${crypto.createHash('md5').update(text).digest('hex')}:${maxSentences}`;
    
    // Check cache
    let summary = cache.get(cacheKey);
    
    if (!summary) {
      // Try LLM generation
      const prompt = `Fasse den folgenden Text prägnant in ${maxSentences} Sätzen auf Deutsch zusammen. Keine Einleitung, keine Liste – nur Gliederung in Sätzen:\n\n---\n${text}\n---`;
      
      try {
        const result = await llm.generate({ 
          prompt, 
          model: process.env.CLAUDE_MODEL || null, 
          eu: (req.query.eu === '1') 
        });
        
        if (result && result.text) {
          summary = result.text.trim();
        }
      } catch (e) {
        console.warn('[API] LLM summarization failed, using fallback:', e.message);
      }
      
      // Fallback: naive summarizer
      if (!summary) {
        const sentences = String(text).replace(/\s+/g,' ').match(/[^.!?]+[.!?]/g) || [text.slice(0,180)];
        summary = sentences.slice(0, maxSentences).join(' ').trim();
      }
      
      // Cache for 1 hour
      cache.set(cacheKey, summary, 60 * 60 * 1000);
    }
    
    res.json({ summary });
  } catch (error) {
    console.error('[API] Error in summarize endpoint:', error);
    res.status(500).json({ error: 'Summarization failed' });
  }
});

// RUN - Main AI interaction endpoint
app.post('/api/run', async (req, res) => {
  try {
    const { input, payload } = req.body;
    const eu = req.query.eu === '1';
    
    console.log('[API] /run called:', { 
      inputLength: input?.length, 
      payload: payload ? Object.keys(payload) : null, 
      eu 
    });
    
    // Extract bubble ID
    let bubbleId = null;
    const bubbleMatch = input?.match(/\[Bubble (\w+)/);
    if (bubbleMatch) {
      bubbleId = bubbleMatch[1];
    }
    
    // Build context from payload
    const userContext = payload?.context || payload?.topic || payload?.problem || '';
    
    // Generate AI prompt based on bubble type
    const aiPrompt = buildBubblePrompt(bubbleId, userContext, input);
    
    // Try to generate response
    const result = await llm.generate({ 
      prompt: aiPrompt,
      eu
    });
    
    // Fallback if no result
    if (!result || !result.text) {
      result = {
        text: generateFallbackResponse(bubbleId, userContext),
        model: 'demo',
        provider: 'fallback'
      };
    }
    
    res.json({ 
      result: result.text,
      success: true,
      bubbleId,
      model: result.model,
      provider: result.provider,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[API] Error in /run:', error);
    res.status(500).json({ 
      error: 'Processing failed',
      message: error.message 
    });
  }
});

// STREAM - Streaming endpoint
app.get('/api/run/stream', (req, res) => {
  const { q, eu } = req.query;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Extract bubble ID
  let bubbleId = null;
  const bubbleMatch = q?.match(/\[Bubble (\w+)/);
  if (bubbleMatch) {
    bubbleId = bubbleMatch[1];
  }
  
  // Send progress messages
  const messages = [
    `🔄 Initialisiere KI-Engine...`,
    `🧠 Analysiere Kontext: ${bubbleId}...`,
    `✨ Generiere kreative Lösung...`,
    `📝 Finalisiere Antwort...`
  ];
  
  let index = 0;
  const interval = setInterval(() => {
    if (index < messages.length) {
      res.write(`data: ${messages[index]}\n\n`);
      index++;
    } else {
      res.write(`data: [DONE]\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 400);
  
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// METRICS - Simple metrics endpoint
app.post('/api/metrics', (req, res) => {
  try {
    const { type, meta } = req.body;
    console.log('[Metrics]', type, meta);
    res.json({ success: true });
  } catch (error) {
    console.error('[Metrics] Error:', error);
    res.status(500).json({ error: 'Metrics failed' });
  }
});

// ===== HELPER FUNCTIONS =====

function buildBubblePrompt(bubbleId, userContext, originalInput) {
  const context = userContext || 'Allgemeine Anfrage';
  
  const prompts = {
    briefing: `Du bist ein Executive Assistant bei McKinsey. Erstelle ein prägnantes Executive Briefing zum Thema: "${context}".

STRUKTUR (maximal 7 Punkte):
1. Situation (1 Satz)
2. Kernzahlen (3 Metriken mit Quelle)
3. Hauptchance
4. Hauptrisiko
5. Option A (mit ROI)
6. Option B (mit ROI)
7. Empfehlung (klar, actionable)

Verwende aktuelle Daten. Sei präzise. Denke wie ein CEO.`,

    agenda: `Erstelle eine hocheffiziente 30-Min Meeting-Agenda für: "${context}".

Nutze diese moderne Struktur:
- 2 Min: Check-in mit Energielevel (1-10)
- 5 Min: Kontext & Ziel (SMART formuliert)
- 15 Min: Kern-Diskussion (mit 3 Leitfragen)
- 5 Min: Entscheidungen (Ja/Nein/Vertagen)
- 3 Min: Next Steps mit Verantwortlichen

Mache es interaktiv und outcome-focused. Vermeide Meeting-Klassiker-Fehler.`,

    pitch: `Schreibe einen mitreißenden 60-Sekunden Pitch für: "${context}".

Nutze die Silicon Valley Formel:
- Hook: Überraschende Zahl/Fakt (3 Sek)
- Problem: Pain Point der Zielgruppe (10 Sek)
- Lösung: Unser USP in einem Satz (15 Sek)
- Traction: Beweis/Erfolg/Kunde (20 Sek)
- Vision: Die Welt mit unserer Lösung (7 Sek)
- Ask: Klarer Call-to-Action (5 Sek)

Mache es emotional, memorable und investable!`,

    risks: `Führe eine professionelle Risikoanalyse durch für: "${context}".

Identifiziere die TOP 3 Risiken nach ISO 31000:
Für jedes Risiko:
- Beschreibung (prägnant)
- Wahrscheinlichkeit: % und Kategorie
- Impact: € Schätzung oder Beschreibung
- Risk Score (1-25)
- Mitigation: 2 konkrete Maßnahmen
- Residualrisiko nach Mitigation

Sei realistisch, quantitativ wo möglich, und priorisiere nach Kritikalität.`,

    excel: `Excel-Experte: Löse dieses Problem: "${context}".

Gib mir:
1. Die EXAKTE deutsche Excel-Formel
2. Englische Version (falls international)
3. Schritt-für-Schritt Erklärung
4. Häufige Fehlerquellen & Fixes
5. Power-User Alternative (z.B. mit LAMBDA oder LET)
6. Bonus: VBA-Makro wenn sinnvoll

Erkläre so, dass es ein Controller sofort umsetzen kann.`,

    daily: `Erstelle einen High-Performance Tagesplan für: "${context}".

Nutze Prinzipien von Cal Newport & Zeit-Management-Experten:

MORGEN (Prime Time):
- 1 Deep Work Block (90 Min): [Wichtigste Aufgabe]
- Energie-Booster: [5 Min Aktivität]

MITTAG:
- Meeting-Block oder Kommunikation
- Lunch Break (heilig!)

NACHMITTAG:
- 2-3 fokussierte Tasks (je 25 Min Pomodoro)
- Buffer für Unerwartetes (30 Min)

ABEND:
- Shutdown-Ritual: [3 Schritte]
- Win of the Day dokumentieren

Personalisiere basierend auf dem Kontext. Sei motivierend!`
  };
  
  return prompts[bubbleId] || `Beantworte kreativ und hilfreich: "${originalInput}". Kontext: ${context}. Sei konkret und actionable.`;
}

function generateFallbackResponse(bubbleId, userContext) {
  return `🚀 **KI-Demo Modus**

Diese Bubble würde normalerweise eine beeindruckende, personalisierte KI-Antwort generieren!

**Was Sie hier sehen würden:**
- Maßgeschneiderte Lösungen für "${userContext || 'Ihre Anfrage'}"
- Kreative Ansätze, die überraschen
- Konkrete, sofort umsetzbare Vorschläge
- Modernste KI-Intelligenz im Einsatz

💡 **Tipp:** Mit aktivierten API-Keys erleben Ihre Nutzer echte KI-Magie!

*Bubble: ${bubbleId} | Timestamp: ${new Date().toISOString()}*`;
}

// ===== ERROR HANDLERS =====

app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.path 
  });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    requestId: req.id
  });
});

// ===== START SERVER =====

app.listen(PORT, () => {
  const hasAnthropic = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'xxx' && process.env.ANTHROPIC_API_KEY !== '__SET_ME__';
  const hasOpenAI = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'xxx' && process.env.OPENAI_API_KEY !== '__SET_ME__';
  const hasPerplexity = process.env.PERPLEXITY_API_KEY && process.env.PERPLEXITY_API_KEY !== 'xxx' && process.env.PERPLEXITY_API_KEY !== '__SET_ME__';
  
  console.log(`
╔════════════════════════════════════════╗
║       HOHL.ROCKS Backend v2.0         ║
╠════════════════════════════════════════╣
║  🚀 Port: ${PORT}                         ║
║  🌍 Environment: ${process.env.NODE_ENV || 'development'}          ║
║  ✅ Health: /healthz                   ║
╠════════════════════════════════════════╣
║  🤖 KI-APIs Status:                    ║
║  Claude: ${hasAnthropic ? '✅ Aktiv' : '❌ Nicht konfiguriert'}              ║
║  OpenAI: ${hasOpenAI ? '✅ Aktiv' : '❌ Nicht konfiguriert'}              ║
║  Perplexity: ${hasPerplexity ? '✅ Aktiv' : '❌ Nicht konfiguriert'}          ║
╠════════════════════════════════════════╣
║  📊 Cache: ${cache.getStats().size} entries                  ║
║  🔧 Ready for action!                  ║
╚════════════════════════════════════════╝
  `);
});

module.exports = app;
