import { randomBytes } from 'node:crypto';
import { assertDatabaseEnvironment } from './security-config.js';
import { recordSecurityEvent, securityKeyHmac } from './security-events.js';

export const PUBLIC_BROWSER_COOKIE = 'tfv_public_session';

function cookieValue(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function getPublicBrowserMarker(request) {
  const current = cookieValue(request, PUBLIC_BROWSER_COOKIE);
  if (/^[a-f0-9]{32}$/i.test(current || '')) return { value: current, created: false };
  return { value: randomBytes(16).toString('hex'), created: true };
}

export function trustedClientAddress(request, env = process.env) {
  const netlifyAddress = request.headers.get('x-nf-client-connection-ip');
  if (netlifyAddress) return netlifyAddress.trim();
  if (env.NODE_ENV !== 'production') return request.headers.get('x-real-ip')?.trim() || 'local';
  return 'unknown';
}

function bucketStart(now, windowSeconds) {
  return new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
}

export async function consumeMemberAccessLimits({
  request, identifier, browserMarker, sql, env = process.env, now = new Date(), scopePrefix = 'member-access',
}) {
  await assertDatabaseEnvironment(sql, env);
  await sql`DELETE FROM security_rate_limits WHERE expires_at < NOW()`;
  const limits = [
    { scope: `${scopePrefix}-client`, key: trustedClientAddress(request, env), limit: 5, windowSeconds: 15 * 60 },
    { scope: `${scopePrefix}-lookup`, key: String(identifier || '').trim().toLowerCase(), limit: 3, windowSeconds: 15 * 60 },
    { scope: `${scopePrefix}-browser`, key: browserMarker, limit: 5, windowSeconds: 15 * 60 },
    { scope: `${scopePrefix}-global`, key: 'all', limit: 250, windowSeconds: 15 * 60 },
  ];
  const operations = limits.map(({ scope, key, windowSeconds }) => {
    const start = bucketStart(now, windowSeconds);
    return sql`
      INSERT INTO security_rate_limits (scope, key_hash, bucket_start, request_count, expires_at)
      VALUES (${scope}, ${securityKeyHmac(`${scope}:${key}`, env)}, ${start}, 1, ${new Date(start.getTime() + (windowSeconds * 2000))})
      ON CONFLICT (scope, key_hash, bucket_start) DO UPDATE
      SET request_count = security_rate_limits.request_count + 1
      RETURNING request_count
    `;
  });
  const results = await sql.transaction(operations);
  const exceeded = limits.find((limit, index) => Number(results[index][0]?.request_count || 0) > limit.limit);
  if (exceeded) {
    await recordSecurityEvent(sql, {
      eventType: 'rate_limit', actorType: 'public', result: 'blocked',
      key: `${exceeded.scope}:${exceeded.key}`, metadata: { scope: exceeded.scope },
    }, env);
  }
  return Boolean(exceeded);
}
