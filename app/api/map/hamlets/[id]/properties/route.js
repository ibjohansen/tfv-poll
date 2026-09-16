import { getPublicHamletProperties } from '@/lib/map/public-map-service';
import { MapError } from '@/lib/map/geo';
import { isPublicMapRateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (isPublicMapRateLimited(request)) {
    return Response.json({ ok: false, message: 'For mange kartoppslag. Vent litt og prøv igjen.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  }
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);
    const data = await getPublicHamletProperties((await params).id, { signal });
    return Response.json({ ok: true, ...data }, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=300' },
    });
  } catch (error) {
    const status = error instanceof MapError ? error.status : 500;
    const message = error instanceof MapError ? error.message : 'Kartdataene er midlertidig utilgjengelige. Prøv igjen senere.';
    return Response.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
