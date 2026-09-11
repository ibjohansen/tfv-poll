import { NextResponse } from 'next/server';
import { createMembershipRequest } from '@/lib/member-self-service';
import { isMemberAccessRateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  if (isMemberAccessRateLimited(request)) return NextResponse.json({ ok: false, message: 'For mange forsøk. Vent litt før du prøver igjen.' }, { status: 429 });
  try {
    await createMembershipRequest(await request.json());
    return NextResponse.json({
      ok: true,
      message: 'Hvis tomten ikke allerede er registrert, sender vi en bekreftelseslenke til hovedadressen du oppga.',
    }, { status: 202, headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('Membership request failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
    return NextResponse.json({ ok: false, message: 'Forespørselen kunne ikke behandles. Kontroller feltene og prøv igjen.' }, { status: 400, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
