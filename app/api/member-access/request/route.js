import { NextResponse } from 'next/server';
import { lookupMemberAccess, requestMemberAccess } from '@/lib/member-self-service';
import { formatMemberLookupMessage } from '@/lib/member-self-service-utils';
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
    if (!['search', 'send'].includes(input.action)) {
      return NextResponse.json({ ok: false, message: 'Ugyldig handling.' }, { status: 400 });
    }
    const result = input.action === 'send'
      ? await requestMemberAccess(input.identifier)
      : await lookupMemberAccess(input.identifier);
    return NextResponse.json({
      ok: true,
      found: result.found,
      canSend: result.found && result.deliveryAvailable !== false,
      message: formatMemberLookupMessage({ ...result, emailRequested: input.action === 'send' }),
    }, { status: 202, headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('Member access request failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
    return NextResponse.json({
      ok: false,
      message: 'Oppslaget kunne ikke fullføres. Vent litt og prøv igjen.',
    }, { status: 503, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
