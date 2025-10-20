// server/tips.js
const tipsCache = {
  data: null,
  timestamp: 0
};

const CACHE_DURATION = (parseInt(process.env.TIPS_TTL_HOURS) || 24) * 60 * 60 * 1000;

// Statische Tips-Datenbank (kann später durch API-Calls ersetzt werden)
const staticTips = [
  {
    id: 1,
    title: "AI Prompt Engineering Basics",
    content: "Be specific and clear in your prompts for better AI responses",
    category: "AI",
    why: "Praxis",
    url: "https://hohl.rocks/tips/prompt-engineering",
    tags: ["AI", "Prompting", "Basics"],
    date: new Date().toISOString()
  },
  {
    id: 2,
    title: "Video Optimization for Web",
    content: "Use H.264 codec and adaptive bitrate for best compatibility",
    category: "Video",
    why: "Performance",
    url: "https://hohl.rocks/tips/video-optimization",
    tags: ["Video", "Performance", "Web"],
    date: new Date().toISOString()
  },
  {
    id: 3,
    title: "Claude 3.5 Sonnet Best Practices",
    content: "Strukturierte Prompts mit klaren Anweisungen führen zu besseren Ergebnissen",
    category: "AI",
    why: "Effizienz",
    url: "https://hohl.rocks/tips/claude-best-practices",
    tags: ["AI", "Claude", "Advanced"],
    date: new Date().toISOString()
  },
  {
    id: 4,
    title: "DSGVO-konforme KI-Nutzung",
    content: "Wichtige Datenschutz-Aspekte beim Einsatz von KI in Unternehmen",
    category: "Compliance",
    why: "Rechtssicherheit",
    url: "https://hohl.rocks/tips/dsgvo-ki",
    tags: ["DSGVO", "Compliance", "AI"],
    date: new Date().toISOString()
  },
  {
    id: 5,
    title: "EU AI Act - Was Sie wissen müssen",
    content: "Die wichtigsten Regelungen des EU AI Act für Unternehmen",
    category: "Regulation",
    why: "Compliance",
    url: "https://hohl.rocks/tips/eu-ai-act",
    tags: ["EU", "Regulation", "Compliance"],
    date: new Date().toISOString()
  }
];

async function fetchExternalTips() {
  // Placeholder für externe API-Integration
  // z.B. von Tavily oder anderen Quellen
  if (process.env.TAVILY_API_KEY) {
    try {
      // Hier würde die Tavily API aufgerufen
      console.log('[Tips] Would fetch from Tavily API');
    } catch (error) {
      console.error('[Tips] Error fetching external tips:', error);
    }
  }
  return [];
}

async function getTips() {
  try {
    // Check cache first
    if (tipsCache.data && (Date.now() - tipsCache.timestamp) < CACHE_DURATION) {
      console.log('[Tips] Returning cached data');
      return tipsCache.data;
    }

    console.log('[Tips] Loading tips...');
    
    // Combine static and external tips
    const externalTips = await fetchExternalTips();
    const allTips = [...staticTips, ...externalTips];
    
    // Sort by date (newest first) and limit
    const sortedTips = allTips
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20);
    
    // Update cache
    tipsCache.data = sortedTips;
    tipsCache.timestamp = Date.now();
    
    return sortedTips;
  } catch (error) {
    console.error('[Tips] Error getting tips:', error);
    return tipsCache.data || staticTips;
  }
}

// Clear cache periodically
setInterval(() => {
  tipsCache.data = null;
  console.log('[Tips] Cache cleared');
}, CACHE_DURATION);

module.exports = { getTips, staticTips };