// server/cache.js
const cache = new Map();
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0
};

// Default TTL: 1 hour
const DEFAULT_TTL = 60 * 60 * 1000;

/**
 * Set a value in the cache
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 * @param {number} ttl - Time to live in milliseconds
 */
function set(key, value, ttl = DEFAULT_TTL) {
  if (!key) return false;
  
  cache.set(key, {
    value,
    expires: Date.now() + ttl,
    created: Date.now(),
    hits: 0
  });
  
  stats.sets++;
  
  // Clean up expired entries periodically
  if (stats.sets % 100 === 0) {
    cleanup();
  }
  
  return true;
}

/**
 * Get a value from the cache
 * @param {string} key - Cache key
 * @returns {*} Cached value or null
 */
function get(key) {
  if (!key) return null;
  
  const item = cache.get(key);
  
  if (!item) {
    stats.misses++;
    return null;
  }
  
  // Check if expired
  if (Date.now() > item.expires) {
    cache.delete(key);
    stats.misses++;
    return null;
  }
  
  // Update hit count
  item.hits++;
  stats.hits++;
  
  return item.value;
}

/**
 * Check if a key exists and is not expired
 * @param {string} key - Cache key
 * @returns {boolean}
 */
function has(key) {
  if (!key) return false;
  
  const item = cache.get(key);
  if (!item) return false;
  
  if (Date.now() > item.expires) {
    cache.delete(key);
    return false;
  }
  
  return true;
}

/**
 * Delete a specific key from cache
 * @param {string} key - Cache key
 * @returns {boolean} True if deleted, false if not found
 */
function del(key) {
  if (!key) return false;
  
  const deleted = cache.delete(key);
  if (deleted) stats.deletes++;
  
  return deleted;
}

/**
 * Clear all cache entries
 */
function clear() {
  const size = cache.size;
  cache.clear();
  stats.deletes += size;
  console.log(`[Cache] Cleared ${size} entries`);
}

/**
 * Clean up expired entries
 */
function cleanup() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, item] of cache.entries()) {
    if (now > item.expires) {
      cache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[Cache] Cleaned up ${cleaned} expired entries`);
    stats.deletes += cleaned;
  }
}

/**
 * Get cache statistics
 * @returns {object} Cache statistics
 */
function getStats() {
  return {
    ...stats,
    size: cache.size,
    hitRate: stats.hits / (stats.hits + stats.misses) || 0
  };
}

/**
 * Get all keys (for debugging)
 * @returns {string[]} Array of cache keys
 */
function keys() {
  return Array.from(cache.keys());
}

/**
 * Get cache info for a specific key
 * @param {string} key - Cache key
 * @returns {object|null} Cache item info
 */
function info(key) {
  const item = cache.get(key);
  if (!item) return null;
  
  const now = Date.now();
  return {
    expires: item.expires,
    created: item.created,
    ttl: item.expires - now,
    hits: item.hits,
    expired: now > item.expires,
    age: now - item.created
  };
}

// Clean up expired entries every 5 minutes
setInterval(cleanup, 5 * 60 * 1000);

// Log stats every hour in production
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    console.log('[Cache] Stats:', getStats());
  }, 60 * 60 * 1000);
}

module.exports = {
  set,
  get,
  has,
  del,
  clear,
  cleanup,
  getStats,
  keys,
  info
};