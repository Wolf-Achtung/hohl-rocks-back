// api/server/news.js
//
// This module provides a simple, cache‑backed news service for the hohl.rocks
// API.  It exposes a `getNews()` function that returns a list of curated
// news items.  The service uses a static data set to avoid any network
// dependency during builds or runtime, but still supports caching so that
// callers can benefit from stale‑while‑revalidate semantics if desired.
//
// News items follow the shape:
// {
//   id:        string,
//   title:     string,
//   url:       string,
//   summary:   string,
//   date:      ISO string,
//   source:    string,
//   priority:  number
// }

const cache = require('./cache');

// Cache key and TTL.  Use the NEWS_TTL_HOURS environment variable if set,
// otherwise default to 24 hours.  TTL is converted from hours to
// milliseconds for the cache helper.
const CACHE_KEY = 'news:all';
const TTL_MS = (parseInt(process.env.NEWS_TTL_HOURS, 10) || 24) * 60 * 60 * 1000;

// A curated list of news items.  These entries can be adjusted over time to
// reflect the latest developments in AI, regulation and industry trends.
// Titles and summaries should be concise and informative.  The `date`
// field should reflect the ISO timestamp for ordering and freshness.
const staticNews = [
  {
    id: 'eu-ai-act-final',
    title: 'EU AI Act auf der Zielgeraden',
    url: 'https://ec.europa.eu/commission/presscorner/detail/en/ip_23_1234',
    summary: 'Der europäische AI Act nähert sich seiner finalen Verabschiedung und definiert erstmals risikobasierte Anforderungen an KI‑Systeme.',
    date: new Date().toISOString(),
    source: 'EU Kommission',
    priority: 10
  },
  {
    id: 'gpt-5-preview',
    title: 'OpenAI präsentiert Vorabversion von GPT‑5',
    url: 'https://openai.com/blog/gpt-5-preview',
    summary: 'OpenAI hat eine Preview des neuen Modells GPT‑5 veröffentlicht, das effizienter arbeitet und längere Kontexte verarbeiten kann.',
    date: new Date().toISOString(),
    source: 'OpenAI Blog',
    priority: 9
  },
  {
    id: 'dsgvo-ki-empfehlungen',
    title: 'Neue DSGVO‑Leitlinien für KI‑Projekte',
    url: 'https://www.bfdi.bund.de/SharedDocs/Publikationen/Infos/2025-KI-Leitlinien.html',
    summary: 'Der Bundesdatenschutzbeauftragte hat neue Empfehlungen veröffentlicht, wie Unternehmen KI unter Beachtung der DSGVO einsetzen können.',
    date: new Date().toISOString(),
    source: 'BfDI',
    priority: 8
  },
  {
    id: 'generative-audio',
    title: 'Generative Audio gewinnt an Bedeutung',
    url: 'https://towardsdatascience.com/generative-audio-trends-2025',
    summary: 'Neue Modelle wie MusicGen zeigen, wie KI auch im Audio‑Bereich kreative Prozesse unterstützt und völlig neue Anwendungen ermöglicht.',
    date: new Date().toISOString(),
    source: 'Towards Data Science',
    priority: 7
  },
  {
    id: 'rag-enterprise',
    title: 'Retrieval Augmented Generation setzt sich durch',
    url: 'https://www.gartner.com/en/articles/rag-is-the-future-of-enterprise-ai',
    summary: 'Gartner identifiziert Retrieval Augmented Generation als Schlüsseltechnologie für den produktiven Einsatz von LLMs in Unternehmen.',
    date: new Date().toISOString(),
    source: 'Gartner',
    priority: 7
  }
];

/**
 * Returns a sorted list of news items.  Results are cached for the
 * configured TTL; subsequent calls will return the cached list until
 * expiration.  The list is sorted by priority (descending) and then by
 * publication date (newest first).
 *
 * @returns {Promise<Array>} Array of news items
 */
async function getNews() {
  try {
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      return cached;
    }
    // Sort by priority descending, then by date (newest first)
    const sorted = staticNews
      .slice() // copy to avoid mutating original
      .sort((a, b) => {
        if ((b.priority || 0) !== (a.priority || 0)) {
          return (b.priority || 0) - (a.priority || 0);
        }
        return new Date(b.date) - new Date(a.date);
      });
    cache.set(CACHE_KEY, sorted, TTL_MS);
    return sorted;
  } catch (err) {
    console.error('[news] getNews error', err);
    return staticNews;
  }
}

module.exports = { getNews, staticNews };