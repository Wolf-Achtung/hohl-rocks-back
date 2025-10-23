// api/server/tips.js - OPTIMIERT v2.0
const cache = require('./cache');

const CACHE_KEY = 'tips:all';
const CACHE_DURATION = (parseInt(process.env.TIPS_TTL_HOURS) || 24) * 60 * 60 * 1000;

// ===== STATISCHE TIPS-DATENBANK =====

const staticTips = [
  {
    id: "prompt-basics",
    title: "AI Prompt Engineering Basics",
    content: "Be specific and clear in your prompts for better AI responses",
    category: "Praxis",
    why: "Best Practice",
    url: "https://hohl.rocks/tips/prompt-engineering",
    tags: ["AI", "Prompting", "Basics"],
    date: new Date().toISOString(),
    priority: 10
  },
  {
    id: "video-optimization",
    title: "Video Optimization for Web",
    content: "Use H.264 codec with adaptive bitrate streaming for best web compatibility and performance",
    category: "Performance",
    why: "Performance",
    url: "https://hohl.rocks/tips/video-optimization",
    tags: ["Video", "Performance", "Web"],
    date: new Date().toISOString(),
    priority: 8
  },
  {
    id: "claude-sonnet-best",
    title: "Claude 3.5 Sonnet Best Practices",
    content: "Strukturierte Prompts mit klaren Anweisungen, Beispielen und Qualitätskriterien führen zu deutlich besseren Ergebnissen",
    category: "Effizienz",
    why: "AI Excellence",
    url: "https://hohl.rocks/tips/claude-best-practices",
    tags: ["AI", "Claude", "Advanced"],
    date: new Date().toISOString(),
    priority: 9
  },
  {
    id: "dsgvo-ki",
    title: "DSGVO-konforme KI-Nutzung",
    content: "Wichtige Datenschutz-Aspekte beim Einsatz von KI in Unternehmen: Datensparsamkeit, Pseudonymisierung, Anbieterwahl",
    category: "Rechtssicherheit",
    why: "Compliance",
    url: "https://hohl.rocks/tips/dsgvo-ki",
    tags: ["DSGVO", "Compliance", "AI"],
    date: new Date().toISOString(),
    priority: 7
  },
  {
    id: "eu-ai-act",
    title: "EU AI Act – Was Sie wissen müssen",
    content: "Die wichtigsten Regelungen des EU AI Act für Unternehmen: Risikostufen, Transparenzpflichten, Dokumentation",
    category: "Compliance",
    why: "Regulation",
    url: "https://hohl.rocks/tips/eu-ai-act",
    tags: ["EU", "Regulation", "Compliance"],
    date: new Date().toISOString(),
    priority: 7
  },
  {
    id: "context-windows",
    title: "LLM Context Windows richtig nutzen",
    content: "Verstehe und optimiere die Nutzung von Context Windows in großen Sprachmodellen",
    category: "Technical",
    why: "Optimization",
    url: "https://hohl.rocks/tips/context-windows",
    tags: ["AI", "Technical", "Optimization"],
    date: new Date().toISOString(),
    priority: 6
  },
  {
    id: "rag-systems",
    title: "RAG-Systeme für Unternehmens-KI",
    content: "Retrieval-Augmented Generation: So baust du KI-Systeme mit eigenem Wissen",
    category: "Architecture",
    why: "Enterprise AI",
    url: "https://hohl.rocks/tips/rag-systems",
    tags: ["AI", "RAG", "Enterprise"],
    date: new Date().toISOString(),
    priority: 6
  },
  {
    id: "token-optimization",
    title: "Token-Optimierung für Kosteneffizienz",
    content: "Spare bis zu 80% Kosten durch intelligente Token-Nutzung in KI-Anwendungen",
    category: "Cost",
    why: "Efficiency",
    url: "https://hohl.rocks/tips/token-optimization",
    tags: ["AI", "Cost", "Optimization"],
    date: new Date().toISOString(),
    priority: 5
  },
  {
    id: "streaming-responses",
    title: "Streaming-Responses für bessere UX",
    content: "Implementiere Echtzeit-Streaming für sofortiges Feedback in KI-Anwendungen",
    category: "UX",
    why: "User Experience",
    url: "https://hohl.rocks/tips/streaming-responses",
    tags: ["AI", "UX", "Streaming"],
    date: new Date().toISOString(),
    priority: 5
  },
  {
    id: "system-prompts",
    title: "System-Prompts: Die unterschätzte Macht",
    content: "Wie du mit perfekten System-Prompts die KI-Ausgaben präzise steuerst",
    category: "Prompting",
    why: "Control",
    url: "https://hohl.rocks/tips/system-prompts",
    tags: ["AI", "Prompting", "Advanced"],
    date: new Date().toISOString(),
    priority: 8
  },
  {
    id: "fallback-chains",
    title: "Fallback-Chains für Zuverlässigkeit",
    content: "Baue robuste KI-Systeme mit intelligenten Fallback-Mechanismen",
    category: "Reliability",
    why: "Production",
    url: "https://hohl.rocks/tips/fallback-chains",
    tags: ["AI", "Architecture", "Reliability"],
    date: new Date().toISOString(),
    priority: 6
  },
  {
    id: "error-handling",
    title: "Error Handling in KI-Apps",
    content: "Best Practices für fehlertolerante KI-Anwendungen",
    category: "Development",
    why: "Robustness",
    url: "https://hohl.rocks/tips/error-handling",
    tags: ["AI", "Development", "Best Practice"],
    date: new Date().toISOString(),
    priority: 5
  }
];

