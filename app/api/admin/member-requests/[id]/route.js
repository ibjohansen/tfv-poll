import { NextResponse } from 'next/server';
import { resolveAdminMemberRequest } from '@/lib/member-self-service';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export async function PATCH(request, { params }) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  try {
    const input = await request.json().catch(() => ({}));
    const result = await resolveAdminMemberRequest((await params).id, input.action);
    return NextResponse.json({ ok: true, request: result }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 403
      : error.message === 'Member request not found' ? 404
        : error.message === 'Member request conflict' ? 409 : 400;
    const message = status === 403 ? 'Du har ikke tilgang.'
      : status === 404 ? 'Forespørselen finnes ikke lenger.'
        : status === 409 ? 'Tomten eller medlemmet må kontrolleres før godkjenning.'
          : 'Forespørselen kunne ikke behandles.';
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
