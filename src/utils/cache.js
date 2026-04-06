// ===================================================================
// IN-MEMORY CACHE
// ===================================================================

const cacheStore = new Map();

export function createCache(ttlMs) {
  const prefix = `cache_${Math.random().toString(36).slice(2, 8)}`;

  return {
    get(key) {
      const entry = cacheStore.get(`${prefix}:${key}`);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        cacheStore.delete(`${prefix}:${key}`);
        return null;
      }
      return entry.data;
    },
    set(key, data) {
      cacheStore.set(`${prefix}:${key}`, {
        data,
        expiresAt: Date.now() + ttlMs
      });
    },
    clear() {
      for (const [key] of cacheStore) {
        if (key.startsWith(`${prefix}:`)) {
          cacheStore.delete(key);
        }
      }
    }
  };
}

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cacheStore) {
    if (now > entry.expiresAt) {
      cacheStore.delete(key);
    }
  }
}, 300000);
