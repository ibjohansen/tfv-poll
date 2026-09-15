import 'server-only';
import { requirePermission } from '../admin-access.js';
import { isRateLimited } from '../rate-limit.js';
import { MapError } from './geo.js';
import { readLimitedJson } from './http.js';

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

export async function handleMapRequest(request, operation) {
  try {
    const user = await requirePermission('members');
    const origin = request.headers.get('origin');
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new MapError('Ugyldig forespørsel.', 403);
    if (isRateLimited(request)) throw new MapError('For mange søk. Vent ett minutt og prøv igjen.', 429);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new MapError('Send søkeområdet som JSON.', 415);
    const input = await readLimitedJson(request, 32_000);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MapError('Ugyldige søkevalg.');
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);
    const response = await operation(input, user, { signal });
    for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value);
    return response;
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : error.message === 'Forbidden' ? 403
      : error instanceof SyntaxError ? 400 : error instanceof MapError ? error.status : 500;
    const message = status === 401 ? 'Innlogging kreves.' : status === 403 ? 'Du har ikke tilgang til denne forespørselen.'
      : error instanceof MapError ? error.message : status === 400 ? 'Ugyldig JSON.' : 'Kartfunksjonen kunne ikke fullføre forespørselen. Prøv igjen.';
    return Response.json({ ok: false, message }, { status, headers: { ...PRIVATE_HEADERS, ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
  }
}
