import { getPublicHamletProperties } from '@/lib/map/public-map-service';
import { MapError } from '@/lib/map/geo';
import { isPublicMapRateLimited } from '@/lib/rate-limit';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const startedAt = Date.now();
  const { locale, t: backendT } = getRequestI18n(request, 'backend');
  const { t: mapT } = getRequestI18n(request, 'map.backend');
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.json({ ok: false, message: backendT('api.invalidRequest') }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (isPublicMapRateLimited(request)) {
    return Response.json({ ok: false, message: backendT('map.rateLimit') },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  }
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);
    const data = await getPublicHamletProperties((await params).id, { signal, locale, t: mapT });
    return Response.json({ ok: true, ...data }, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=300', 'Server-Timing': `map_lookup;dur=${(Date.now() - startedAt).toFixed(1)}` },
    });
  } catch (error) {
    const status = error instanceof MapError ? error.status : 500;
    const message = error instanceof MapError ? mapT(error.code, error.values, backendT('map.unavailable')) : backendT('map.unavailable');
    return Response.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
