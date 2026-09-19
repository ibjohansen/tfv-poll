import { NextResponse } from 'next/server';
import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { getAdminCmsPage, restoreAdminCmsPageRevision } from '@/lib/cms-pages';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  const values = await params;
  try {
    const page = await restoreAdminCmsPageRevision(values.id, Number(values.revision), await readJsonObject(request));
    return NextResponse.json({ ok: true, page }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error.code === 'CMS_VERSION_CONFLICT') return NextResponse.json({ ok: false, conflict: true, message: 'Siden er endret i en annen fane.', currentPage: await getAdminCmsPage(values.id).catch(() => null) }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ ok: false, message: error.message === 'Revision not found' ? 'Revisjonen finnes ikke.' : 'Kunne ikke gjenopprette revisjonen.' }, { status: apiErrorStatus(error), headers: { 'Cache-Control': 'no-store' } });
  }
}
