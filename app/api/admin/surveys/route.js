import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { createAdminSurvey, getAdminSurveys } from '@/lib/admin-surveys';

export const runtime = 'nodejs';

export async function GET(request) {
  const sort = request.nextUrl.searchParams.get('sort') || 'title';
  const direction = request.nextUrl.searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
  try { return NextResponse.json(await getAdminSurveys(sort, direction), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return NextResponse.json({ message: 'Kunne ikke hente undersøkelser.' }, { status: apiErrorStatus(error), headers: { 'Cache-Control': 'no-store' } }); }
}

export async function POST(request) {
  try { return NextResponse.json({ ok: true, survey: await createAdminSurvey(await readJsonObject(request)) }, { status: 201, headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return NextResponse.json({ ok: false, message: error.message === 'Mock data cannot be changed' ? 'Mock-data kan ikke endres.' : 'Kontroller navn, sluttdato og spørsmål.' }, { status: apiErrorStatus(error), headers: { 'Cache-Control': 'no-store' } }); }
}
