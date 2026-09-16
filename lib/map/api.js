import 'server-only';
import { requirePermission } from '../admin-access.js';
import { isRateLimited } from '../rate-limit.js';
import { getRequestI18n } from '../i18n/request.js';
import { MapError } from './geo.js';
import { readLimitedJson } from './http.js';

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

export async function handleMapRequest(request, operation, { readOnly = false } = {}) {
  const { locale, t } = getRequestI18n(request, 'map.backend');
  try {
    const user = await requirePermission('members');
    const origin = request.headers.get('origin');
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new MapError('errors.invalidRequest', 403);
    if (isRateLimited(request)) throw new MapError('errors.rateLimit', 429);
    if (!readOnly && !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new MapError('errors.jsonRequired', 415);
    const input = readOnly ? null : await readLimitedJson(request, 32_000);
    if (!readOnly && (!input || typeof input !== 'object' || Array.isArray(input))) throw new MapError('errors.invalidOptions');
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);
    const response = await operation(input, user, { signal, locale, t });
    for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value);
    return response;
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : error.message === 'Forbidden' ? 403
      : error instanceof SyntaxError ? 400 : error instanceof MapError ? error.status : 500;
    const message = status === 401 ? t('errors.unauthorized') : status === 403 ? t('errors.forbidden')
      : error instanceof MapError ? t(error.code, error.values, t('errors.failed'))
        : status === 400 ? t('errors.invalidJson') : t('errors.failed');
    return Response.json({ ok: false, message }, { status, headers: { ...PRIVATE_HEADERS, ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
  }
}
