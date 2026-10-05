import { downloadCmsObject } from '@/lib/cms-storage';
import { getActivityMapCatalogIcon } from '@/lib/activity-map-icon-service';

export const runtime = 'nodejs';

function identityFromSegments(segments) {
  const [kind, ...rest] = segments || [];
  const valid = (value) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value || '');
  if (kind === 'category' && rest.length === 1 && valid(rest[0])) return { kind, id: rest[0] };
  if (kind === 'type' && rest.length === 2 && rest.every(valid)) return { kind, category: rest[0], id: rest[1] };
  if (kind === 'subtype' && rest.length === 3 && rest.every(valid)) return { kind, category: rest[0], featureType: rest[1], id: rest[2] };
  return null;
}

export async function GET(request, { params }) {
  try {
    const identity = identityFromSegments((await params).segments);
    if (!identity) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const icon = await getActivityMapCatalogIcon(identity);
    if (!icon) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const etag = `"activity-map-icon-${icon.storageKey.slice('activity-map/icons/'.length, -'.svg'.length)}"`;
    const headers = {
      ETag: etag,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
    };
    if (request.headers.get('if-none-match')?.split(',').map((value) => value.trim()).includes(etag)) {
      return new Response(null, { status: 304, headers });
    }
    const object = await downloadCmsObject(icon.storageKey);
    if (!object.Body) throw new Error('Missing icon body');
    const bytes = await object.Body.transformToByteArray();
    return new Response(bytes, { headers: { ...headers, 'Content-Type': 'image/svg+xml', 'Content-Length': String(bytes.length) } });
  } catch {
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
