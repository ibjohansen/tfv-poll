import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { requestMemberAccess } from '@/lib/member-self-service';
import { GENERIC_MEMBER_ACCESS_MESSAGE } from '@/lib/member-self-service-utils';
import { isMemberAccessRateLimited } from '@/lib/rate-limit';
import { getSql } from '@/lib/db';
import { consumeMemberAccessLimits, getPublicBrowserMarker, PUBLIC_BROWSER_COOKIE } from '@/lib/shared-rate-limit';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  if (isMemberAccessRateLimited(request)) {
    return NextResponse.json({ ok: false, message: 'For mange forsøk. Vent litt før du prøver igjen.' }, { status: 429 });
  }
  try {
    const input = await request.json().catch(() => ({}));
    const marker = getPublicBrowserMarker(request);
    const limited = await consumeMemberAccessLimits({
      request, identifier: input.identifier, browserMarker: marker.value, sql: getSql(),
    });
    if (limited) return NextResponse.json({ ok: false, message: 'For mange forsøk. Vent litt før du prøver igjen.' }, { status: 429 });
    after(async () => {
      try { await requestMemberAccess(input.identifier); }
      catch (error) {
        console.error('Member access delivery failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
      }
    });
    const response = NextResponse.json({ ok: true, message: GENERIC_MEMBER_ACCESS_MESSAGE }, {
      status: 202, headers: { 'Cache-Control': 'no-store, private' },
    });
    if (marker.created) response.cookies.set(PUBLIC_BROWSER_COOKIE, marker.value, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    console.error('Member access request failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
    return NextResponse.json({
      ok: false, message: 'Tjenesten er midlertidig utilgjengelig. Vent litt og prøv igjen.',
    }, { status: 503, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
