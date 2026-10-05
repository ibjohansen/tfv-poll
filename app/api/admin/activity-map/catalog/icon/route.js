import { NextResponse } from 'next/server';
import { readJsonObject } from '@/lib/api-errors';
import { getRequestI18n } from '@/lib/i18n/request';
import { removeActivityMapCatalogIcon, uploadActivityMapCatalogIcon } from '@/lib/activity-map-icon-service';
import { isSameOriginRequest } from '@/lib/request-origin';

export const runtime = 'nodejs';

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private', Vary: 'Cookie' } });
}

function failure(error, t) {
  const status = error.message === 'Unauthorized' ? 401 : error.status || 400;
  const code = error.code || '';
  const message = status === 401 ? t('catalog.iconUnauthorized')
    : code === 'errors.activityIconFile' ? t('catalog.iconFile')
      : code === 'errors.activityIconMissing' ? t('catalog.iconMissing')
        : code === 'errors.activityIconStorage' ? t('catalog.iconStorage')
          : code === 'errors.activityCatalogChanged' ? t('catalog.iconChanged')
            : t('requestError');
  return response({ ok: false, message }, status);
}

export async function POST(request) {
  const { t } = getRequestI18n(request, 'activityMap.admin');
  if (!isSameOriginRequest(request)) return response({ ok: false, message: t('catalog.iconInvalidRequest') }, 403);
  if (Number(request.headers.get('content-length') || 0) > 160 * 1024) return response({ ok: false, message: t('catalog.iconFile') }, 413);
  try {
    const form = await request.formData();
    const catalog = await uploadActivityMapCatalogIcon({
      kind: form.get('kind'), id: form.get('id'), category: form.get('category'),
      featureType: form.get('featureType'), version: form.get('version'),
    }, form.get('file'));
    return response({ ok: true, catalog }, 201);
  } catch (error) { return failure(error, t); }
}

export async function DELETE(request) {
  const { t } = getRequestI18n(request, 'activityMap.admin');
  if (!isSameOriginRequest(request)) return response({ ok: false, message: t('catalog.iconInvalidRequest') }, 403);
  try {
    return response({ ok: true, catalog: await removeActivityMapCatalogIcon(await readJsonObject(request)) });
  } catch (error) { return failure(error, t); }
}
