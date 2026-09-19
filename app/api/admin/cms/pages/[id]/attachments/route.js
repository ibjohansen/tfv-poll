import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { reorderAdminCmsAttachments, uploadAdminCmsFile } from '@/lib/cms-files';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: t('api.invalidRequest') }, 403);
  if (Number(request.headers.get('content-length') || 0) > 21 * 1024 * 1024) return response({ ok: false, message: t('adminCms.fileTooLarge') }, 413);
  try {
    const form = await request.formData();
    const attachment = await uploadAdminCmsFile((await params).id, form.get('file'), 'attachment');
    return response({ ok: true, attachment, pageVersion: attachment.page_version }, 201);
  } catch (error) {
    console.error('CMS attachment upload failed', { code: error.code || error.cause?.code, message: error.message });
    if (error.message === 'Unauthorized') return response({ ok: false, message: t('adminCms.login') }, 401);
    if (error.message === 'CMS storage is not configured') return response({ ok: false, message: t('adminCms.storage') }, 503);
    if (error.message === 'Too many attachments') return response({ ok: false, message: t('adminCms.tooManyAttachments') }, 409);
    return response({ ok: false, message: t('adminCms.unsupportedFile') }, apiErrorStatus(error, 400));
  }
}

export async function PATCH(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: t('api.invalidRequest') }, 403);
  try {
    const { ids } = await readJsonObject(request);
    const result = await reorderAdminCmsAttachments((await params).id, ids);
    return response({ ok: true, pageVersion: result.page_version });
  } catch (error) {
    const status = apiErrorStatus(error);
    return response({ ok: false, message: t('adminCms.attachmentOrder') }, status);
  }
}
