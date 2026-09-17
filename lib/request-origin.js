export function getApplicationOrigin(request, env = process.env) {
  const value = env.AUTH_URL || request.url;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  return url.origin;
}

export function isSameOriginRequest(request, env = process.env) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const applicationOrigin = getApplicationOrigin(request, env);
  if (!applicationOrigin) return false;
  try {
    return new URL(origin).origin === applicationOrigin;
  } catch {
    return false;
  }
}
