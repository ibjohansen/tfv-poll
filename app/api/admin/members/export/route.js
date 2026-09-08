import { createMemberExport } from '@/lib/member-export';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

function exportBaseUrl(request) {
  const url = new URL(process.env.AUTH_URL || request.nextUrl.origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid base URL');
  return url.origin;
}

export async function POST(request) {
  if (!sameOrigin(request)) return Response.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  try {
    const input = await request.json();
    const result = await createMemberExport({ ...input, baseUrl: exportBaseUrl(request) });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="medlemsregister-${date}.xlsx"`,
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401
      : ['Invalid member selection', 'Invalid survey ID', 'No members selected'].includes(error.message) ? 400
        : error.message === 'Survey not found' ? 404 : 500;
    console.error('Admin member export failed', { code: error.code || error.cause?.code, message: error.message });
    const message = error.message === 'No members selected' ? 'Ingen medlemmer er valgt.'
      : error.message === 'Survey not found' ? 'Undersøkelsen finnes ikke.'
        : status === 400 ? 'Kontroller eksportvalgene.' : 'Kunne ikke generere Excel-filen.';
    return Response.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
