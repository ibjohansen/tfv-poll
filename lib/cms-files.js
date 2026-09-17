import { randomUUID } from 'node:crypto';
import { getSql } from './db.js';
import { requirePermission } from './admin-access.js';
import { deleteCmsObject, uploadCmsObject } from './cms-storage.js';
import { revalidatePublicCmsContent } from './public-content-cache.js';
import { defaultFileTitle, validateUploadedFile } from './upload-validation.js';

async function requirePage(sql, pageId) {
  if (!/^[a-f0-9]{32}$/i.test(pageId || '')) throw new Error('Invalid page');
  const [page] = await sql`SELECT id FROM cms_pages WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL`;
  if (!page) throw new Error('Page not found');
  return page;
}

function fileResult(file) {
  return { ...file, url: `/api/cms/files/${file.id}` };
}

export async function uploadAdminCmsFile(pageId, file, kind) {
  const user = await requirePermission('cms');
  const actor = user.email.toLowerCase();
  if (!['image', 'attachment'].includes(kind)) throw new Error('Invalid file');
  const sql = getSql();
  const page = await requirePage(sql, pageId);
  if (kind === 'attachment') {
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM cms_attachments
      WHERE page_id = ${page.id} AND kind = 'attachment' AND deleted_at IS NULL
    `;
    if (count >= 20) throw new Error('Too many attachments');
  }
  const validated = await validateUploadedFile(file, kind);
  const id = randomUUID().replaceAll('-', '');
  const key = `pages/${page.id}/${kind}/${id}.${validated.extension}`;
  await uploadCmsObject(key, validated.bytes, validated.mimeType);
  try {
    const operations = [];
    if (kind === 'image') {
      operations.push(sql`
        UPDATE cms_attachments SET deleted_at = NOW(), updated_at = NOW(), last_changed_by = ${actor}
        WHERE page_id = ${page.id} AND kind = 'image' AND deleted_at IS NULL
      `);
    }
    operations.push(sql`
      INSERT INTO cms_attachments (id, page_id, kind, title, original_filename,
        storage_key, mime_type, size_bytes, sort_order, last_changed_by)
      VALUES (${id}, ${page.id}, ${kind}, ${defaultFileTitle(validated.filename)},
        ${validated.filename}, ${key}, ${validated.mimeType}, ${validated.size},
        CASE WHEN ${kind} = 'attachment' THEN COALESCE((
          SELECT MAX(sort_order) + 1 FROM cms_attachments
          WHERE page_id = ${page.id} AND kind = 'attachment' AND deleted_at IS NULL
        ), 0) ELSE 0 END, ${actor})
      RETURNING id, kind, title, original_filename, mime_type, size_bytes, sort_order
    `);
    operations.push(sql`
      UPDATE cms_pages SET updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${page.id} AND deleted_at IS NULL
    `);
    const results = await sql.transaction(operations);
    const [created] = results.at(-2);
    revalidatePublicCmsContent();
    return fileResult(created);
  } catch (error) {
    await deleteCmsObject(key).catch(() => {});
    throw error;
  }
}

export async function updateAdminCmsAttachment(pageId, attachmentId, title) {
  const user = await requirePermission('cms');
  const actor = user.email.toLowerCase();
  if (!/^[a-f0-9]{32}$/i.test(pageId || '') || !/^[a-f0-9]{32}$/i.test(attachmentId || '') || typeof title !== 'string' || !title.trim() || title.trim().length > 200) throw new Error('Invalid attachment');
  const sql = getSql();
  const results = await sql.transaction([
    sql`
    UPDATE cms_attachments SET title = ${title.trim()}, updated_at = NOW(), last_changed_by = ${actor}
    WHERE id = ${attachmentId.toLowerCase()} AND page_id = ${pageId.toLowerCase()}
      AND kind = 'attachment' AND deleted_at IS NULL
    RETURNING id, kind, title, original_filename, mime_type, size_bytes, sort_order
    `,
    sql`
      UPDATE cms_pages SET updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL
    `,
  ]);
  const [file] = results[0];
  if (!file) throw new Error('Attachment not found');
  revalidatePublicCmsContent();
  return fileResult(file);
}

export async function reorderAdminCmsAttachments(pageId, ids) {
  const user = await requirePermission('cms');
  const actor = user.email.toLowerCase();
  if (!/^[a-f0-9]{32}$/i.test(pageId || '') || !Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some((id) => !/^[a-f0-9]{32}$/i.test(id || ''))) throw new Error('Invalid attachment order');
  const sql = getSql();
  const current = await sql`
    SELECT id FROM cms_attachments
    WHERE page_id = ${pageId.toLowerCase()} AND kind = 'attachment' AND deleted_at IS NULL
    ORDER BY sort_order, created_at, id
  `;
  if (current.length !== ids.length || current.some(({ id }) => !ids.includes(id))) throw new Error('Invalid attachment order');
  if (ids.length) {
    await sql.transaction([...ids.map((id, sortOrder) => sql`
      UPDATE cms_attachments SET sort_order = ${sortOrder}, updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${id} AND page_id = ${pageId.toLowerCase()} AND deleted_at IS NULL
    `), sql`
      UPDATE cms_pages SET updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL
    `]);
    revalidatePublicCmsContent();
  }
}

export async function deleteAdminCmsFile(pageId, fileId, kind = 'attachment') {
  const user = await requirePermission('cms');
  const actor = user.email.toLowerCase();
  if (!/^[a-f0-9]{32}$/i.test(pageId || '') || !/^[a-f0-9]{32}$/i.test(fileId || '') || !['image', 'attachment'].includes(kind)) throw new Error('Invalid file');
  const sql = getSql();
  const results = await sql.transaction([
    sql`
      UPDATE cms_attachments SET deleted_at = NOW(), updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${fileId.toLowerCase()} AND page_id = ${pageId.toLowerCase()}
        AND kind = ${kind} AND deleted_at IS NULL
      RETURNING id
    `,
    sql`
      UPDATE cms_pages SET updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL
    `,
  ]);
  const [file] = results[0];
  if (!file) throw new Error('File not found');
  revalidatePublicCmsContent();
}

export async function getPublicCmsFile(id) {
  if (!/^[a-f0-9]{32}$/i.test(id || '')) return null;
  const sql = getSql();
  const [file] = await sql`
    SELECT a.id, a.original_filename, a.storage_key, a.mime_type, a.size_bytes, TRUE AS is_public
    FROM cms_attachments a
    JOIN cms_pages p ON p.id = a.page_id
    WHERE a.id = ${id.toLowerCase()} AND a.deleted_at IS NULL
      AND p.status = 'published' AND p.deleted_at IS NULL
  `;
  return file || null;
}

export async function getAdminCmsFile(id) {
  await requirePermission('cms');
  if (!/^[a-f0-9]{32}$/i.test(id || '')) return null;
  const sql = getSql();
  const [file] = await sql`
    SELECT a.id, a.original_filename, a.storage_key, a.mime_type, a.size_bytes, FALSE AS is_public
    FROM cms_attachments a
    JOIN cms_pages p ON p.id = a.page_id
    WHERE a.id = ${id.toLowerCase()} AND a.deleted_at IS NULL AND p.deleted_at IS NULL
  `;
  return file || null;
}
