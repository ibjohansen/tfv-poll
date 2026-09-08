import { getAdminSurveyResults } from '@/lib/admin-survey-results';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const results = await getAdminSurveyResults((await params).id);
    return Response.json({ ok: true, results }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401
      : error.message === 'Survey not found' ? 404
        : error.message === 'Invalid survey ID' ? 400 : 500;
    if (status === 500) console.error('Admin survey results failed', { code: error.code || error.cause?.code, message: error.message });
    const message = status === 404 ? 'Undersøkelsen finnes ikke.'
      : status === 400 ? 'Undersøkelses-ID-en er ugyldig.'
        : 'Kunne ikke hente resultatene.';
    return Response.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
