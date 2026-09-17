import { recordUsagePageView } from '@/lib/usage-statistics';
import { normalizeUsageEvent } from '@/lib/usage-metrics';
import { getRequestI18n } from '@/lib/i18n/request';
import { isSameOriginRequest } from '@/lib/request-origin';

export const runtime = 'nodejs';

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend');
  if (!isSameOriginRequest(request)) return Response.json({ message: t('api.invalidRequest') }, { status: 403 });
  try {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > 256) throw new Error('Invalid usage event');
    const raw = await request.text();
    if (raw.length > 256) throw new Error('Invalid usage event');
    await recordUsagePageView(normalizeUsageEvent(JSON.parse(raw)));
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError || error.message === 'Invalid usage event') {
      return Response.json({ message: t('api.invalidRequest') }, { status: 400 });
    }
    console.error('Usage page view unavailable', {
      name: error?.name || 'Error',
      code: error?.code || error?.cause?.code || undefined,
    });
    return Response.json({ message: t('usage.unavailable') }, { status: 503 });
  }
}
