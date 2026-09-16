import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { createMemberExport } from '@/lib/member-export';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

function exportBaseUrl(request) {
  const url = new URL(process.env.AUTH_URL || request.nextUrl.origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid base URL');
  return url.origin;
}

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend');
  if (!sameOrigin(request)) return Response.json({ ok: false, message: t('api.invalidRequest') }, { status: 403 });
  try {
    const input = await readJsonObject(request);
    const result = await createMemberExport({ ...input, baseUrl: exportBaseUrl(request) });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="medlemsregister-${date}.xlsx"`,
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (error) {
    const status = apiErrorStatus(error);
    console.error('Admin member export failed', { code: error.code || error.cause?.code, message: error.message });
    const message = error.message === 'No members selected' ? t('adminMembers.noSelection')
      : error.message === 'Survey not found' ? t('adminMembers.surveyMissing')
        : status === 400 ? t('adminMembers.exportCheck') : t('adminMembers.export');
    return Response.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
