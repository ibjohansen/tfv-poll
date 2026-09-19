import { NextResponse } from 'next/server';
import { apiErrorStatus, readJsonObject } from '@/lib/api-errors';
import { getAdminCmsMedia, reuseAdminCmsFile } from '@/lib/cms-files';

export const runtime = 'nodejs';
const response = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  try {
    const media = await getAdminCmsMedia(Object.fromEntries(request.nextUrl.searchParams));
    return response({ ok: true, media: media.map(({ thumbnail_storage_key: thumbnailStorageKey, ...file }) => ({
      ...file,
      url: `/api/cms/files/${file.id}`,
      thumbnail_url: thumbnailStorageKey ? `/api/cms/files/${file.id}?variant=thumbnail` : null,
    })) });
  } catch (error) {
    return response({ ok: false, message: error.message === 'Unauthorized' ? 'Logg inn på nytt.' : 'Kunne ikke hente mediebiblioteket.' }, apiErrorStatus(error));
  }
}

export async function POST(request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return response({ ok: false, message: 'Ugyldig forespørsel.' }, 403);
  try {
    const { pageId, fileId } = await readJsonObject(request);
    const file = await reuseAdminCmsFile(pageId, fileId);
    return response({ ok: true, file, pageVersion: file.page_version }, 201);
  } catch (error) {
    return response({ ok: false, message: error.message === 'File not found' ? 'Filen finnes ikke.' : 'Kunne ikke gjenbruke filen.' }, apiErrorStatus(error));
  }
}
