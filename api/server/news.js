// server/news.js
const https = require('https');

// Cache für News
const newsCache = {
  data: null,
  timestamp: 0
};

const CACHE_DURATION = (parseInt(process.env.NEWS_TTL_HOURS) || 24) * 60 * 60 * 1000;

async function fetchFromDomain(domain, query = '') {
  return new Promise((resolve) => {
    // Placeholder für echte News-API Integration
    // In Produktion würde hier z.B. RSS-Feeds oder News-APIs abgefragt
    setTimeout(() => {
      resolve([
        {
          title: `KI-Regulierung: Neue Entwicklungen bei ${domain}`,
          url: `https://${domain}/ai-regulation-2025`,
          summary: 'Aktuelle Entwicklungen im Bereich KI-Regulierung und EU AI Act',
          date: new Date().toISOString(),
          source: domain
        },
        {
          title: `Tech-Trends 2025: Was Unternehmen wissen müssen`,
          url: `https://${domain}/tech-trends-2025`,
          summary: 'Die wichtigsten Technologie-Trends für das Jahr 2025',
          date: new Date(Date.now() - 86400000).toISOString(),
          source: domain
        }
      ]);
    }, 100);
  });
}

async function getNews() {
  try {
    // Check cache first
    if (newsCache.data && (Date.now() - newsCache.timestamp) < CACHE_DURATION) {
      console.log('[News] Returning cached data');
      return newsCache.data;
    }

    console.log('[News] Fetching fresh news...');
    const domains = (process.env.NEWS_DOMAINS || 'heise.de,golem.de,t3n.de').split(',');
    const newsPromises = domains.map(domain => fetchFromDomain(domain.trim()));
    const results = await Promise.allSettled(newsPromises);
    
    const allNews = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20); // Limit to 20 most recent news items

    // Update cache
    newsCache.data = allNews;
    newsCache.timestamp = Date.now();
    
    return allNews;
  } catch (error) {
    console.error('[News] Error fetching news:', error);
    return newsCache.data || [];
  }
}

// Clear cache periodically
setInterval(() => {
  newsCache.data = null;
  console.log('[News] Cache cleared');
}, CACHE_DURATION);

module.exports = { getNews };