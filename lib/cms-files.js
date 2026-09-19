import { randomUUID } from 'node:crypto';
import { getSql } from './db.js';
import { requirePermission } from './admin-access.js';
import { deleteCmsObject, downloadCmsObject, uploadCmsObject } from './cms-storage.js';
import { revalidatePublicCmsContent } from './public-content-cache.js';
import { defaultFileTitle, validateUploadedFile } from './upload-validation.js';

async function requirePage(sql, pageId) {
  if (!/^[a-f0-9]{32}$/i.test(pageId || '')) throw new Error('Invalid page');
  const [page] = await sql`SELECT id, version FROM cms_pages WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL`;
  if (!page) throw new Error('Page not found');
  return page;
}

function fileResult(file) {
  const { thumbnail_storage_key: thumbnailStorageKey, ...safeFile } = file;
  return { ...safeFile, url: `/api/cms/files/${file.id}`, thumbnail_url: thumbnailStorageKey ? `/api/cms/files/${file.id}?variant=thumbnail` : null };
}

async function makeThumbnail(validated) {
  const { default: sharp } = await import('sharp');
  const bytes = await sharp(validated.bytes).rotate().resize({ width: 640, height: 420, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
  return { bytes, size: bytes.length };
}

export async function uploadAdminCmsFile(pageId, file, kind) {
  const user = await requirePermission('cms');
  const actor = user.email.toLowerCase();
  if (!['image', 'attachment'].includes(kind)) throw new Error('Invalid file');
  const sql = getSql();
  const page = await requirePage(sql, pageId);
  if (kind === 'attachment') {
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM cms_attachments WHERE page_id = ${page.id} AND kind = 'attachment' AND deleted_at IS NULL`;
    if (count >= 20) throw new Error('Too many attachments');
  }
  const validated = await validateUploadedFile(file, kind);
  const id = randomUUID().replaceAll('-', '');
  const key = `pages/${page.id}/${kind}/${id}.${validated.extension}`;
  const thumbnail = kind === 'image' ? await makeThumbnail(validated) : null;
  const thumbnailKey = thumbnail ? `pages/${page.id}/thumbnails/${id}.webp` : null;
  await uploadCmsObject(key, validated.bytes, validated.mimeType);
  if (thumbnail) await uploadCmsObject(thumbnailKey, thumbnail.bytes, 'image/webp').catch(async (error) => { await deleteCmsObject(key).catch(() => {}); throw error; });
  try {
    const operations = [];
    if (kind === 'image') operations.push(sql`UPDATE cms_attachments SET deleted_at = NOW(), updated_at = NOW(), last_changed_by = ${actor} WHERE page_id = ${page.id} AND kind = 'image' AND deleted_at IS NULL`);
    operations.push(sql`
      INSERT INTO cms_attachments (id, page_id, kind, title, original_filename, storage_key,
        thumbnail_storage_key, thumbnail_size_bytes, mime_type, size_bytes, sort_order, last_changed_by)
      VALUES (${id}, ${page.id}, ${kind}, ${defaultFileTitle(validated.filename)}, ${validated.filename}, ${key},
        ${thumbnailKey}, ${thumbnail?.size || null}, ${validated.mimeType}, ${validated.size},
        CASE WHEN ${kind} = 'attachment' THEN COALESCE((SELECT MAX(sort_order) + 1 FROM cms_attachments WHERE page_id = ${page.id} AND kind = 'attachment' AND deleted_at IS NULL), 0) ELSE 0 END, ${actor})
      RETURNING id, kind, title, original_filename, mime_type, size_bytes, sort_order, thumbnail_storage_key
    `);
    operations.push(sql`UPDATE cms_pages SET version = version + 1, updated_at = NOW(), last_changed_by = ${actor} WHERE id = ${page.id} AND deleted_at IS NULL RETURNING version`);
    const results = await sql.transaction(operations);
    const [created] = results.at(-2);
    const [updatedPage] = results.at(-1);
    revalidatePublicCmsContent();
    return { ...fileResult(created), page_version: updatedPage.version };
  } catch (error) {
    await Promise.all([deleteCmsObject(key).catch(() => {}), thumbnailKey ? deleteCmsObject(thumbnailKey).catch(() => {}) : Promise.resolve()]);
    throw error;
  }
}

export async function updateAdminCmsAttachment(pageId, attachmentId, title) {
  const user = await requirePermission('cms');
  const actor = user.email.toLowerCase();
  if (!/^[a-f0-9]{32}$/i.test(pageId || '') || !/^[a-f0-9]{32}$/i.test(attachmentId || '') || typeof title !== 'string' || !title.trim() || title.trim().length > 200) throw new Error('Invalid attachment');
  const sql = getSql();
  const [file] = await sql`
    WITH changed AS (
      UPDATE cms_attachments SET title = ${title.trim()}, updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${attachmentId.toLowerCase()} AND page_id = ${pageId.toLowerCase()} AND kind = 'attachment' AND deleted_at IS NULL
      RETURNING id, kind, title, original_filename, mime_type, size_bytes, sort_order, thumbnail_storage_key
    ), page_update AS (
      UPDATE cms_pages SET version = version + 1, updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM changed)
      RETURNING version
    ) SELECT changed.*, page_update.version AS page_version FROM changed CROSS JOIN page_update
  `;
  if (!file) throw new Error('Attachment not found');
  revalidatePublicCmsContent();
  return fileResult(file);
}

export async function reorderAdminCmsAttachments(pageId, ids) {
  const user = await requirePermission('cms');
  const actor = user.email.toLowerCase();
  if (!/^[a-f0-9]{32}$/i.test(pageId || '') || !Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some((id) => !/^[a-f0-9]{32}$/i.test(id || ''))) throw new Error('Invalid attachment order');
  const sql = getSql();
  const current = await sql`SELECT id FROM cms_attachments WHERE page_id = ${pageId.toLowerCase()} AND kind = 'attachment' AND deleted_at IS NULL ORDER BY sort_order, created_at, id`;
  if (current.length !== ids.length || current.some(({ id }) => !ids.includes(id))) throw new Error('Invalid attachment order');
  if (!ids.length) return { page_version: (await requirePage(sql, pageId)).version };
  const results = await sql.transaction([...ids.map((id, sortOrder) => sql`UPDATE cms_attachments SET sort_order = ${sortOrder}, updated_at = NOW(), last_changed_by = ${actor} WHERE id = ${id} AND page_id = ${pageId.toLowerCase()} AND deleted_at IS NULL`), sql`UPDATE cms_pages SET version = version + 1, updated_at = NOW(), last_changed_by = ${actor} WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL RETURNING version`]);
  revalidatePublicCmsContent();
  return { page_version: results.at(-1)[0]?.version };
}

export async function deleteAdminCmsFile(pageId, fileId, kind = 'attachment') {
  const user = await requirePermission('cms');
  const actor = user.email.toLowerCase();
  if (!/^[a-f0-9]{32}$/i.test(pageId || '') || !/^[a-f0-9]{32}$/i.test(fileId || '') || !['image', 'attachment'].includes(kind)) throw new Error('Invalid file');
  const sql = getSql();
  const [result] = await sql`
    WITH changed AS (
      UPDATE cms_attachments SET deleted_at = NOW(), updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${fileId.toLowerCase()} AND page_id = ${pageId.toLowerCase()} AND kind = ${kind} AND deleted_at IS NULL
      RETURNING id
    ), page_update AS (
      UPDATE cms_pages SET version = version + 1, updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM changed)
      RETURNING version
    ) SELECT changed.id, page_update.version AS page_version FROM changed CROSS JOIN page_update
  `;
  if (!result) throw new Error('File not found');
  revalidatePublicCmsContent();
  return result;
}

export async function getAdminCmsMedia(input = {}) {
  await requirePermission('cms');
  const search = String(input.search || '').slice(0, 120);
  const type = ['image', 'attachment'].includes(input.type) ? input.type : '';
  const since = /^\d{4}-\d{2}-\d{2}$/.test(input.since || '') ? input.since : null;
  return getSql()`
    SELECT a.id, a.page_id, a.kind, a.title, a.original_filename, a.mime_type, a.size_bytes,
      a.created_at, a.thumbnail_storage_key, p.title AS page_title,
      (SELECT COUNT(*)::int FROM cms_page_revisions r WHERE r.page_id = a.page_id AND r.snapshot->'files' @> jsonb_build_array(jsonb_build_object('id', a.id))) AS revision_uses
    FROM cms_attachments a JOIN cms_pages p ON p.id = a.page_id
    WHERE a.deleted_at IS NULL AND p.deleted_at IS NULL AND (${type} = '' OR a.kind = ${type})
      AND (${since}::date IS NULL OR a.created_at >= ${since}::date)
      AND (strpos(lower(a.title), lower(${search})) > 0 OR strpos(lower(a.original_filename), lower(${search})) > 0 OR strpos(lower(p.title), lower(${search})) > 0)
    ORDER BY a.created_at DESC LIMIT 100
  `;
}

export async function reuseAdminCmsFile(pageId, fileId) {
  const user = await requirePermission('cms');
  const actor = user.email.toLowerCase();
  const sql = getSql();
  const page = await requirePage(sql, pageId);
  if (!/^[a-f0-9]{32}$/i.test(fileId || '')) throw new Error('Invalid file');
  const [source] = await sql`SELECT kind, title, original_filename, storage_key, thumbnail_storage_key, thumbnail_size_bytes, mime_type, size_bytes FROM cms_attachments WHERE id = ${fileId.toLowerCase()} AND deleted_at IS NULL`;
  if (!source) throw new Error('File not found');
  const id = randomUUID().replaceAll('-', '');
  const key = `pages/${page.id}/${source.kind}/${id}`;
  const bytes = await (await downloadCmsObject(source.storage_key)).Body.transformToByteArray();
  await uploadCmsObject(key, bytes, source.mime_type);
  let thumbnailKey = null;
  try {
    if (source.thumbnail_storage_key) {
      thumbnailKey = `pages/${page.id}/thumbnails/${id}.webp`;
      const thumbnailBytes = await (await downloadCmsObject(source.thumbnail_storage_key)).Body.transformToByteArray();
      await uploadCmsObject(thumbnailKey, thumbnailBytes, 'image/webp');
    }
    const operations = [];
    if (source.kind === 'image') operations.push(sql`UPDATE cms_attachments SET deleted_at = NOW(), updated_at = NOW(), last_changed_by = ${actor} WHERE page_id = ${page.id} AND kind = 'image' AND deleted_at IS NULL`);
    operations.push(sql`INSERT INTO cms_attachments (id, page_id, kind, title, original_filename, storage_key, thumbnail_storage_key, thumbnail_size_bytes, mime_type, size_bytes, sort_order, last_changed_by) VALUES (${id}, ${page.id}, ${source.kind}, ${source.title}, ${source.original_filename}, ${key}, ${thumbnailKey}, ${source.thumbnail_size_bytes}, ${source.mime_type}, ${source.size_bytes}, CASE WHEN ${source.kind} = 'attachment' THEN COALESCE((SELECT MAX(sort_order) + 1 FROM cms_attachments WHERE page_id = ${page.id} AND kind = 'attachment' AND deleted_at IS NULL), 0) ELSE 0 END, ${actor}) RETURNING id, kind, title, original_filename, mime_type, size_bytes, sort_order, thumbnail_storage_key`);
    operations.push(sql`UPDATE cms_pages SET version = version + 1, updated_at = NOW(), last_changed_by = ${actor} WHERE id = ${page.id} RETURNING version`);
    const results = await sql.transaction(operations);
    return { ...fileResult(results.at(-2)[0]), page_version: results.at(-1)[0].version };
  } catch (error) {
    await Promise.all([deleteCmsObject(key).catch(() => {}), thumbnailKey ? deleteCmsObject(thumbnailKey).catch(() => {}) : Promise.resolve()]);
    throw error;
  }
}

async function getCmsFile(id, variant, admin) {
  if (!/^[a-f0-9]{32}$/i.test(id || '')) return null;
  if (admin) await requirePermission('cms');
  const sql = getSql();
  const [file] = await sql`
    SELECT a.id, a.original_filename,
      CASE WHEN ${variant} = 'thumbnail' THEN a.thumbnail_storage_key ELSE a.storage_key END AS storage_key,
      CASE WHEN ${variant} = 'thumbnail' THEN 'image/webp' ELSE a.mime_type END AS mime_type,
      CASE WHEN ${variant} = 'thumbnail' THEN a.thumbnail_size_bytes ELSE a.size_bytes END AS size_bytes,
      ${!admin} AS is_public
    FROM cms_attachments a JOIN cms_pages p ON p.id = a.page_id
    WHERE a.id = ${id.toLowerCase()} AND (${variant} <> 'thumbnail' OR a.thumbnail_storage_key IS NOT NULL)
      AND (${admin} OR (p.status = 'published' AND p.deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM cms_page_revisions r WHERE r.page_id = p.id AND r.revision_number = p.published_revision
          AND r.snapshot->'files' @> jsonb_build_array(jsonb_build_object('id', a.id))
      )))
      AND (${!admin} OR (p.deleted_at IS NULL AND (a.deleted_at IS NULL OR EXISTS (
        SELECT 1 FROM cms_page_revisions history WHERE history.page_id = p.id
          AND history.snapshot->'files' @> jsonb_build_array(jsonb_build_object('id', a.id))
      ))))
  `;
  return file || null;
}

export const getPublicCmsFile = (id, variant = '') => getCmsFile(id, variant, false);
export const getAdminCmsFile = (id, variant = '') => getCmsFile(id, variant, true);
