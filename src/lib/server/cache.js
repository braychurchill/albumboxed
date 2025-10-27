// @ts-check

/** @typedef {{ data: any, expires: number }} Entry */
/** @type {Map<string, Entry>} */
const cache = new Map();

/**
 * Get a cached value if fresh.
 * @param {string} key
 * @returns {any | undefined}
 */
export function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return undefined;
  }
  return hit.data;
}

/**
 * Put a value with TTL (ms).
 * @param {string} key
 * @param {any} data
 * @param {number} ttlMs
 */
export function cacheSet(key, data, ttlMs) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}