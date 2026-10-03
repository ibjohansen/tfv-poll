import { getRequestI18n } from '@/lib/i18n/request';
import { NextResponse } from 'next/server';
import { getAdminCmsPageRevisions } from '@/lib/cms-pages';
import { apiErrorStatus } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  try {
    const revisions = await getAdminCmsPageRevisions((await params).id);
    return NextResponse.json({ ok: true, revisions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error.message === 'Unauthorized' ? t('adminCms.login') : t('adminCms.historyLoad') }, { status: apiErrorStatus(error), headers: { 'Cache-Control': 'no-store' } });
  }
}
