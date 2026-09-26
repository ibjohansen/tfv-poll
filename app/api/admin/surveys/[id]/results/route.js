import { apiErrorStatus } from '@/lib/api-errors';
import { getAdminSurveyResults } from '@/lib/admin-survey-results';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminSurveys');
  try {
    const results = await getAdminSurveyResults((await params).id, new URL(request.url).searchParams.get('hamlet') ?? '');
    return Response.json({ ok: true, results }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    const status = apiErrorStatus(error);
    if (status === 500) console.error('Admin survey results failed', { code: error.code || error.cause?.code, message: error.message });
    const message = t(error.message === 'Invalid survey hamlet filter' ? 'invalidHamlet' : status === 404 ? 'missingShort' : status === 400 ? 'invalidId' : 'results');
    return Response.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
