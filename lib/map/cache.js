import { MapError } from './geo.js';

// Only public, normalized map data belongs here. Never cache register data or
// comparisons. Exact geometry avoids rounding away addresses on a boundary.
export function createMapCache({ ttlMs = 300_000, maxEntries = 8, now = Date.now } = {}) {
  const entries = new Map();
  const pending = new Map();
  return async function cached(key, loader) {
    for (const [id, entry] of entries) if (entry.expires <= now()) entries.delete(id);
    if (entries.has(key)) return structuredClone(entries.get(key).data);
    if (pending.has(key)) return structuredClone(await pending.get(key));
    if (pending.size >= 2) throw new MapError('Karttjenesten behandler andre søk. Prøv igjen om litt.', 503);
    const work = Promise.resolve().then(loader);
    pending.set(key, work);
    try {
      const data = await work;
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      // Bound normalized payloads as well as upstream response bodies.
      if (JSON.stringify(data).length <= 2_000_000) entries.set(key, { data: structuredClone(data), expires: now() + ttlMs });
      return structuredClone(data);
    } finally { pending.delete(key); }
  };
}
