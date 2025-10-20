const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs').promises;

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
    
    // Allow requests with no origin (like mobile apps or Postman)
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

// Static files - serve videos directory
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

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes

// Get all videos
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

// Get specific video metadata
app.get('/api/videos/:id', async (req, res) => {
  try {
    const videoPath = path.join(__dirname, '..', 'videos', `${req.params.id}.mp4`);
    const stats = await fs.stat(videoPath);
    
    res.json({
      id: req.params.id,
      filename: `${req.params.id}.mp4`,
      url: `/videos/${req.params.id}.mp4`,
      size: stats.size,
      created: stats.birthtime
    });
  } catch (error) {
    console.error('Error getting video:', error);
    res.status(404).json({ error: 'Video not found' });
  }
});

// News endpoint (placeholder for now)
app.get('/api/news', async (req, res) => {
  try {
    // This would connect to your news service
    const newsModule = require('./news');
    const news = await newsModule.getNews?.() || [];
    res.json({ news });
  } catch (error) {
    console.error('Error fetching news:', error);
    res.json({ news: [] }); // Return empty array on error
  }
});

// Tips endpoint
app.get('/api/tips', async (req, res) => {
  try {
    const tipsModule = require('./tips');
    const tips = await tipsModule.getTips?.() || [];
    res.json({ tips });
  } catch (error) {
    console.error('Error fetching tips:', error);
    res.json({ tips: [] });
  }
});

// Prompts endpoint
app.get('/api/prompts', (req, res) => {
  try {
    const promptsModule = require('./prompts');
    const prompts = promptsModule.PROMPTS || [];
    res.json({ prompts });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.json({ prompts: [] });
  }
});

