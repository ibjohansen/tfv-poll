import { apiErrorStatus } from '@/lib/api-errors';
import { createAdminSurveyResultsExport } from '@/lib/admin-survey-results';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminSurveys');
  try {
    const result = await createAdminSurveyResultsExport((await params).id, new URL(request.url).searchParams.get('hamlet') ?? '');
    const date = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="undersokelsesresultater-${date}.xlsx"`,
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (error) {
    const status = apiErrorStatus(error);
    console.error('Admin survey results export failed', { code: error.code || error.cause?.code, message: error.message });
    const message = t(error.message === 'Invalid survey hamlet filter' ? 'invalidHamlet' : status === 404 ? 'missingShort' : status === 400 ? 'invalidId' : 'export');
    return Response.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
