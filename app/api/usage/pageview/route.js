import { recordUsageBatch, recordUsagePageView } from '@/lib/usage-statistics';
import { normalizeUsageBatch, normalizeUsageEvent } from '@/lib/usage-metrics';
import { getRequestI18n } from '@/lib/i18n/request';
import { isSameOriginRequest } from '@/lib/request-origin';
import { readJsonObject, apiErrorStatus } from '@/lib/api-errors';
import { isUsageRateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend');
  if (!isSameOriginRequest(request)) return Response.json({ message: t('api.invalidRequest') }, { status: 403 });
  if (isUsageRateLimited(request)) return Response.json({ message: t('api.tooManyRequests') }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  try {
    const parsed = await readJsonObject(request, 4096);
    if ('events' in parsed || 'webVitals' in parsed) await recordUsageBatch(normalizeUsageBatch(parsed));
    else await recordUsagePageView(normalizeUsageEvent(parsed));
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if ([400, 413, 415].includes(apiErrorStatus(error)) || ['Invalid usage event', 'Invalid web vital'].includes(error.message)) {
      const status = [413, 415].includes(apiErrorStatus(error)) ? apiErrorStatus(error) : 400;
      return Response.json({ message: t('api.invalidRequest') }, { status });
    }
    console.error('Usage page view unavailable', {
      name: error?.name || 'Error',
      code: error?.code || error?.cause?.code || undefined,
    });
    return Response.json({ message: t('usage.unavailable') }, { status: 503 });
  }
}
