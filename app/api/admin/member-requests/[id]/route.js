import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { resolveAdminMemberRequest, updateAdminMemberRequestProperty } from '@/lib/member-self-service';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export async function PATCH(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  try {
    const input = await readJsonObject(request);
    const id = (await params).id;
    const result = input.action === 'check_property' || input.action === 'confirm_property'
      ? await updateAdminMemberRequestProperty(id, input, input.action === 'check_property')
      : await resolveAdminMemberRequest(id, input.action);
    return NextResponse.json({ ok: true, request: result }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    const status = apiErrorStatus(error, 403);
    const message = status === 403 ? t('api.forbidden')
      : status === 404 ? t('adminRequests.missing')
        : status === 409 ? t('adminRequests.cadastral')
          : t('adminRequests.process');
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
