const requests = new Map();

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

export function clearRateLimits() {
  requests.clear();
}
