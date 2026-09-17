import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { createAdminCmsPage, copyAdminCmsPage, getAdminCmsPages } from '@/lib/cms-pages';
import { getRequestI18n } from '@/lib/i18n/request';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
function errorResponse(error, t) {
  const code = error.code || error.cause?.code;
  if (error.message === 'Unauthorized') return response({ ok: false, message: t('login') }, 401);
  if (code === '23505') return response({ ok: false, message: t('duplicateUrl') }, 409);
  if (error.message === 'Mock data cannot be changed') return response({ ok: false, message: t('mock') }, 409);
  return response({ ok: false, message: t('check') }, apiErrorStatus(error, 400));
}

export async function GET(request) {
  const { t } = getRequestI18n(request, 'backend.adminCms');
  try {
    const pages = await getAdminCmsPages(request.nextUrl.searchParams.get('search') || '');
    return response({ ok: true, pages });
  } catch (error) {
    console.error('CMS page list failed', { code: error.code || error.cause?.code, message: error.message });
    return errorResponse(error, t);
  }
}

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend');
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: t('api.invalidRequest') }, 403);
  try {
    const input = await readJsonObject(request);
    return response({ ok: true, page: input.action === 'copy' ? await copyAdminCmsPage(input.sourceId) : await createAdminCmsPage(input) }, 201);
  } catch (error) {
    console.error('CMS page create failed', { code: error.code || error.cause?.code, message: error.message });
    return errorResponse(error, (key) => t(`adminCms.${key}`));
  }
}