// ===== EXTERNE TIPS (Platzhalter für Tavily-Integration) =====

async function fetchExternalTips() {
  // Placeholder für externe API-Integration
  if (process.env.TAVILY_API_KEY && process.env.TAVILY_API_KEY !== '__SET_ME__') {
    try {
      console.log('[Tips] Would fetch from Tavily API');
      // Hier würde die Tavily API Integration stehen
      // const response = await fetch('https://api.tavily.com/search', {...});
      // return processedResults;
    } catch (error) {
      console.error('[Tips] Error fetching external tips:', error);
    }
  }
  return [];
}

// ===== MAIN TIPS FUNCTION =====

async function getTips() {
  try {
    // Check cache first
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      console.log('[Tips] Returning', cached.length, 'cached tips');
      return cached;
    }
    
    console.log('[Tips] Cache miss, loading tips...');
    
    // Get external tips (if available)
    const externalTips = await fetchExternalTips();
    
    // Combine static and external tips
    const allTips = [...staticTips, ...externalTips];
    
    // Sort by priority (high to low) then by date (newest first)
    const sortedTips = allTips
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return (b.priority || 0) - (a.priority || 0);
        }
        return new Date(b.date) - new Date(a.date);
      })
      .slice(0, 20); // Top 20 tips
    
    // Add metadata
    const enrichedTips = sortedTips.map((tip, index) => ({
      ...tip,
      rank: index + 1,
      source: tip.id.includes('-') ? 'static' : 'external'
    }));
    
    // Cache for TTL
    cache.set(CACHE_KEY, enrichedTips, CACHE_DURATION);
    
    console.log('[Tips] Cached', enrichedTips.length, 'tips');
    
    return enrichedTips;
  } catch (error) {
    console.error('[Tips] Error getting tips:', error);
    
    // Return cached data if available, even if expired
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      console.log('[Tips] Returning stale cache due to error');
      return cached;
    }
    
    // Last resort: return static tips
    console.log('[Tips] Returning static tips as fallback');
    return staticTips.slice(0, 20);
  }
}

// ===== HELPER FUNCTIONS =====

function getTipById(id) {
  return staticTips.find(tip => tip.id === id);
}

function getTipsByCategory(category) {
  return staticTips.filter(tip => tip.category === category);
}

function getTipsByTag(tag) {
  return staticTips.filter(tip => tip.tags && tip.tags.includes(tag));
}

function getAllCategories() {
  return [...new Set(staticTips.map(tip => tip.category))];
}

function getAllTags() {
  const allTags = staticTips.flatMap(tip => tip.tags || []);
  return [...new Set(allTags)];
}

// ===== EXPORTS =====

module.exports = { 
  getTips, 
  getTipById,
  getTipsByCategory,
  getTipsByTag,
  getAllCategories,
  getAllTags,
  staticTips 
};
