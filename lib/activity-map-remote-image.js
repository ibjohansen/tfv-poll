import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAXIMUM_SOURCE_BYTES = 10 * 1024 * 1024;
const CONTENT_TYPE_EXTENSION = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export function normalizeActivityImageSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value.trim())) throw new Error('Invalid activity image URL');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Invalid activity image URL'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port || url.href.length > 2048) {
    throw new Error('Invalid activity image URL');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Invalid activity image URL');
  }
  url.hash = '';
  return url.href;
}

function isPublicIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || (b === 168) || (b === 0 && c === 2)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}

function isPublicIpv6(address) {
  const normalized = address.toLowerCase().split('%')[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isPublicIpv4(mapped[1]);
  if (normalized.startsWith('::ffff:')) return false;
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('2001:db8:')) return false;
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16);
  return Number.isInteger(first) && (first & 0xfe00) !== 0xfc00 && (first & 0xffc0) !== 0xfe80 && (first & 0xff00) !== 0xff00;
}

export function isPublicActivityImageAddress(address) {
  const version = isIP(address);
  return version === 4 ? isPublicIpv4(address) : version === 6 ? isPublicIpv6(address) : false;
}

async function boundedBody(response) {
  const announced = Number(response.headers.get('content-length') || 0);
  if (announced > MAXIMUM_SOURCE_BYTES) throw new Error('Activity image too large');
  if (!response.body) throw new Error('Invalid activity image');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAXIMUM_SOURCE_BYTES) throw new Error('Activity image too large');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, size);
}

export async function downloadActivityImageSource(value, options = {}) {
  const sourceUrl = normalizeActivityImageSourceUrl(value);
  const parsed = new URL(sourceUrl);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const lookup = options.lookup || dnsLookup;
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicActivityImageAddress(address))) throw new Error('Invalid activity image URL');
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(sourceUrl, {
    cache: 'no-store', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
    signal: options.signal || AbortSignal.timeout(15_000), headers: { Accept: 'image/webp,image/png,image/jpeg' },
  });
  if (!response.ok || response.redirected) throw new Error('Activity image unavailable');
  const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const extension = CONTENT_TYPE_EXTENSION.get(mimeType);
  if (!extension) throw new Error('Invalid activity image');
  const bytes = await boundedBody(response);
  return {
    sourceUrl,
    file: {
      name: `remote-image.${extension}`,
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    },
  };
}
