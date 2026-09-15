import { apiErrorStatus } from '@/lib/api-errors';
import { createAdminSurveyResultsExport } from '@/lib/admin-survey-results';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const result = await createAdminSurveyResultsExport((await params).id);
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
    const message = status === 404 ? 'Undersøkelsen finnes ikke.'
      : status === 400 ? 'Undersøkelses-ID-en er ugyldig.'
        : 'Kunne ikke generere Excel-filen.';
    return Response.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
