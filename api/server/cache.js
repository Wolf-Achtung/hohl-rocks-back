// api/server/cache.js
//
// A simple in‑memory cache with TTL support.  Each entry stores a value
// alongside an expiration timestamp.  When a cached item is requested
// after its TTL has expired it is automatically purged and undefined is
// returned.  This module is intentionally minimal and does not support
// persistence or complex eviction policies.

// The internal store maps keys to { value, expires } records.
const store = new Map();

/**
 * Retrieve a cached value by key.  If the entry has expired, it will
 * be removed and undefined returned.  The TTL is checked against
 * Date.now() on each invocation.
 *
 * @param {string} key The cache key
 * @returns {any|undefined} The cached value or undefined if missing/expired
 */
export function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expires && Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * Store a value in the cache with an optional TTL.  If ttlMs is
 * provided and greater than zero, the entry will expire after that
 * duration; otherwise the item will persist until explicitly removed.
 *
 * @param {string} key The cache key
 * @param {any} value The value to store
 * @param {number} ttlMs Time to live in milliseconds
 */
export function set(key, value, ttlMs = 0) {
  const expires = ttlMs > 0 ? Date.now() + ttlMs : 0;
  store.set(key, { value, expires });
}

/**
 * Remove a key from the cache.
 *
 * @param {string} key The cache key to remove
 */
export function del(key) {
  store.delete(key);
}