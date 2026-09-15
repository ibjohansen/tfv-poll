import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { setAdminCmsPageStatus } from '@/lib/cms-pages';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  try {
    const { status } = await readJsonObject(request);
    const page = await setAdminCmsPageStatus((await params).id, status);
    return NextResponse.json({ ok: true, page }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error);
    return NextResponse.json({ ok: false, message: status === 404 ? 'Siden finnes ikke lenger.' : 'Kunne ikke endre publiseringsstatus.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
