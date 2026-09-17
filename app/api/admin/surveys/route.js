import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { createAdminSurvey, copyAdminSurvey, getAdminSurveys } from '@/lib/admin-surveys';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function GET(request) {
  const { t } = getRequestI18n(request, 'backend.adminSurveys');
  const sort = request.nextUrl.searchParams.get('sort') || 'title';
  const direction = request.nextUrl.searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
  try { return NextResponse.json(await getAdminSurveys(sort, direction), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return NextResponse.json({ message: t('load') }, { status: apiErrorStatus(error), headers: { 'Cache-Control': 'no-store' } }); }
}

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend.adminSurveys');
  try {
    const input = await readJsonObject(request);
    return NextResponse.json({ ok: true, survey: input.action === 'copy' ? await copyAdminSurvey(input.sourceId) : await createAdminSurvey(input) }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  }
  catch (error) { return NextResponse.json({ ok: false, message: t(error.message === 'Mock data cannot be changed' ? 'mock' : 'check') }, { status: apiErrorStatus(error), headers: { 'Cache-Control': 'no-store' } }); }
}
