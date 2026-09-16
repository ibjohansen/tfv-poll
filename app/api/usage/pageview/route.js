import { recordUsagePageView } from '@/lib/usage-statistics';
import { normalizeUsageEvent } from '@/lib/usage-metrics';

export const runtime = 'nodejs';

function isSameOriginBrowserRequest(request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return origin === new URL(request.url).origin && (!fetchSite || fetchSite === 'same-origin');
}

export async function POST(request) {
  if (!isSameOriginBrowserRequest(request)) return Response.json({ message: 'Ugyldig forespørsel.' }, { status: 403 });
  try {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > 256) throw new Error('Invalid usage event');
    const raw = await request.text();
    if (raw.length > 256) throw new Error('Invalid usage event');
    await recordUsagePageView(normalizeUsageEvent(JSON.parse(raw)));
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError || error.message === 'Invalid usage event') {
      return Response.json({ message: 'Ugyldig forespørsel.' }, { status: 400 });
    }
    console.error('Usage page view unavailable', {
      name: error?.name || 'Error',
      code: error?.code || error?.cause?.code || undefined,
    });
    return Response.json({ message: 'Bruksstatistikk er midlertidig utilgjengelig.' }, { status: 503 });
  }
}
