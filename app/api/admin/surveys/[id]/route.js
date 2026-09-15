import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { deleteAdminSurvey, updateAdminSurvey } from '@/lib/admin-surveys';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    const survey = await updateAdminSurvey((await params).id, await readJsonObject(request));
    return NextResponse.json({ ok: true, survey }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = apiErrorStatus(error);
    return NextResponse.json({ ok: false, message: 'Kunne ikke lagre undersøkelsen.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(_request, { params }) {
  try { await deleteAdminSurvey((await params).id); return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    const id = (await params).id;
    const code = error.code || error.cause?.code;
    console.error('Admin survey delete failed', { id, code, message: error.message });
    const status = apiErrorStatus(error);
    const message = code === '42703'
      ? 'Databasen mangler oppdatert skjema. Kjør npm run db:setup og prøv igjen.'
      : error.message === 'Invalid survey ID'
        ? 'Undersøkelsen har en eldre ID. Kjør npm run db:setup og prøv igjen.'
      : error.message === 'Survey not found'
        ? 'Undersøkelsen finnes ikke lenger.'
        : 'Kunne ikke slette undersøkelsen.';
    return NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
