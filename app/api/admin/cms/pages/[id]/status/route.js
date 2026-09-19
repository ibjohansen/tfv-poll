import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { getAdminCmsPage, setAdminCmsPageStatus } from '@/lib/cms-pages';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  try {
    const input = await readJsonObject(request);
    const page = await setAdminCmsPageStatus((await params).id, input.status, input);
    return NextResponse.json({ ok: true, page }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const id = (await params).id;
    if (error.code === 'CMS_VERSION_CONFLICT') return NextResponse.json({ ok: false, conflict: true, message: 'Siden er endret i en annen fane.', currentPage: await getAdminCmsPage(id).catch(() => null) }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    if (error.code === 'CMS_PUBLICATION_QUALITY') return NextResponse.json({ ok: false, message: 'Kvalitetskontrollen må løses før publisering.', ...error.details }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
    const status = apiErrorStatus(error);
    return NextResponse.json({ ok: false, message: t(status === 404 ? 'adminCms.missingLong' : 'adminCms.status') }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
