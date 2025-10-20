'use strict';

/**
 * Einfache In-Memory-SWR-Cache-Struktur
 */
function hours(n) { return n * 60 * 60 * 1000; }

function createSWRCache(ttlMs) {
  let store = { value: null, ts: 0 };
  async function get(getter) {
    const now = Date.now();
    if (!store.value || now - store.ts > ttlMs) {
      try {
        const v = await getter();
        store = { value: v, ts: now };
        return v;
      } catch (e) {
        // Bei Fehlern: letzte gute Version liefern (falls vorhanden)
        if (store.value) return store.value;
        throw e;
      }
    }
    return store.value;
  }
  function forceSet(value) { store = { value, ts: Date.now() }; }
  function ageMs() { return Date.now() - store.ts; }
  return { get, forceSet, ageMs };
}

module.exports = { createSWRCache, hours };
