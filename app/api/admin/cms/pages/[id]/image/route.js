import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { deleteAdminCmsFile, uploadAdminCmsFile } from '@/lib/cms-files';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
function uploadError(error, t) {
  if (error.message === 'Unauthorized') return response({ ok: false, message: t('adminCms.login') }, 401);
  if (error.message === 'Page not found') return response({ ok: false, message: t('adminCms.saveBeforeImage') }, 404);
  if (error.message === 'CMS storage is not configured') return response({ ok: false, message: t('adminCms.storage') }, 503);
  return response({ ok: false, message: t('adminCms.imageType') }, apiErrorStatus(error, 400));
}

export async function POST(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: t('api.invalidRequest') }, 403);
  if (Number(request.headers.get('content-length') || 0) > 11 * 1024 * 1024) return response({ ok: false, message: t('adminCms.imageTooLarge') }, 413);
  try {
    const form = await request.formData();
    const image = await uploadAdminCmsFile((await params).id, form.get('file'), 'image');
    return response({ ok: true, image, pageVersion: image.page_version }, 201);
  } catch (error) {
    console.error('CMS image upload failed', { code: error.code || error.cause?.code, message: error.message });
    return uploadError(error, t);
  }
}

export async function DELETE(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: t('api.invalidRequest') }, 403);
  try {
    const { imageId } = await readJsonObject(request);
    const result = await deleteAdminCmsFile((await params).id, imageId, 'image');
    return response({ ok: true, pageVersion: result.page_version });
  } catch (error) {
    const status = apiErrorStatus(error);
    return response({ ok: false, message: t(status === 404 ? 'adminCms.imageMissing' : 'adminCms.removeImage') }, status);
  }
}
