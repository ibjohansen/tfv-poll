import { trustedClientAddress } from './client-address.js';

// Per-instance backstop only; distributed enforcement remains a hosting/DB concern.
// Bounded stores prevent a stream of unique addresses retaining memory forever.
export function createRateLimiter(limit, windowMs, maxEntries = 10_000) {
  const entries = new Map();
  let nextCleanup = 0;
  return {
    consume(key, now = Date.now()) {
      if (now >= nextCleanup || entries.size >= maxEntries) {
        for (const [id, item] of entries) if (now - item.startedAt >= windowMs) entries.delete(id);
        nextCleanup = now + 60_000;
      }
      const entry = entries.get(key);
      if (!entry || now - entry.startedAt >= windowMs) {
        // Fail closed at capacity instead of evicting another client's active limit.
        if (!entry && entries.size >= maxEntries) return true;
        entries.set(key, { startedAt: now, count: 1 });
        return false;
      }
      entry.count += 1;
      return entry.count > limit;
    },
    clear() { entries.clear(); nextCleanup = 0; },
  };
}

const general = createRateLimiter(20, 60_000);
const email = createRateLimiter(5, 60_000);
const access = createRateLimiter(5, 15 * 60_000);
const mutations = createRateLimiter(10, 60_000);
const publicMap = createRateLimiter(20, 60_000);
const usage = createRateLimiter(60, 60_000);
export const isRateLimited = (request, now) => general.consume(trustedClientAddress(request), now);
export const isEmailRateLimited = (request, now) => email.consume(trustedClientAddress(request), now);
export const isMemberAccessRateLimited = (request, now) => access.consume(trustedClientAddress(request), now);
export const isMemberMutationRateLimited = (request, now) => mutations.consume(trustedClientAddress(request), now);
export const isPublicMapRateLimited = (request, now) => publicMap.consume(trustedClientAddress(request), now);
export const isUsageRateLimited = (request, now) => usage.consume(trustedClientAddress(request), now);
export function clearRateLimits() {
  for (const limiter of [general, email, access, mutations, publicMap, usage]) limiter.clear();
}
