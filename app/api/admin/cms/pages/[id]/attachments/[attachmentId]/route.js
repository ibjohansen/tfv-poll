import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { deleteAdminCmsFile, updateAdminCmsAttachment } from '@/lib/cms-files';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function PATCH(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: t('api.invalidRequest') }, 403);
  try {
    const route = await params;
    const { title } = await readJsonObject(request);
    const attachment = await updateAdminCmsAttachment(route.id, route.attachmentId, title);
    return response({ ok: true, attachment, pageVersion: attachment.page_version });
  } catch (error) {
    const status = apiErrorStatus(error);
    return response({ ok: false, message: t(status === 404 ? 'adminCms.attachmentMissing' : 'adminCms.attachmentName') }, status);
  }
}

export async function DELETE(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: t('api.invalidRequest') }, 403);
  try {
    const route = await params;
    const result = await deleteAdminCmsFile(route.id, route.attachmentId);
    return response({ ok: true, pageVersion: result.page_version });
  } catch (error) {
    const status = apiErrorStatus(error);
    return response({ ok: false, message: t(status === 404 ? 'adminCms.attachmentMissing' : 'adminCms.removeAttachment') }, status);
  }
}
