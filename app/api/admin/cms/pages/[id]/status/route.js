import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { setAdminCmsPageStatus } from '@/lib/cms-pages';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  try {
    const { status } = await readJsonObject(request);
    const page = await setAdminCmsPageStatus((await params).id, status);
    return NextResponse.json({ ok: true, page }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error);
    return NextResponse.json({ ok: false, message: t(status === 404 ? 'adminCms.missingLong' : 'adminCms.status') }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
