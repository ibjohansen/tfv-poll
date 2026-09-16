import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { deleteAdminCmsPage, getAdminCmsPage, updateAdminCmsPage } from '@/lib/cms-pages';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
function statusFor(error) {
  if (error.message === 'Unauthorized') return 401;
  if (error.message === 'Page not found') return 404;
  if ((error.code || error.cause?.code) === '23505') return 409;
  return apiErrorStatus(error, 400);
}

function messageFor(error, t) {
  if (error.message === 'Unauthorized') return t('login');
  if (error.message === 'Page not found') return t('missingLong');
  if ((error.code || error.cause?.code) === '23505') return t('duplicateUrl');
  return t('check');
}

export async function GET(request, { params }) {
  const { t } = getRequestI18n(request, 'backend.adminCms');
  try {
    const page = await getAdminCmsPage((await params).id);
    return page ? response({ ok: true, page }) : response({ ok: false, message: t('missing') }, 404);
  } catch (error) {
    return response({ ok: false, message: messageFor(error, t) }, statusFor(error));
  }
}

export async function PATCH(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: t('api.invalidRequest') }, 403);
  try {
    return response({ ok: true, page: await updateAdminCmsPage((await params).id, await readJsonObject(request)) });
  } catch (error) {
    console.error('CMS page update failed', { id: (await params).id, code: error.code || error.cause?.code, message: error.message });
    return response({ ok: false, message: messageFor(error, (key) => t(`adminCms.${key}`)) }, statusFor(error));
  }
}

export async function DELETE(request, { params }) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: t('api.invalidRequest') }, 403);
  try {
    await deleteAdminCmsPage((await params).id);
    return response({ ok: true });
  } catch (error) {
    console.error('CMS page delete failed', { id: (await params).id, code: error.code || error.cause?.code, message: error.message });
    return response({ ok: false, message: messageFor(error, (key) => t(`adminCms.${key}`)) }, statusFor(error));
  }
}
