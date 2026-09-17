import { apiErrorStatus } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { approveMatrikkelItem } from '@/lib/matrikkel-sync';
import { getRequestI18n } from '@/lib/i18n/request';
import { isSameOriginRequest } from '@/lib/request-origin';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  }
  try {
    const values = await params;
    const run = await approveMatrikkelItem(values.id, values.memberId);
    return NextResponse.json({ ok: true, run }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error, 403);
    console.error('Matrikkel review approval failed', { message: error.message, code: error.code || error.cause?.code });
    return NextResponse.json({ ok: false, message: t(status === 403 ? 'api.forbidden' : 'adminMatrikkel.approve') }, { status });
  }
}
