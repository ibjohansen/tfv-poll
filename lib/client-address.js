import { isIP } from 'node:net';

// Netlify overwrites this header. Never trust arbitrary Forwarded/X-Forwarded-For.
export function trustedClientAddress(request, env = process.env) {
  const value = request.headers.get('x-nf-client-connection-ip')?.trim()
    || (env.NODE_ENV !== 'production' ? request.headers.get('x-real-ip')?.trim() : null);
  if (isIP(value || '') === 4) return value;
  if (isIP(value || '') !== 6 || value.includes('%')) return 'unknown';
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split('::');
  const first = left ? left.split(':') : [];
  const last = right ? right.split(':') : [];
  const groups = right === undefined ? first : [...first, ...Array(8 - first.length - last.length).fill('0'), ...last];
  const numbers = groups.map((group) => parseInt(group, 16));
  if (numbers.slice(0, 5).every((part) => part === 0) && numbers[5] === 65535) {
    return [numbers[6] >> 8, numbers[6] & 255, numbers[7] >> 8, numbers[7] & 255].join('.');
  }
  return `${numbers.slice(0, 4).map((part) => part.toString(16)).join(':')}::/64`;
}
