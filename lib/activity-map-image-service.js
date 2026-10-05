import 'server-only';

import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { requirePermission } from './admin-access.js';
import { deleteCmsObject, downloadCmsObject, isCmsStorageConfigured, uploadCmsObject } from './cms-storage.js';
import { getSql } from './db.js';
import { revalidatePublicActivityMap } from './public-content-cache.js';
import { getAdminActivityMapFeature } from './activity-map-service.js';
import { downloadActivityImageSource } from './activity-map-remote-image.js';
import { validateUploadedFile } from './upload-validation.js';
import { MapError } from './map/geo.js';

const validId = (value) => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);

function versionOf(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) throw new MapError('errors.activityIdentity');
  return version;
}

async function optimizedImage(file) {
  const validated = await validateUploadedFile(file, 'image').catch(() => { throw new MapError('errors.activityImageFile'); });
  try {
    const bytes = await sharp(validated.bytes, { limitInputPixels: 40_000_000 })
      .rotate().resize({ width: 1200, height: 900, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer();
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('Invalid optimized image');
    return bytes;
  } catch { throw new MapError('errors.activityImageFile'); }
}

async function currentImage(sql, id) {
  return (await sql.query(`SELECT id, version, image_storage_key FROM activity_map_features
    WHERE id = $1 AND deleted_at IS NULL`, [id]))[0] || null;
}

async function replaceImage(input, file, sourceUrl) {
  const user = await requirePermission('members');
  if (!isCmsStorageConfigured()) throw new MapError('errors.activityImageStorage', 503);
  const id = String(input?.id || '');
  const version = versionOf(input?.version);
  if (!validId(id)) throw new MapError('errors.activityIdentity');
  const sql = getSql();
  const current = await currentImage(sql, id);
  if (!current || Number(current.version) !== version) throw new MapError('errors.activityChanged', 409);
  const bytes = await optimizedImage(file);
  const key = `activity-map/images/${id}/${randomUUID().replaceAll('-', '')}.webp`;
  await uploadCmsObject(key, bytes, 'image/webp').catch((error) => {
    if (error.message === 'CMS storage is not configured') throw new MapError('errors.activityImageStorage', 503);
    throw error;
  });
  try {
    const changed = await sql.query(`UPDATE activity_map_features SET image_storage_key = $1, image_source_url = $2,
      image_mime_type = 'image/webp', image_size_bytes = $3, last_changed_by = $4
      WHERE id = $5 AND version = $6 AND deleted_at IS NULL RETURNING id`,
    [key, sourceUrl, bytes.length, user.email.toLowerCase(), id, version]);
    if (!changed.length) throw new MapError('errors.activityChanged', 409);
  } catch (error) {
    await deleteCmsObject(key).catch(() => {});
    throw error;
  }
  if (current.image_storage_key) await deleteCmsObject(current.image_storage_key).catch(() => {});
  revalidatePublicActivityMap();
  return getAdminActivityMapFeature(id);
}

export async function uploadActivityMapImage(input, file) {
  return replaceImage(input, file, null);
}

export async function importActivityMapImage(input, sourceUrl, options = {}) {
  await requirePermission('members');
  if (!isCmsStorageConfigured()) throw new MapError('errors.activityImageStorage', 503);
  const id = String(input?.id || '');
  const version = versionOf(input?.version);
  if (!validId(id)) throw new MapError('errors.activityIdentity');
  const current = await currentImage(getSql(), id);
  if (!current || Number(current.version) !== version) throw new MapError('errors.activityChanged', 409);
  const downloaded = await downloadActivityImageSource(sourceUrl, options).catch((error) => {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new MapError('errors.activityImageUnavailable', 504);
    if (error.message === 'Activity image too large') throw new MapError('errors.activityImageTooLarge', 413);
    if (error.message === 'Invalid activity image URL') throw new MapError('errors.activityImageUrl');
    if (error.message === 'Activity image unavailable') throw new MapError('errors.activityImageUnavailable', 422);
    if (error.message === 'Invalid activity image') throw new MapError('errors.activityImageFile');
    throw new MapError('errors.activityImageUnavailable', 422);
  });
  return replaceImage(input, downloaded.file, downloaded.sourceUrl);
}

export async function removeActivityMapImage(input) {
  const user = await requirePermission('members');
  const id = String(input?.id || '');
  const version = versionOf(input?.version);
  if (!validId(id)) throw new MapError('errors.activityIdentity');
  const sql = getSql();
  const current = await currentImage(sql, id);
  if (!current || Number(current.version) !== version) throw new MapError('errors.activityChanged', 409);
  if (!current.image_storage_key) throw new MapError('errors.activityImageMissing', 404);
  const changed = await sql.query(`UPDATE activity_map_features SET image_storage_key = NULL, image_source_url = NULL,
    image_mime_type = NULL, image_size_bytes = NULL, last_changed_by = $1
    WHERE id = $2 AND version = $3 AND deleted_at IS NULL RETURNING id`, [user.email.toLowerCase(), id, version]);
  if (!changed.length) throw new MapError('errors.activityChanged', 409);
  await deleteCmsObject(current.image_storage_key).catch(() => {});
  revalidatePublicActivityMap();
  return getAdminActivityMapFeature(id);
}

export async function getActivityMapImage(id) {
  if (!validId(id)) return null;
  const rows = await getSql().query(`SELECT image_storage_key, image_mime_type, image_size_bytes, is_draft
    FROM activity_map_features WHERE id = $1 AND deleted_at IS NULL AND image_storage_key IS NOT NULL`, [id]);
  const image = rows[0];
  if (!image) return null;
  if (image.is_draft) await requirePermission('members');
  return {
    storageKey: image.image_storage_key,
    mimeType: image.image_mime_type,
    size: Number(image.image_size_bytes),
    isPublic: !image.is_draft,
  };
}

export async function downloadActivityMapImage(image) {
  return downloadCmsObject(image.storageKey);
}
