import { NextResponse } from 'next/server';
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n/config';

export const runtime = 'nodejs';

export async function POST(request) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== request.nextUrl.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')
    || Number(request.headers.get('content-length') || 0) > 256) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  let input;
  try { input = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const locale = normalizeLocale(input?.locale);
  if (!locale || typeof input?.locale !== 'string' || Object.keys(input || {}).some((key) => key !== 'locale')) return NextResponse.json({ ok: false }, { status: 400 });
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 31_536_000,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
