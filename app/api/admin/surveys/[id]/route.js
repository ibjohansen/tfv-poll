import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { deleteAdminSurvey, updateAdminSurvey } from '@/lib/admin-surveys';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminSurveys');
  try {
    const survey = await updateAdminSurvey((await params).id, await readJsonObject(request));
    return NextResponse.json({ ok: true, survey }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error);
    return NextResponse.json({ ok: false, message: t('save') }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminSurveys');
  try { await deleteAdminSurvey((await params).id); return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    const id = (await params).id;
    const code = error.code || error.cause?.code;
    console.error('Admin survey delete failed', { id, code, message: error.message });
    const status = apiErrorStatus(error);
    const message = code === '42703'
      ? t('schema')
      : error.message === 'Invalid survey ID'
        ? t('oldId')
      : error.message === 'Survey not found'
        ? t('missing')
        : t('delete');
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
