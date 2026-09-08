import { randomUUID } from 'node:crypto';
import { getSql } from './db.js';
import { requireAdmin } from './admin-access.js';
import { deleteCmsObject, uploadCmsObject } from './cms-storage.js';

const megabyte = 1024 * 1024;
const formats = {
  jpg: { mime: 'image/jpeg', signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: 'image/jpeg', signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: 'image/png', signature: (b) => b.slice(0, 8).toString('hex') === '89504e470d0a1a0a' },
  webp: { mime: 'image/webp', signature: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
  gif: { mime: 'image/gif', signature: (b) => ['GIF87a', 'GIF89a'].includes(b.slice(0, 6).toString()) },
  pdf: { mime: 'application/pdf', signature: (b) => b.slice(0, 5).toString() === '%PDF-' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: isZip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: isZip },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', signature: isZip },
  zip: { mime: 'application/zip', signature: isZip },
  doc: { mime: 'application/msword', signature: isOle },
  xls: { mime: 'application/vnd.ms-excel', signature: isOle },
  ppt: { mime: 'application/vnd.ms-powerpoint', signature: isOle },
};

function isZip(bytes) {
  const header = bytes.slice(0, 4).toString('hex');
  return ['504b0304', '504b0506', '504b0708'].includes(header);
}

function isOle(bytes) {
  return bytes.slice(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';
}

function safeFilename(value) {
  return String(value || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
}

function defaultTitle(filename) {
  return filename.replace(/\.[^.]+$/, '').trim().slice(0, 200) || 'Fil';
}

async function validateFile(file, kind) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('File is required');
  const filename = safeFilename(file.name);
  const extension = filename.split('.').pop()?.toLowerCase();
  const format = formats[extension];
  const maximum = kind === 'image' ? 10 * megabyte : 20 * megabyte;
  if (!filename || !format || file.size < 1 || file.size > maximum) throw new Error('Invalid file');
  if (kind === 'image' && !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) throw new Error('Invalid image');
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!format.signature(bytes)) throw new Error('Invalid file');
  return { bytes, extension, filename, mimeType: format.mime, size: bytes.length };
}

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
  await requireAdmin();
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
  const validated = await validateFile(file, kind);
  const id = randomUUID().replaceAll('-', '');
  const key = `pages/${page.id}/${kind}/${id}.${validated.extension}`;
  await uploadCmsObject(key, validated.bytes, validated.mimeType);
  try {
    const operations = [];
    if (kind === 'image') {
      operations.push(sql`
        UPDATE cms_attachments SET deleted_at = NOW(), updated_at = NOW()
        WHERE page_id = ${page.id} AND kind = 'image' AND deleted_at IS NULL
      `);
    }
    operations.push(sql`
      INSERT INTO cms_attachments (id, page_id, kind, title, original_filename,
        storage_key, mime_type, size_bytes, sort_order)
      VALUES (${id}, ${page.id}, ${kind}, ${defaultTitle(validated.filename)},
        ${validated.filename}, ${key}, ${validated.mimeType}, ${validated.size},
        CASE WHEN ${kind} = 'attachment' THEN COALESCE((
          SELECT MAX(sort_order) + 1 FROM cms_attachments
          WHERE page_id = ${page.id} AND kind = 'attachment' AND deleted_at IS NULL
        ), 0) ELSE 0 END)
      RETURNING id, kind, title, original_filename, mime_type, size_bytes, sort_order
    `);
    operations.push(sql`
      UPDATE cms_pages SET updated_at = NOW()
      WHERE id = ${page.id} AND deleted_at IS NULL
    `);
    const results = await sql.transaction(operations);
    const [created] = results.at(-2);
    return fileResult(created);
  } catch (error) {
    await deleteCmsObject(key).catch(() => {});
    throw error;
  }
}

export async function updateAdminCmsAttachment(pageId, attachmentId, title) {
  await requireAdmin();
  if (!/^[a-f0-9]{32}$/i.test(pageId || '') || !/^[a-f0-9]{32}$/i.test(attachmentId || '') || typeof title !== 'string' || !title.trim() || title.trim().length > 200) throw new Error('Invalid attachment');
  const sql = getSql();
  const results = await sql.transaction([
    sql`
    UPDATE cms_attachments SET title = ${title.trim()}, updated_at = NOW()
    WHERE id = ${attachmentId.toLowerCase()} AND page_id = ${pageId.toLowerCase()}
      AND kind = 'attachment' AND deleted_at IS NULL
    RETURNING id, kind, title, original_filename, mime_type, size_bytes, sort_order
    `,
    sql`
      UPDATE cms_pages SET updated_at = NOW()
      WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL
    `,
  ]);
  const [file] = results[0];
  if (!file) throw new Error('Attachment not found');
  return fileResult(file);
}

export async function reorderAdminCmsAttachments(pageId, ids) {
  await requireAdmin();
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
      UPDATE cms_attachments SET sort_order = ${sortOrder}, updated_at = NOW()
      WHERE id = ${id} AND page_id = ${pageId.toLowerCase()} AND deleted_at IS NULL
    `), sql`
      UPDATE cms_pages SET updated_at = NOW()
      WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL
    `]);
  }
}

export async function deleteAdminCmsFile(pageId, fileId, kind = 'attachment') {
  await requireAdmin();
  if (!/^[a-f0-9]{32}$/i.test(pageId || '') || !/^[a-f0-9]{32}$/i.test(fileId || '') || !['image', 'attachment'].includes(kind)) throw new Error('Invalid file');
  const sql = getSql();
  const results = await sql.transaction([
    sql`
      UPDATE cms_attachments SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${fileId.toLowerCase()} AND page_id = ${pageId.toLowerCase()}
        AND kind = ${kind} AND deleted_at IS NULL
      RETURNING id
    `,
    sql`
      UPDATE cms_pages SET updated_at = NOW()
      WHERE id = ${pageId.toLowerCase()} AND deleted_at IS NULL
    `,
  ]);
  const [file] = results[0];
  if (!file) throw new Error('File not found');
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
  await requireAdmin();
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
