import { NextResponse } from 'next/server';
import { requestMemberAccess } from '@/lib/member-self-service';
import { isMemberAccessRateLimited } from '@/lib/rate-limit';

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
    await requestMemberAccess(input.identifier);
  } catch (error) {
    console.error('Member access request failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
  }
  return NextResponse.json({
    ok: true,
    message: 'Hvis opplysningene samsvarer med et medlem som har registrert hoved-e-post, sender vi en personlig lenke dit.',
  }, { status: 202, headers: { 'Cache-Control': 'no-store, private' } });
}