// Run endpoint for Bubble interactions - WICHTIGER NEUER ENDPOINT!
app.post('/api/run', async (req, res) => {
  try {
    const { input, payload } = req.body;
    const eu = req.query.eu === '1';
    
    console.log('[API] /run called with:', { input, payload, eu });
    
    // Parse bubble ID from input
    let bubbleId = null;
    const bubbleMatch = input?.match(/\[Bubble (\w+)/);
    if (bubbleMatch) {
      bubbleId = bubbleMatch[1];
    }
    
    // Generate response based on bubble type
    let result = '';
    
    switch(bubbleId) {
      case 'briefing':
        result = `**Briefing-Assistent aktiviert** 📊

Ich helfe Ihnen, ein strukturiertes Executive Briefing zu erstellen.

**Vorlage für Ihr Briefing:**

1. **Kontext**: Kurze Situationsbeschreibung
2. **Zahlen & Fakten**: Die wichtigsten Metriken
3. **Risiken**: Potenzielle Herausforderungen
4. **Option A**: Erste Handlungsoption
5. **Option B**: Alternative Handlungsoption
6. **Empfehlung**: Klare Handlungsempfehlung
7. **Nächste Schritte**: Konkrete Maßnahmen

Nutzen Sie diese Struktur für Ihre nächste Präsentation!`;
        break;
        
      case 'agenda':
        result = `**Meeting-Agenda Generator** ⏰

Hier ist Ihre optimierte 30-Minuten-Agenda:

**00:00-00:05** - Check-in & Ziele
- Kurze Begrüßung
- Agenda-Überblick
- Erwartete Ergebnisse

**00:05-00:15** - Hauptthema
- Status Update
- Kernpunkte diskutieren
- Fragen klären

**00:15-00:25** - Entscheidungen
- Optionen bewerten
- Entscheidung treffen
- Verantwortlichkeiten klären

**00:25-00:30** - Next Steps
- Aufgaben verteilen
- Timeline festlegen
- Folgetermin vereinbaren`;
        break;
        
      case 'pitch':
        result = `**60-Sekunden Pitch Formel** 🎯

Ihr perfekter Elevator Pitch:

**Sekunde 0-10: Der Hook**
"Wussten Sie, dass [überraschende Statistik/Fakt]?"

**Sekunde 10-20: Das Problem**
"Viele Unternehmen kämpfen mit [konkretes Problem]."

**Sekunde 20-35: Die Lösung**
"Wir haben [Ihre Lösung] entwickelt, die [Hauptvorteil] ermöglicht."

**Sekunde 35-50: Der Beweis**
"Bereits [Anzahl] Kunden konnten dadurch [konkretes Ergebnis] erreichen."

**Sekunde 50-60: Call-to-Action**
"Lassen Sie uns in 15 Minuten besprechen, wie das auch für Sie funktioniert."

Üben Sie diese Struktur mit Ihrem konkreten Thema!`;
        break;
        
      case 'risks':
        result = `**Risiko-Analyse Framework** ⚠️

Systematische Risikobewertung:

**Risiko 1: Technisches Versagen**
- Wahrscheinlichkeit: MITTEL
- Impact: HOCH
- Gegenmaßnahme: Redundante Systeme, regelmäßige Backups

**Risiko 2: Budget-Überschreitung**
- Wahrscheinlichkeit: MITTEL
- Impact: MITTEL
- Gegenmaßnahme: Wöchentliches Budget-Monitoring, Puffer einplanen

**Risiko 3: Verzögerungen**
- Wahrscheinlichkeit: HOCH
- Impact: MITTEL
- Gegenmaßnahme: Zeitpuffer, parallele Arbeitsströme

**Empfehlung**: Fokus auf Risiko 1, da höchster Impact. Implementieren Sie präventive Maßnahmen sofort.`;
        break;
        
      case 'excel':
        result = `**Excel-Formel Helfer** 📊

Die wichtigsten Excel-Formeln für Ihren Alltag:

**WENN-Verschachtelung:**
=WENN(A1>100;"Hoch";WENN(A1>50;"Mittel";"Niedrig"))

**SVERWEIS mit Fehlerbehandlung:**
=WENNFEHLER(SVERWEIS(A1;Tabelle;2;FALSCH);"Nicht gefunden")

**Dynamische Summe:**
=SUMMEWENNS(Bereich;Kriterium1;Wert1;Kriterium2;Wert2)

**Index + Vergleich (besser als SVERWEIS):**
=INDEX(Ergebnis;VERGLEICH(Suchkriterium;Suchbereich;0))

**Power-Tipp**: Nutzen Sie Strg+Shift+Enter für Array-Formeln!`;
        break;
        
      case 'daily':
        result = `**Täglicher Fokus Plan** ✅

Ihre 3 wichtigsten Aufgaben für heute:

**1. Priorität HOCH: Kritische Aufgabe**
- Erster Schritt: Email/Slack checken für Updates
- Zweiter Schritt: 25 Minuten fokussierte Arbeit

**2. Priorität MITTEL: Wichtiges Projekt**
- Erster Schritt: Status-Review (5 Min)
- Zweiter Schritt: Nächsten Meilenstein definieren

**3. Priorität NIEDRIG: Administrative Aufgabe**
- Erster Schritt: Alle offenen Items sammeln
- Zweiter Schritt: Batch-Verarbeitung (30 Min)

**Energie-Management:**
- Vormittag: Kreative/schwierige Arbeit
- Nachmittag: Meetings & Kommunikation
- Abend: Planung für morgen

Start mit Aufgabe 1 - jetzt!`;
        break;
        
      default:
        result = `Ich bin Ihr KI-Assistent und helfe Ihnen gerne weiter! 

Was kann ich für Sie tun? Probieren Sie einen der spezialisierten Assistenten:
- Briefing-Assistent
- Meeting-Agenda
- 60s Pitch
- Risiko-Analyse
- Excel-Formeln
- Täglicher Fokus`;
    }
    
    res.json({ 
      result,
      success: true,
      bubbleId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[API] Error in /run endpoint:', error);
    res.status(500).json({ 
      error: 'Processing failed',
      message: error.message 
    });
  }
});

// Stream endpoint für progressive Antworten
app.get('/api/run/stream', (req, res) => {
  const { q, eu } = req.query;
  
  console.log('[API] /run/stream called with:', { q, eu });
  
  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Parse bubble from query
  let bubbleId = null;
  const bubbleMatch = q?.match(/\[Bubble (\w+)/);
  if (bubbleMatch) {
    bubbleId = bubbleMatch[1];
  }
  
  // Simulate streaming response
  const messages = [
    `Verarbeite Anfrage für: ${bubbleId || 'Standard'}...`,
    `Generiere Antwort...`,
    `Fast fertig...`
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
  }, 500);
  
  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// LLM endpoint (for AI features)
app.post('/api/llm/generate', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    
    // Check for API keys
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ 
        error: 'LLM service not configured',
        message: 'Please configure OPENAI_API_KEY or ANTHROPIC_API_KEY'
      });
    }
    
    // Placeholder for LLM integration
    const llmModule = require('./share.llm');
    const response = await llmModule.generate?.({ prompt, model }) || {
      text: 'LLM service integration pending',
      model: model || 'none'
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error with LLM:', error);
    res.status(500).json({ error: 'LLM generation failed' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║         HOHL.ROCKS Backend Server      ║
╠════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}        ║
║  🌍 Environment: ${process.env.NODE_ENV || 'development'}     ║
║  📁 Videos path: ${videosPath}
║  ✅ Health check: /healthz             ║
╚════════════════════════════════════════╝
  `);
});