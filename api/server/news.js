// api/server/news.js
//
// Curated AI news provider for the hohl.rocks platform.  This module
// exports a function that returns a sorted array of news items.  It
// caches the results using the simple in‑memory cache helper.  The
// NEWS_TTL_HOURS environment variable controls how long the cache is
// retained (default: 24 hours).

import { get as cacheGet, set as cacheSet } from './cache.js';

// Cache key and TTL.  Convert hours to milliseconds.  If the
// environment variable cannot be parsed, default to 24 hours.
const CACHE_KEY = 'news:all';
const TTL_MS = (parseInt(process.env.NEWS_TTL_HOURS, 10) || 24) * 60 * 60 * 1000;

// Static list of curated news items.  New items can be added here
// without affecting consumer code.  Each entry includes a priority for
// sorting (descending) and a date for tiebreakers.  The date defaults
// to now so that items appear fresh when first deployed.
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
 * Retrieve a list of news items.  Results are cached according to
 * NEWS_TTL_HOURS to avoid unnecessary work on each request.  When the
 * cache is empty or stale the static list is sorted by priority and
 * date, cached and returned.
 *
 * @returns {Promise<Array>} Promise resolving to an array of news items
 */
export async function getNews() {
  const cached = cacheGet(CACHE_KEY);
  if (cached) return cached;
  // Sort by priority (descending) then by date (newest first)
  const sorted = staticNews.slice().sort((a, b) => {
    if ((b.priority || 0) !== (a.priority || 0)) {
      return (b.priority || 0) - (a.priority || 0);
    }
    return new Date(b.date) - new Date(a.date);
  });
  cacheSet(CACHE_KEY, sorted, TTL_MS);
  return sorted;
}

// Also export the static list for potential inspection or testing.
export { staticNews };