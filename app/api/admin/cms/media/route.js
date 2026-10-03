import { getRequestI18n } from '@/lib/i18n/request';
import { isSameOriginRequest } from '@/lib/request-origin';
import { NextResponse } from 'next/server';
import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { getAdminCmsMedia, reuseAdminCmsFile } from '@/lib/cms-files';

export const runtime = 'nodejs';
const response = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const { t } = getRequestI18n(request, 'backend');
  try {
    const media = await getAdminCmsMedia(Object.fromEntries(request.nextUrl.searchParams));
    return response({ ok: true, media: media.map(({ thumbnail_storage_key: thumbnailStorageKey, ...file }) => ({
      ...file,
      url: `/api/cms/files/${file.id}`,
      thumbnail_url: thumbnailStorageKey ? `/api/cms/files/${file.id}?variant=thumbnail` : null,
    })) });
  } catch (error) {
    return response({ ok: false, message: error.message === 'Unauthorized' ? t('adminCms.login') : t('adminCms.mediaLoad') }, apiErrorStatus(error));
  }
}

export async function POST(request) {
  const { t } = getRequestI18n(request, 'backend');
  if (!isSameOriginRequest(request)) return response({ ok: false, message: t('api.invalidRequest') }, 403);
  try {
    const { pageId, fileId } = await readJsonObject(request);
    const file = await reuseAdminCmsFile(pageId, fileId);
    return response({ ok: true, file, pageVersion: file.page_version }, 201);
  } catch (error) {
    return response({ ok: false, message: error.message === 'File not found' ? t('adminCms.fileMissing') : t('adminCms.fileReuse') }, apiErrorStatus(error));
  }
}
