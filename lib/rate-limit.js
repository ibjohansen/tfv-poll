const requests = new Map();
const emailRequests = new Map();
const memberAccessRequests = new Map();
const memberSelfServiceMutations = new Map();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

function clientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

// This is a per-instance backstop. Production must also enforce the same route
// limit in the hosting provider/WAF, where it is shared across instances.
export function isRateLimited(request, now = Date.now()) {
  const key = clientKey(request);
  const entry = requests.get(key);
  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    requests.set(key, { startedAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

export function isEmailRateLimited(request, now = Date.now()) {
  const key = clientKey(request);
  const entry = emailRequests.get(key);
  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    emailRequests.set(key, { startedAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > 5;
}

function isLimited(store, request, limit, windowMs, now) {
  const key = clientKey(request);
  const entry = store.get(key);
  if (!entry || now - entry.startedAt >= windowMs) {
    store.set(key, { startedAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function isMemberAccessRateLimited(request, now = Date.now()) {
  return isLimited(memberAccessRequests, request, 5, 15 * 60_000, now);
}

export function isMemberMutationRateLimited(request, now = Date.now()) {
  return isLimited(memberSelfServiceMutations, request, 10, 60_000, now);
}

export function clearRateLimits() {
  requests.clear();
  emailRequests.clear();
  memberAccessRequests.clear();
  memberSelfServiceMutations.clear();
}
