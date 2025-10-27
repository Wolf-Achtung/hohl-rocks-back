// api/server/tips.js
//
// Provides a static collection of curated KI‑Tipps along with a helper to
// retrieve them.  Each tip contains basic metadata and a priority used
// to sort the list.  The list is cached for a configurable duration so
// that clients can rely on stable responses between refreshes.

const cache = require('./cache');

// Cache key and TTL.  The TTL can be overridden via the TIPS_TTL_HOURS
// environment variable.  Defaults to one day (24 hours).
const CACHE_KEY = 'tips:all';
const TTL_MS = (parseInt(process.env.TIPS_TTL_HOURS, 10) || 24) * 60 * 60 * 1000;

// Static tips curated for the hohl.rocks platform.  These entries cover
// topics ranging from Prompt Engineering and LLM efficiency to
// DSGVO‑konforme Nutzung von KI und Enterprise‑Architekturen wie
// Retrieval‑Augmented Generation (RAG).  Additional entries can be
// appended as needed.
const staticTips = [
  {
    id: 'prompt-basics',
    title: 'AI Prompt Engineering Basics',
    content: 'Sei spezifisch und klar in deinen Prompts für bessere KI‑Antworten.',
    category: 'Praxis',
    why: 'Best Practice',
    // Interner Pfad zum Tipp‑Detail.  Mit absoluten Pfaden vermeiden wir
    // Probleme mit relativen Modulpfaden, wenn die Seite unter /tips/... geladen wird.
    url: '/tips/prompt-basics.html',
    tags: ['AI', 'Prompting', 'Basics'],
    date: new Date().toISOString(),
    priority: 10
  },
  {
    id: 'claude-sonnet-best',
    title: 'Claude 3.5 Sonnet Best Practices',
    content: 'Strukturierte Prompts mit klaren Anweisungen, Beispielen und Qualitätskriterien führen zu deutlich besseren Ergebnissen.',
    category: 'Effizienz',
    why: 'AI Excellence',
    url: '/tips/claude-sonnet-best.html',
    tags: ['AI', 'Claude', 'Advanced'],
    date: new Date().toISOString(),
    priority: 9
  },
  {
    id: 'video-optimization',
    title: 'Video‑Optimierung für das Web',
    content: 'Nutze den H.264‑Codec mit adaptivem Streaming für die beste Web‑Kompatibilität und Performance.',
    category: 'Performance',
    why: 'Performance',
    url: '/tips/video-optimization.html',
    tags: ['Video', 'Performance', 'Web'],
    date: new Date().toISOString(),
    priority: 8
  },
  {
    id: 'dsq-ki',
    title: 'DSGVO‑konforme KI‑Nutzung',
    content: 'Datensparsamkeit, Pseudonymisierung und sorgfältige Anbieterwahl sind die wichtigsten Datenschutzaspekte beim Einsatz von KI.',
    category: 'Rechtssicherheit',
    why: 'Compliance',
    url: '/tips/dsq-ki.html',
    tags: ['DSGVO', 'Compliance', 'AI'],
    date: new Date().toISOString(),
    priority: 7
  },
  {
    id: 'eu-ai-act',
    title: 'EU AI Act – Was Sie wissen müssen',
    content: 'Die wichtigsten Regelungen des EU AI Act für Unternehmen: Risikostufen, Transparenzpflichten und Dokumentationsanforderungen.',
    category: 'Compliance',
    why: 'Regulation',
    url: '/tips/eu-ai-act.html',
    tags: ['EU', 'Regulation', 'Compliance'],
    date: new Date().toISOString(),
    priority: 7
  },
  {
    id: 'context-windows',
    title: 'LLM Context Windows richtig nutzen',
    content: 'Verstehe und optimiere die Nutzung von Context Windows in großen Sprachmodellen.',
    category: 'Technical',
    why: 'Optimization',
    url: '/tips/context-windows.html',
    tags: ['AI', 'Technical', 'Optimization'],
    date: new Date().toISOString(),
    priority: 6
  },
  {
    id: 'rag-systems',
    title: 'RAG‑Systeme für Unternehmens‑KI',
    content: 'Retrieval‑Augmented Generation: So baust du KI‑Systeme mit eigenem Wissen.',
    category: 'Architecture',
    why: 'Enterprise AI',
    url: '/tips/rag-systems.html',
    tags: ['AI', 'RAG', 'Enterprise'],
    date: new Date().toISOString(),
    priority: 6
  },
  {
    id: 'token-optimization',
    title: 'Token‑Optimierung für Kosteneffizienz',
    content: 'Spare bis zu 80 % Kosten durch intelligente Token‑Nutzung in KI‑Anwendungen.',
    category: 'Cost',
    why: 'Efficiency',
    url: '/tips/token-optimization.html',
    tags: ['AI', 'Cost', 'Optimization'],
    date: new Date().toISOString(),
    priority: 5
  },
  {
    id: 'streaming-responses',
    title: 'Streaming‑Responses für bessere UX',
    content: 'Implementiere Echtzeit‑Streaming für sofortiges Feedback in KI‑Anwendungen.',
    category: 'UX',
    why: 'User Experience',
    url: '/tips/streaming-responses.html',
    tags: ['AI', 'UX', 'Streaming'],
    date: new Date().toISOString(),
    priority: 5
  },
  {
    id: 'system-prompts',
    title: 'System‑Prompts: Die unterschätzte Macht',
    content: 'Wie du mit perfekten System‑Prompts die KI‑Ausgaben präzise steuerst.',
    category: 'Prompting',
    why: 'Control',
    url: '/tips/system-prompts.html',
    tags: ['AI', 'Prompting', 'Advanced'],
    date: new Date().toISOString(),
    priority: 8
  },
  {
    id: 'fallback-chains',
    title: 'Fallback‑Chains für Zuverlässigkeit',
    content: 'Baue robuste KI‑Systeme mit intelligenten Fallback‑Mechanismen.',
    category: 'Reliability',
    why: 'Production',
    url: '/tips/fallback-chains.html',
    tags: ['AI', 'Architecture', 'Reliability'],
    date: new Date().toISOString(),
    priority: 6
  },
  {
    id: 'error-handling',
    title: 'Error Handling in KI‑Apps',
    content: 'Best Practices für fehlertolerante KI‑Anwendungen.',
    category: 'Development',
    why: 'Robustness',
    url: '/tips/error-handling.html',
    tags: ['AI', 'Development', 'Best Practice'],
    date: new Date().toISOString(),
    priority: 5
  }
];

