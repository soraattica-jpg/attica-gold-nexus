const CACHE_IGNORED_QUERY_KEYS = new Set(['sync', 'forceSync', 'refresh', '_', 't']);

export function shouldBypassResponseCache(query = {}) {
  // A supplied token requests fresh local reporting data. It must not imply a
  // remote Meta/Google/customer-data synchronization.
  return String(query.refresh ?? '').trim() !== '';
}

export function getResponseCacheKey(query = {}) {
  const normalized = {};
  for (const key of Object.keys(query).sort()) {
    if (CACHE_IGNORED_QUERY_KEYS.has(key)) continue;
    normalized[key] = String(query[key] ?? '');
  }
  return JSON.stringify(normalized);
}

export function createResponseCache({ now = () => Date.now(), ttlMs = 60_000 } = {}) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value) {
      entries.set(key, { value, expiresAt: now() + ttlMs });
      return value;
    },
    clear() {
      entries.clear();
    },
  };
}
