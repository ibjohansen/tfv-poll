import { NextResponse } from 'next/server';
import { readJsonObject } from '@/lib/api-errors';
import { getRequestI18n } from '@/lib/i18n/request';
import { importActivityMapImage, removeActivityMapImage, uploadActivityMapImage } from '@/lib/activity-map-image-service';
import { isSameOriginRequest } from '@/lib/request-origin';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private', Vary: 'Cookie' } });
}

function failure(error, t) {
  const status = error.message === 'Unauthorized' ? 401 : error.status || 500;
  const messages = {
    'errors.activityImageFile': 'imageFileError',
    'errors.activityImageUrl': 'imageUrlError',
    'errors.activityImageUnavailable': 'imageUnavailable',
    'errors.activityImageTooLarge': 'imageTooLarge',
    'errors.activityImageStorage': 'imageStorageError',
    'errors.activityImageMissing': 'imageMissing',
    'errors.activityChanged': 'imageChanged',
  };
  return response({ ok: false, message: t(messages[error.code] || (status === 401 ? 'imageUnauthorized' : 'requestError')) }, status);
}

export async function POST(request) {
  const { t } = getRequestI18n(request, 'activityMap.admin');
  if (!isSameOriginRequest(request)) return response({ ok: false, message: t('imageInvalidRequest') }, 403);
  if (Number(request.headers.get('content-length') || 0) > 11 * 1024 * 1024) return response({ ok: false, message: t('imageTooLarge') }, 413);
  try {
    const form = await request.formData();
    const input = { id: form.get('id'), version: form.get('version') };
    const file = form.get('file');
    const sourceUrl = form.get('sourceUrl');
    const feature = file && typeof file.arrayBuffer === 'function' && file.size > 0
      ? await uploadActivityMapImage(input, file)
      : await importActivityMapImage(input, sourceUrl, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]) });
    return response({ ok: true, feature }, 201);
  } catch (error) {
    console.error('Activity image update failed', { code: error.code || error.cause?.code || error.name });
    return failure(error, t);
  }
}

export async function DELETE(request) {
  const { t } = getRequestI18n(request, 'activityMap.admin');
  if (!isSameOriginRequest(request)) return response({ ok: false, message: t('imageInvalidRequest') }, 403);
  try {
    return response({ ok: true, feature: await removeActivityMapImage(await readJsonObject(request)) });
  } catch (error) { return failure(error, t); }
}