/**
 * Retrieve the sorted list of tips.  Results are cached for the TTL; on a
 * cache miss the static data is sorted and stored.  Sorting is by
 * priority (descending) then by date (newest first).  An enriched
 * response is returned containing a rank and source for each tip.
 *
 * @returns {Promise<Array>} array of tip objects
 */
async function getTips() {
  try {
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      return cached;
    }
    const sorted = staticTips
      .slice()
      .sort((a, b) => {
        if ((b.priority || 0) !== (a.priority || 0)) {
          return (b.priority || 0) - (a.priority || 0);
        }
        return new Date(b.date) - new Date(a.date);
      });
    // Enrich with rank and source
    const enriched = sorted.map((tip, idx) => ({
      ...tip,
      rank: idx + 1,
      source: 'static'
    }));
    cache.set(CACHE_KEY, enriched, TTL_MS);
    return enriched;
  } catch (err) {
    console.error('[tips] getTips error', err);
    // On error return unsorted static list
    return staticTips;
  }
}

// Convenience filters (category/tag) not used by API directly but exported
function getTipById(id) {
  return staticTips.find(t => t.id === id);
}
function getTipsByCategory(category) {
  return staticTips.filter(t => t.category === category);
}
function getTipsByTag(tag) {
  return staticTips.filter(t => t.tags && t.tags.includes(tag));
}
function getAllCategories() {
  return [...new Set(staticTips.map(t => t.category))];
}
function getAllTags() {
  return [...new Set(staticTips.flatMap(t => t.tags || []))];
}

module.exports = {
  getTips,
  staticTips,
  getTipById,
  getTipsByCategory,
  getTipsByTag,
  getAllCategories,
  getAllTags
};