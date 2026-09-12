import { NextResponse } from 'next/server';
import { createMembershipRequest } from '@/lib/member-self-service';
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
  if (isMemberAccessRateLimited(request)) return NextResponse.json({ ok: false, message: 'For mange forsøk. Vent litt før du prøver igjen.' }, { status: 429 });
  try {
    const input = await request.json();
    const marker = getPublicBrowserMarker(request);
    const identifier = input.primary_contact_email || input.h_number || input.street_address;
    const limited = await consumeMemberAccessLimits({
      request, identifier, browserMarker: marker.value, sql: getSql(), scopePrefix: 'membership-request',
    });
    if (limited) return NextResponse.json({ ok: false, message: 'For mange forsøk. Vent litt før du prøver igjen.' }, { status: 429 });
    await createMembershipRequest(input);
    const response = NextResponse.json({
      ok: true,
      message: 'Hvis tomten ikke allerede er registrert, sender vi en bekreftelseslenke til hovedadressen du oppga.',
    }, { status: 202, headers: { 'Cache-Control': 'no-store, private' } });
    if (marker.created) response.cookies.set(PUBLIC_BROWSER_COOKIE, marker.value, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    console.error('Membership request failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
    return NextResponse.json({ ok: false, message: 'Forespørselen kunne ikke behandles. Kontroller feltene og prøv igjen.' }, { status: 400, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
