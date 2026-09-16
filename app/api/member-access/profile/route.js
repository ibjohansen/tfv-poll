import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createOwnershipTransferRequest, requestMemberEmailChange, updateMemberSelfServiceProfile } from '@/lib/member-self-service';
import { memberSessionCookieName } from '@/lib/member-self-service-utils';
import { isMemberMutationRateLimited } from '@/lib/rate-limit';
import { apiErrorStatus } from '@/lib/api-errors';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export async function PATCH(request) {
  const { t } = getRequestI18n(request, 'backend');
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  if (isMemberMutationRateLimited(request)) return NextResponse.json({ ok: false, message: t('members.changes') }, { status: 429 });
  const secret = (await cookies()).get(memberSessionCookieName())?.value;
  try {
    const input = await request.json().catch(() => ({}));
    if (!input || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 400 });
    if (input.action === 'ownership_transfer') {
      const result = await createOwnershipTransferRequest(secret, input);
      return NextResponse.json({ ok: true, request: result, message: t('members.ownershipSent') }, { headers: { 'Cache-Control': 'no-store, private' } });
    }
    if (input.action === 'email_change') {
      await requestMemberEmailChange(secret, input.primary_contact_email, { memberId: input.memberId });
      return NextResponse.json({ ok: true, message: t('members.emailSent') }, { headers: { 'Cache-Control': 'no-store, private' } });
    }
    if (input.action !== 'update') return NextResponse.json({ ok: false, message: t('members.invalidAction') }, { status: 400 });
    const member = await updateMemberSelfServiceProfile(secret, input);
    return NextResponse.json({ ok: true, member, message: t('members.updated') }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    const status = apiErrorStatus(error);
    const message = status >= 500 ? t('members.unavailable') : status === 401 ? t('members.invalidAccess')
      : status === 409 ? t('members.ownershipPending')
        : error.message === 'Primary email change requires verification'
          ? t('members.emailFlow')
          : error.message === 'Email delivery unavailable'
            ? t('members.deliveryUnavailable') : t('members.checkContact');
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
