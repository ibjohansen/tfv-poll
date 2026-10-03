import { isSameOriginRequest } from '@/lib/request-origin';
import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { requestMemberAccess } from '@/lib/member-self-service';
import { isMemberAccessRateLimited } from '@/lib/rate-limit';
import { getSql } from '@/lib/db';
import { consumeMemberAccessLimits, getPublicBrowserMarker, PUBLIC_BROWSER_COOKIE } from '@/lib/shared-rate-limit';
import { getRequestI18n } from '@/lib/i18n/request';
import { readJsonObject, apiErrorStatus } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend');
  if (!isSameOriginRequest(request)) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  if (isMemberAccessRateLimited(request)) {
    return NextResponse.json({ ok: false, message: t('members.attempts') }, { status: 429 });
  }
  try {
    const input = await readJsonObject(request, 4096);
    const marker = getPublicBrowserMarker(request);
    const limited = await consumeMemberAccessLimits({
      request, identifier: input.identifier, browserMarker: marker.value, sql: getSql(),
    });
    if (limited) return NextResponse.json({ ok: false, message: t('members.attempts') }, { status: 429 });
    after(async () => {
      try { await requestMemberAccess(input.identifier); }
      catch (error) {
        console.error('Member access delivery failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
      }
    });
    const response = NextResponse.json({ ok: true, message: t('members.genericAccess') }, {
      status: 202, headers: { 'Cache-Control': 'no-store, private' },
    });
    if (marker.created) response.cookies.set(PUBLIC_BROWSER_COOKIE, marker.value, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    const status = apiErrorStatus(error);
    if (status < 500) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status, headers: { 'Cache-Control': 'no-store, private' } });
    console.error('Member access request failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
    return NextResponse.json({
      ok: false, message: t('members.unavailableWait'),
    }, { status: 503, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
