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