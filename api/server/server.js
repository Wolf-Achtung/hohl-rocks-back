const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowlist = (process.env.CORS_ALLOWLIST || 'http://localhost:3000,http://localhost:8080')
      .split(',')
      .map(url => url.trim());
    
    if (!origin || allowlist.includes(origin) || 
        allowlist.some(allowed => allowed.includes('*') && origin.includes(allowed.replace('*', '')))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
};

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined'));

// Static files
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

// Health check
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// KI-API Helper Functions
async function callClaude(prompt, model = null) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'xxx') return null;
  
  const data = JSON.stringify({
    model: model || process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(res.statusCode === 200 ? parsed.content[0].text : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

async function callOpenAI(prompt, model = null) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'xxx') return null;
  
  const data = JSON.stringify({
    model: model || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1500,
    temperature: 0.8
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(res.statusCode === 200 ? parsed.choices[0].message.content : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

async function callPerplexity(prompt) {
  if (!process.env.PERPLEXITY_API_KEY || process.env.PERPLEXITY_API_KEY === 'xxx') return null;
  
  const data = JSON.stringify({
    model: process.env.PERPLEXITY_MODEL || 'sonar-pro',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1500,
    temperature: 0.7
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.perplexity.ai',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
      }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(res.statusCode === 200 ? parsed.choices[0].message.content : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

// HAUPTENDPOINT für Bubble-KI-Interaktionen
app.post('/api/run', async (req, res) => {
  try {
    const { input, payload } = req.body;
    const eu = req.query.eu === '1';
    
    console.log('[API] /run called:', { input, payload, eu });
    
    let bubbleId = null;
    const bubbleMatch = input?.match(/\[Bubble (\w+)/);
    if (bubbleMatch) {
      bubbleId = bubbleMatch[1];
    }
    
    // Dynamische, kontextabhängige Prompts
    const userContext = payload?.context || payload?.topic || payload?.problem || '';
    let aiPrompt = '';
    
    switch(bubbleId) {
      case 'briefing':
        aiPrompt = `Du bist ein Executive Assistant bei McKinsey. Erstelle ein prägnantes Executive Briefing zum Thema: "${userContext || 'KI-Transformation im deutschen Mittelstand 2025'}".

STRUKTUR (maximal 7 Punkte):
1. Situation (1 Satz)
2. Kernzahlen (3 Metriken mit Quelle)
3. Hauptchance
4. Hauptrisiko
5. Option A (mit ROI)
6. Option B (mit ROI)
7. Empfehlung (klar, actionable)

Verwende aktuelle Daten. Sei präzise. Denke wie ein CEO.`;
        break;
        
      case 'agenda':
        aiPrompt = `Erstelle eine hocheffiziente 30-Min Meeting-Agenda für: "${userContext || 'KI-Tool Evaluation für unser Team'}".

Nutze diese moderne Struktur:
- 2 Min: Check-in mit Energielevel (1-10)
- 5 Min: Kontext & Ziel (SMART formuliert)
- 15 Min: Kern-Diskussion (mit 3 Leitfragen)
- 5 Min: Entscheidungen (Ja/Nein/Vertagen)
- 3 Min: Next Steps mit Verantwortlichen

Mache es interaktiv und outcome-focused. Vermeide Meeting-Klassiker-Fehler.`;
        break;
        
      case 'pitch':
        aiPrompt = `Schreibe einen mitreißenden 60-Sekunden Pitch für: "${userContext || 'Unsere revolutionäre KI-Lösung für HR-Prozesse'}".

Nutze die Silicon Valley Formel:
- Hook: Überraschende Zahl/Fakt (3 Sek)
- Problem: Pain Point der Zielgruppe (10 Sek)
- Lösung: Unser USP in einem Satz (15 Sek)
- Traction: Beweis/Erfolg/Kunde (20 Sek)
- Vision: Die Welt mit unserer Lösung (7 Sek)
- Ask: Klarer Call-to-Action (5 Sek)

Mache es emotional, memorable und investable!`;
        break;
        
      case 'risks':
        aiPrompt = `Führe eine professionelle Risikoanalyse durch für: "${userContext || 'Einführung von ChatGPT im Kundenservice'}".

Identifiziere die TOP 3 Risiken nach ISO 31000:
Für jedes Risiko:
- Beschreibung (prägnant)
- Wahrscheinlichkeit: % und Kategorie
- Impact: € Schätzung oder Beschreibung
- Risk Score (1-25)
- Mitigation: 2 konkrete Maßnahmen
- Residualrisiko nach Mitigation

Sei realistisch, quantitativ wo möglich, und priorisiere nach Kritikalität.`;
        break;
        
      case 'excel':
        aiPrompt = `Excel-Experte: Löse dieses Problem: "${userContext || 'Ich brauche eine dynamische Dashboard-Formel für Umsatzanalyse nach Region und Produkt'}".

Gib mir:
1. Die EXAKTE deutsche Excel-Formel
2. Englische Version (falls international)
3. Schritt-für-Schritt Erklärung
4. Häufige Fehlerquellen & Fixes
5. Power-User Alternative (z.B. mit LAMBDA oder LET)
6. Bonus: VBA-Makro wenn sinnvoll

Erkläre so, dass es ein Controller sofort umsetzen kann.`;
        break;
        
      case 'daily':
        aiPrompt = `Erstelle einen High-Performance Tagesplan für: "${userContext || 'Product Manager mit 2 kritischen Launches diese Woche'}".

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

Personalisiere basierend auf dem Kontext. Sei motivierend!`;
        break;
        
      default:
        aiPrompt = `Beantworte kreativ und hilfreich: "${input}". Überrasche mit unerwarteten Einsichten. Sei konkret und actionable.`;
    }
    
    // Versuche verschiedene KI-APIs (Fallback-Chain)
    let result = null;
    let usedModel = 'none';
    
    // 1. Versuch: Claude (beste Qualität)
    result = await callClaude(aiPrompt);
    if (result) {
      usedModel = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet';
    }
    
    // 2. Versuch: OpenAI
    if (!result) {
      result = await callOpenAI(aiPrompt);
      if (result) usedModel = 'gpt-4o-mini';
    }
    
    // 3. Versuch: Perplexity (mit Internetsuche)
    if (!result && bubbleId && ['news', 'research'].includes(bubbleId)) {
      result = await callPerplexity(aiPrompt);
      if (result) usedModel = process.env.PERPLEXITY_MODEL || 'sonar-pro';
    }
    
    // Fallback: Inspirierende Demo-Nachricht
    if (!result) {
      result = `🚀 **KI-Demo Modus**

Diese Bubble würde normalerweise eine beeindruckende, personalisierte KI-Antwort generieren!

**Was Sie hier sehen würden:**
- Maßgeschneiderte Lösungen für "${userContext || 'Ihre Anfrage'}"
- Kreative Ansätze, die überraschen
- Konkrete, sofort umsetzbare Vorschläge
- Modernste KI-Intelligenz im Einsatz

💡 **Tipp:** Mit aktivierten API-Keys erleben Ihre Nutzer echte KI-Magie!

*Bubble: ${bubbleId} | Timestamp: ${new Date().toISOString()}*`;
      usedModel = 'demo';
    }
    
    res.json({ 
      result,
      success: true,
      bubbleId,
      model: usedModel,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ 
      error: 'Processing failed',
      message: error.message 
    });
  }
});

// Streaming endpoint
app.get('/api/run/stream', (req, res) => {
  const { q, eu } = req.query;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  let bubbleId = null;
  const bubbleMatch = q?.match(/\[Bubble (\w+)/);
  if (bubbleMatch) {
    bubbleId = bubbleMatch[1];
  }
  
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

// News endpoint
app.get('/api/news', async (req, res) => {
  try {
    const newsModule = require('./news');
    const news = await newsModule.getNews?.() || [];
    res.json({ items: news }); // Changed from { news } to { items }
  } catch (error) {
    console.error('Error fetching news:', error);
    res.json({ items: [] });
  }
});

// Tips endpoint
app.get('/api/tips', async (req, res) => {
  try {
    const tipsModule = require('./tips');
    const tips = await tipsModule.getTips?.() || [];
    res.json({ items: tips }); // Changed from { tips } to { items }
  } catch (error) {
    console.error('Error fetching tips:', error);
    res.json({ items: [] });
  }
});

// Other endpoints remain the same...
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
    console.error('Error reading videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// Error handlers
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  const hasAnthropic = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'xxx';
  const hasOpenAI = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'xxx';
  const hasPerplexity = process.env.PERPLEXITY_API_KEY && process.env.PERPLEXITY_API_KEY !== 'xxx';
  
  console.log(`
╔════════════════════════════════════════╗
║       HOHL.ROCKS Backend Server       ║
╠════════════════════════════════════════╣
║  🚀 Port: ${PORT}                         ║
║  🌍 Environment: ${process.env.NODE_ENV || 'development'}          ║
║  ✅ Health: /healthz                   ║
╠════════════════════════════════════════╣
║  🤖 KI-APIs Status:                    ║
║  Claude: ${hasAnthropic ? '✅ Aktiv' : '❌ Nicht konfiguriert'}              ║
║  OpenAI: ${hasOpenAI ? '✅ Aktiv' : '❌ Nicht konfiguriert'}              ║
║  Perplexity: ${hasPerplexity ? '✅ Aktiv' : '❌ Nicht konfiguriert'}          ║
╚════════════════════════════════════════╝
  `);
});