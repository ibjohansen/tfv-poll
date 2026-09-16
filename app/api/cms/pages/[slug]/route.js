import { NextResponse } from 'next/server';
import { getPublishedCmsPage } from '@/lib/cms-pages';
import { isValidCmsSlug } from '@/lib/cms-validation';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.cms');
  const slug = (await params).slug;
  if (!isValidCmsSlug(slug)) return NextResponse.json({ ok: false, message: t('missing') }, { status: 404 });
  try {
    const page = await getPublishedCmsPage(slug);
    if (!page) return NextResponse.json({ ok: false, message: t('unpublished') }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ ok: true, page }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Public CMS page fetch failed', { slug, code: error.code || error.cause?.code, message: error.message });
    return NextResponse.json({ ok: false, message: t('unavailable') }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
