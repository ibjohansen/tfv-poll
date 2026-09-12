import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createOwnershipTransferRequest, requestMemberEmailChange, updateMemberSelfServiceProfile } from '@/lib/member-self-service';
import { memberSessionCookieName } from '@/lib/member-self-service-utils';
import { isMemberMutationRateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export async function PATCH(request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  if (isMemberMutationRateLimited(request)) return NextResponse.json({ ok: false, message: 'For mange endringer. Vent litt og prøv igjen.' }, { status: 429 });
  const secret = (await cookies()).get(memberSessionCookieName())?.value;
  try {
    const input = await request.json().catch(() => ({}));
    if (input.action === 'ownership_transfer') {
      const result = await createOwnershipTransferRequest(secret, input);
      return NextResponse.json({ ok: true, request: result, message: 'Eierskiftet er sendt til behandling.' }, { headers: { 'Cache-Control': 'no-store, private' } });
    }
    if (input.action === 'email_change') {
      await requestMemberEmailChange(secret, input.primary_contact_email);
      return NextResponse.json({ ok: true, message: 'En bekreftelseslenke er sendt til den nåværende hoved-e-postadressen.' }, { headers: { 'Cache-Control': 'no-store, private' } });
    }
    if (input.action !== 'update') return NextResponse.json({ ok: false, message: 'Ugyldig handling.' }, { status: 400 });
    const member = await updateMemberSelfServiceProfile(secret, input);
    return NextResponse.json({ ok: true, member, message: 'Kontaktopplysningene er oppdatert.' }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    const status = error.message === 'Invalid member session' ? 401
      : error.message === 'Ownership request already pending' ? 409 : 400;
    const message = status === 401 ? 'Tilgangen er ugyldig eller utløpt.'
      : status === 409 ? 'Det finnes allerede en eierskifteforespørsel til behandling.'
        : error.message === 'Primary email change requires verification'
          ? 'Hoved-e-post må endres med den separate bekreftelsesflyten.'
          : error.message === 'Email delivery unavailable'
            ? 'Vi kan ikke sende bekreftelsen til den registrerte adressen. Kontakt Turufjell Vel.'
            : 'Kontroller kontaktopplysningene.';
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
