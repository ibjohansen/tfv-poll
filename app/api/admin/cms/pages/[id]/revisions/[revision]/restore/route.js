import { getRequestI18n } from '@/lib/i18n/request';
import { isSameOriginRequest } from '@/lib/request-origin';
import { NextResponse } from 'next/server';
import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { getAdminCmsPage, restoreAdminCmsPageRevision } from '@/lib/cms-pages';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (!isSameOriginRequest(request)) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  const values = await params;
  try {
    const page = await restoreAdminCmsPageRevision(values.id, Number(values.revision), await readJsonObject(request));
    return NextResponse.json({ ok: true, page }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error.code === 'CMS_VERSION_CONFLICT') return NextResponse.json({ ok: false, conflict: true, message: t('adminCms.conflict'), currentPage: await getAdminCmsPage(values.id).catch(() => null) }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ ok: false, message: error.message === 'Revision not found' ? t('adminCms.revisionMissing') : t('adminCms.revisionRestore') }, { status: apiErrorStatus(error), headers: { 'Cache-Control': 'no-store' } });
  }
}
