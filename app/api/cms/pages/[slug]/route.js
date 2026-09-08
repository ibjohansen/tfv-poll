import { NextResponse } from 'next/server';
import { getPublishedCmsPage } from '@/lib/cms-pages';
import { isValidCmsSlug } from '@/lib/cms-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const slug = (await params).slug;
  if (!isValidCmsSlug(slug)) return NextResponse.json({ ok: false, message: 'Siden finnes ikke.' }, { status: 404 });
  try {
    const page = await getPublishedCmsPage(slug);
    if (!page) return NextResponse.json({ ok: false, message: 'Siden finnes ikke eller er ikke publisert.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ ok: true, page }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Public CMS page fetch failed', { slug, code: error.code || error.cause?.code, message: error.message });
    return NextResponse.json({ ok: false, message: 'Artikkelen er midlertidig utilgjengelig.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
