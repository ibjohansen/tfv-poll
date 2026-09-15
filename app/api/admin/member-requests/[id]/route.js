import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { resolveAdminMemberRequest, updateAdminMemberRequestProperty } from '@/lib/member-self-service';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export async function PATCH(request, { params }) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: 'Ugyldig forespørsel.' }, { status: 403 });
  try {
    const input = await readJsonObject(request);
    const id = (await params).id;
    const result = input.action === 'check_property' || input.action === 'confirm_property'
      ? await updateAdminMemberRequestProperty(id, input, input.action === 'check_property')
      : await resolveAdminMemberRequest(id, input.action);
    return NextResponse.json({ ok: true, request: result }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    const status = apiErrorStatus(error, 403);
    const message = status === 403 ? 'Du har ikke tilgang.'
      : status === 404 ? 'Forespørselen finnes ikke lenger.'
        : status === 409 ? 'Matrikkelopplysningene må avklares før godkjenning.'
          : 'Forespørselen kunne ikke behandles.';
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
