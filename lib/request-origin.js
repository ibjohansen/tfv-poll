function isHostedEnvironment(env) {
  return env.APP_ENVIRONMENT ? env.APP_ENVIRONMENT !== 'development' : env.NODE_ENV === 'production';
}

export function getApplicationOrigin(request, env = process.env) {
  const production = isHostedEnvironment(env);
  const value = env.AUTH_URL || (!production ? request?.url : null);
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (production && (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash)) return null;
  return url.origin;
}

export function isSameOriginRequest(request, env = process.env) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) {
    // Browser mutations require Origin in production. Webhooks/background jobs
    // use their own explicit authentication and do not call this helper.
    return !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
      || !isHostedEnvironment(env);
  }
  const applicationOrigin = getApplicationOrigin(request, env);
  if (!applicationOrigin) return false;
  try {
    const parsed = new URL(origin);
    return !parsed.username && !parsed.password && parsed.origin === origin && origin === applicationOrigin;
  } catch {
    return false;
  }
}

export function trustedJobOrigin(candidate, env = process.env) {
  const origin = getApplicationOrigin({ url: candidate }, env);
  if (!origin || !origin.startsWith('https://')) throw new Error('Invalid job origin');
  return origin;
}
