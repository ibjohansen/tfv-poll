import { randomUUID } from 'node:crypto';
import { getSql } from './db.js';
import { requirePermission } from './admin-access.js';
import { isMockMode } from './mock-store.js';
import { cmsCategories, validateCmsPageInput } from './cms-validation.js';
import { CMS_RICH_TEXT_SCHEMA_VERSION, sanitizeRichText, richTextToPlainText } from './rich-text.js';
import { analyzeCmsContent, validateCmsPublication } from './cms-quality.js';
import { revalidatePublicCmsContent } from './public-content-cache.js';
import { copyContentFiles } from './content-copy.js';

function cmsError(message, code, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function cleanOptional(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function publicFile(file) {
  if (!file) return null;
  const { thumbnail_storage_key: thumbnailStorageKey, ...safeFile } = file;
  return {
    ...safeFile,
    url: `/api/cms/files/${file.id}`,
    thumbnail_url: thumbnailStorageKey ? `/api/cms/files/${file.id}?variant=thumbnail` : null,
  };
}

async function filesForPage(sql, pageId, includeDeletedIds = null) {
  if (includeDeletedIds) {
    if (!includeDeletedIds.length) return [];
    return sql`
      SELECT id, kind, title, original_filename, mime_type, size_bytes, sort_order,
        created_at, thumbnail_storage_key, thumbnail_size_bytes
      FROM cms_attachments
      WHERE page_id = ${pageId} AND id = ANY(${includeDeletedIds}::text[])
      ORDER BY kind DESC, sort_order, created_at, id
    `;
  }
  return sql`
    SELECT id, kind, title, original_filename, mime_type, size_bytes, sort_order,
      created_at, thumbnail_storage_key, thumbnail_size_bytes
    FROM cms_attachments
    WHERE page_id = ${pageId} AND deleted_at IS NULL
    ORDER BY kind DESC, sort_order, created_at, id
  `;
}

async function attachFiles(sql, page) {
  if (!page) return null;
  const snapshotFiles = Array.isArray(page.snapshot_files) ? page.snapshot_files : null;
  const files = await filesForPage(sql, page.id, snapshotFiles?.map(({ id }) => id).filter(Boolean));
  const byId = new Map(files.map((file) => [file.id, file]));
  const ordered = snapshotFiles ? snapshotFiles.map((file) => ({ ...file, ...byId.get(file.id) })).filter(({ id }) => byId.has(id)) : files;
  const { snapshot_files: _snapshotFiles, ...cleanPage } = page;
  return {
    ...cleanPage,
    image: publicFile(ordered.find(({ kind }) => kind === 'image')),
    attachments: ordered.filter(({ kind }) => kind === 'attachment').map(publicFile),
  };
}

function pageSnapshot(page, files = []) {
  const rich = page.bodyRichText ?? page.body_rich_text ?? null;
  return {
    schemaVersion: 1,
    title: String(page.title || '').trim(),
    slug: page.slug,
    intro: cleanOptional(page.intro),
    body: rich ? richTextToPlainText(rich) : cleanOptional(page.body),
    bodyRichText: rich,
    bodySchemaVersion: CMS_RICH_TEXT_SCHEMA_VERSION,
    category: page.category,
    imageAlt: cleanOptional(page.imageAlt ?? page.image_alt),
    imageCaption: cleanOptional(page.imageCaption ?? page.image_caption),
    imageDecorative: Boolean(page.imageDecorative ?? page.image_decorative),
    files: files.map((file) => ({
      id: file.id,
      kind: file.kind,
      title: file.title,
      originalFilename: file.original_filename,
      mimeType: file.mime_type,
      sizeBytes: Number(file.size_bytes),
      sortOrder: file.sort_order,
    })),
  };
}

function expectedVersion(input) {
  if (!Number.isInteger(input?.expectedVersion) || input.expectedVersion < 1) throw cmsError('Expected version is required', 'CMS_VERSION_REQUIRED');
  return input.expectedVersion;
}

function assertPublishable(page, files, overrideReason) {
  const result = validateCmsPublication(page, files, overrideReason);
  if (!result.valid) throw cmsError('Page is not ready to publish', 'CMS_PUBLICATION_QUALITY', result);
  return result;
}

function normalizeListFilters(input) {
  if (typeof input === 'string') return { search: input, status: 'active', category: '', sort: 'updated-desc' };
  const filters = input || {};
  return {
    search: String(filters.search || '').slice(0, 120),
    status: ['active', 'draft', 'published', 'archived'].includes(filters.status) ? filters.status : 'active',
    category: cmsCategories.includes(filters.category) ? filters.category : '',
    sort: ['updated-desc', 'updated-asc', 'title-asc', 'title-desc'].includes(filters.sort) ? filters.sort : 'updated-desc',
  };
}

export async function getAdminCmsPages(input = '') {
  await requirePermission('cms');
  if (isMockMode()) return [];
  const filters = normalizeListFilters(input);
  const sql = getSql();
  return sql`
    SELECT p.id, p.title, p.slug, p.category, p.status, p.version, p.published_revision,
      p.created_at, p.updated_at, p.published_at, p.deleted_at,
      (p.status = 'published' AND p.version <> COALESCE(p.published_revision, 0)) AS has_unpublished_changes,
      COUNT(a.id)::int AS attachment_count
    FROM cms_pages p
    LEFT JOIN cms_attachments a ON a.page_id = p.id AND a.deleted_at IS NULL AND a.kind = 'attachment'
    WHERE strpos(lower(p.title), lower(${filters.search})) > 0
      AND (${filters.status} = 'archived' OR p.deleted_at IS NULL)
      AND (${filters.status} <> 'archived' OR p.deleted_at IS NOT NULL)
      AND (${filters.status} NOT IN ('draft', 'published') OR p.status = ${filters.status})
      AND (${filters.category} = '' OR p.category = ${filters.category})
    GROUP BY p.id
    ORDER BY
      CASE WHEN ${filters.sort} = 'updated-asc' THEN p.updated_at END ASC,
      CASE WHEN ${filters.sort} = 'title-asc' THEN lower(p.title) END ASC,
      CASE WHEN ${filters.sort} = 'title-desc' THEN lower(p.title) END DESC,
      CASE WHEN ${filters.sort} = 'updated-desc' THEN p.updated_at END DESC,
      p.id
    LIMIT 500
  `;
}

export async function getAdminCmsPage(id, { includeArchived = false } = {}) {
  await requirePermission('cms');
  if (isMockMode()) return null;
  if (!/^[a-f0-9]{32}$/i.test(id || '')) return null;
  const sql = getSql();
  const [page] = await sql`
    SELECT id, title, slug, intro, body, body_rich_text, body_schema_version,
      category, image_alt, image_caption, image_decorative, status, version,
      published_revision, created_at, updated_at, published_at, deleted_at,
      (status = 'published' AND version <> COALESCE(published_revision, 0)) AS has_unpublished_changes
    FROM cms_pages
    WHERE id = ${id.toLowerCase()} AND (${includeArchived} OR deleted_at IS NULL)
  `;
  return attachFiles(sql, page);
}

export async function createAdminCmsPage(input) {
  const user = await requirePermission('cms');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!validateCmsPageInput(input)) throw new Error('Invalid page');
  const rich = sanitizeRichText(input.bodyRichText);
  const publish = input.status === 'published';
  const quality = publish ? assertPublishable({ ...input, bodyRichText: rich }, [], input.overrideReason) : null;
  const id = randomUUID().replaceAll('-', '');
  const actor = user.email.toLowerCase();
  const snapshot = pageSnapshot({ ...input, bodyRichText: rich });
  const sql = getSql();
  const results = await sql.transaction([
    sql`
      INSERT INTO cms_pages (id, title, slug, intro, body, body_rich_text, body_schema_version,
        category, image_alt, image_caption, image_decorative, status, version,
        published_revision, published_at, last_changed_by)
      VALUES (${id}, ${snapshot.title}, ${snapshot.slug}, ${snapshot.intro}, ${snapshot.body},
        ${rich ? JSON.stringify(rich) : null}::jsonb, ${CMS_RICH_TEXT_SCHEMA_VERSION}, ${snapshot.category},
        ${snapshot.imageAlt}, ${snapshot.imageCaption}, ${snapshot.imageDecorative}, ${input.status}, 1,
        ${publish ? 1 : null}, CASE WHEN ${publish} THEN NOW() ELSE NULL END, ${actor})
      RETURNING id, title, slug, intro, body, body_rich_text, body_schema_version,
        category, image_alt, image_caption, image_decorative, status, version,
        published_revision, created_at, updated_at, published_at, deleted_at
    `,
    sql`
      INSERT INTO cms_page_revisions (page_id, revision_number, snapshot, revision_status, override_reason, created_by)
      VALUES (${id}, 1, ${JSON.stringify(snapshot)}::jsonb, ${publish ? 'published' : 'draft'}, ${quality?.overrideReason || null}, ${actor})
    `,
  ]);
  revalidatePublicCmsContent();
  return { ...results[0][0], image: null, attachments: [], has_unpublished_changes: false };
}

export async function copyAdminCmsPage(sourceId) {
  const user = await requirePermission('cms');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!/^[a-f0-9]{32}$/i.test(sourceId || '')) throw new Error('Invalid page');
  const sql = getSql();
  const [source] = await sql`SELECT id, title, slug, intro, body, body_rich_text, body_schema_version,
    category, image_alt, image_caption, image_decorative, status, version,
    published_revision, created_at, updated_at, published_at, deleted_at
    FROM cms_pages WHERE id = ${sourceId} AND deleted_at IS NULL`;
  if (!source) throw new Error('Page not found');
  const files = await sql`SELECT kind, title, original_filename, storage_key, thumbnail_storage_key, thumbnail_size_bytes, mime_type, size_bytes, sort_order FROM cms_attachments WHERE page_id = ${sourceId} AND deleted_at IS NULL ORDER BY sort_order, id`;
  const id = randomUUID().replaceAll('-', '');
  const actor = user.email.toLowerCase();
  const result = await copyContentFiles(files, `pages/${id}`, (copies) => {
    const copiedPage = { ...source, title: `Kopi av ${source.title}`.slice(0, 120), slug: `${source.slug.slice(0, 55).replace(/-+$/, '')}-kopi-${id}` };
    const snapshot = pageSnapshot(copiedPage, copies);
    return sql.transaction([
      sql`INSERT INTO cms_pages (id, title, slug, intro, body, body_rich_text, body_schema_version, category, image_alt, image_caption, image_decorative, status, version, last_changed_by)
        VALUES (${id}, ${copiedPage.title}, ${copiedPage.slug}, ${source.intro}, ${source.body}, ${source.body_rich_text === null ? null : JSON.stringify(source.body_rich_text)}::jsonb,
          ${source.body_schema_version}, ${source.category}, ${source.image_alt}, ${source.image_caption}, ${source.image_decorative}, 'draft', 1, ${actor}) RETURNING *`,
      ...copies.map((file) => sql`INSERT INTO cms_attachments (id, page_id, kind, title, original_filename, storage_key, thumbnail_storage_key, thumbnail_size_bytes, mime_type, size_bytes, sort_order, last_changed_by)
        VALUES (${file.id}, ${id}, ${file.kind}, ${file.title}, ${file.original_filename}, ${file.storage_key}, ${file.thumbnail_storage_key || null}, ${file.thumbnail_size_bytes || null}, ${file.mime_type}, ${file.size_bytes}, ${file.sort_order}, ${actor})`),
      sql`INSERT INTO cms_page_revisions (page_id, revision_number, snapshot, revision_status, created_by)
        VALUES (${id}, 1, ${JSON.stringify(snapshot)}::jsonb, 'draft', ${actor})`,
    ]);
  });
  return attachFiles(sql, result[0][0]);
}

export async function updateAdminCmsPage(id, input) {
  const user = await requirePermission('cms');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!/^[a-f0-9]{32}$/i.test(id || '') || !validateCmsPageInput(input)) throw new Error('Invalid page');
  const expected = expectedVersion(input);
  const rich = sanitizeRichText(input.bodyRichText);
  const sql = getSql();
  const [current] = await sql`SELECT id, title, slug, intro, body, body_rich_text, body_schema_version,
    category, image_alt, image_caption, image_decorative, status, version,
    published_revision, created_at, updated_at, published_at, deleted_at
    FROM cms_pages WHERE id = ${id.toLowerCase()} AND deleted_at IS NULL`;
  if (!current) throw new Error('Page not found');
  const files = await filesForPage(sql, current.id);
  const publish = input.status === 'published';
  const quality = publish ? assertPublishable({ ...input, bodyRichText: rich }, files, input.overrideReason) : null;
  const snapshot = pageSnapshot({ ...input, bodyRichText: rich }, files);
  const actor = user.email.toLowerCase();
  const [page] = await sql`
    WITH updated AS (
      UPDATE cms_pages
      SET title = ${snapshot.title}, slug = ${snapshot.slug}, intro = ${snapshot.intro},
        body = ${snapshot.body}, body_rich_text = ${rich ? JSON.stringify(rich) : null}::jsonb,
        body_schema_version = ${CMS_RICH_TEXT_SCHEMA_VERSION}, category = ${snapshot.category},
        image_alt = ${snapshot.imageAlt}, image_caption = ${snapshot.imageCaption},
        image_decorative = ${snapshot.imageDecorative},
        status = CASE WHEN ${publish} THEN 'published' ELSE status END,
        published_at = CASE WHEN ${publish} THEN COALESCE(published_at, NOW()) ELSE published_at END,
        published_revision = CASE WHEN ${publish} THEN version + 1 ELSE published_revision END,
        version = version + 1, updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${id.toLowerCase()} AND deleted_at IS NULL AND version = ${expected}
      RETURNING *
    ), revision AS (
      INSERT INTO cms_page_revisions (page_id, revision_number, snapshot, revision_status, override_reason, created_by)
      SELECT id, version, ${JSON.stringify(snapshot)}::jsonb, ${publish ? 'published' : 'draft'}, ${quality?.overrideReason || null}, ${actor}
      FROM updated
    ) SELECT id, title, slug, intro, body, body_rich_text, body_schema_version,
      category, image_alt, image_caption, image_decorative, status, version,
      published_revision, created_at, updated_at, published_at, deleted_at,
      (status = 'published' AND version <> COALESCE(published_revision, 0)) AS has_unpublished_changes
      FROM updated
  `;
  if (!page) throw cmsError('Page version conflict', 'CMS_VERSION_CONFLICT');
  revalidatePublicCmsContent();
  return attachFiles(sql, page);
}

export async function setAdminCmsPageStatus(id, status, input = {}) {
  const user = await requirePermission('cms');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!/^[a-f0-9]{32}$/i.test(id || '') || !['draft', 'published', 'archived', 'restore'].includes(status)) throw new Error('Invalid page');
  const expected = expectedVersion(typeof input === 'number' ? { expectedVersion: input } : input);
  const sql = getSql();
  const includeArchived = status === 'restore';
  const [current] = await sql`SELECT id, title, slug, intro, body, body_rich_text, body_schema_version,
    category, image_alt, image_caption, image_decorative, status, version,
    published_revision, created_at, updated_at, published_at, deleted_at
    FROM cms_pages WHERE id = ${id.toLowerCase()} AND (${includeArchived} OR deleted_at IS NULL)`;
  if (!current) throw new Error('Page not found');
  const files = await filesForPage(sql, current.id);
  const publish = status === 'published';
  const quality = publish ? assertPublishable(current, files, input.overrideReason) : null;
  const revisionStatus = status === 'draft' ? 'unpublished' : status === 'restore' ? 'restored' : status;
  const snapshot = pageSnapshot(current, files);
  const actor = user.email.toLowerCase();
  const [page] = await sql`
    WITH updated AS (
      UPDATE cms_pages
      SET status = CASE WHEN ${publish} THEN 'published' ELSE 'draft' END,
        deleted_at = CASE WHEN ${status} = 'archived' THEN NOW() WHEN ${status} = 'restore' THEN NULL ELSE deleted_at END,
        published_at = CASE WHEN ${publish} THEN COALESCE(published_at, NOW()) ELSE published_at END,
        published_revision = CASE WHEN ${publish} THEN version + 1 ELSE published_revision END,
        version = version + 1, updated_at = NOW(), last_changed_by = ${actor}
      WHERE id = ${id.toLowerCase()} AND version = ${expected}
        AND (${includeArchived} OR deleted_at IS NULL)
      RETURNING *
    ), revision AS (
      INSERT INTO cms_page_revisions (page_id, revision_number, snapshot, revision_status, override_reason, created_by)
      SELECT id, version, ${JSON.stringify(snapshot)}::jsonb, ${revisionStatus}, ${quality?.overrideReason || null}, ${actor}
      FROM updated
    ) SELECT id, title, slug, intro, body, body_rich_text, body_schema_version,
      category, image_alt, image_caption, image_decorative, status, version,
      published_revision, created_at, updated_at, published_at, deleted_at,
      (status = 'published' AND version <> COALESCE(published_revision, 0)) AS has_unpublished_changes
      FROM updated
  `;
  if (!page) throw cmsError('Page version conflict', 'CMS_VERSION_CONFLICT');
  revalidatePublicCmsContent();
  return attachFiles(sql, page);
}

export async function deleteAdminCmsPage(id) {
  const page = await getAdminCmsPage(id);
  if (!page) throw new Error('Page not found');
  await setAdminCmsPageStatus(id, 'archived', { expectedVersion: page.version });
}

export async function getAdminCmsPageRevisions(id) {
  await requirePermission('cms');
  if (isMockMode()) return [];
  if (!/^[a-f0-9]{32}$/i.test(id || '')) throw new Error('Invalid page');
  return getSql()`
    SELECT revision_number, revision_status, override_reason, created_at, created_by,
      snapshot->>'title' AS title
    FROM cms_page_revisions
    WHERE page_id = ${id.toLowerCase()}
    ORDER BY revision_number DESC
    LIMIT 100
  `;
}

export async function getAdminCmsPageRevision(id, revisionNumber) {
  await requirePermission('cms');
  if (isMockMode()) return null;
  if (!/^[a-f0-9]{32}$/i.test(id || '') || !Number.isInteger(revisionNumber) || revisionNumber < 1) return null;
  const sql = getSql();
  const [revision] = await sql`SELECT snapshot, revision_number, revision_status, created_at FROM cms_page_revisions WHERE page_id = ${id.toLowerCase()} AND revision_number = ${revisionNumber}`;
  if (!revision) return null;
  const source = revision.snapshot;
  return attachFiles(sql, {
    id: id.toLowerCase(), title: source.title, slug: source.slug, intro: source.intro,
    body: source.body, body_rich_text: source.bodyRichText, category: source.category,
    image_alt: source.imageAlt, image_caption: source.imageCaption,
    image_decorative: source.imageDecorative, status: revision.revision_status,
    version: revision.revision_number, updated_at: revision.created_at, snapshot_files: source.files || [],
  });
}

export async function restoreAdminCmsPageRevision(id, revisionNumber, input) {
  const user = await requirePermission('cms');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const expected = expectedVersion(input);
  if (!/^[a-f0-9]{32}$/i.test(id || '') || !Number.isInteger(revisionNumber) || revisionNumber < 1) throw new Error('Invalid revision');
  const sql = getSql();
  const [revision] = await sql`SELECT snapshot FROM cms_page_revisions WHERE page_id = ${id.toLowerCase()} AND revision_number = ${revisionNumber}`;
  if (!revision) throw new Error('Revision not found');
  const source = revision.snapshot;
  const rich = sanitizeRichText(source.bodyRichText);
  const snapshot = { ...source, bodyRichText: rich, schemaVersion: 1, bodySchemaVersion: CMS_RICH_TEXT_SCHEMA_VERSION };
  const fileIds = (Array.isArray(source.files) ? source.files : []).map(({ id: fileId }) => fileId).filter((fileId) => /^[a-f0-9]{32}$/i.test(fileId || ''));
  const actor = user.email.toLowerCase();
  const [page] = await sql`
    WITH version_gate AS (
      SELECT cms_pages.id FROM cms_pages
      WHERE cms_pages.id = ${id.toLowerCase()} AND cms_pages.deleted_at IS NULL AND cms_pages.version = ${expected}
    ), deactivate_files AS (
      UPDATE cms_attachments AS attachment
      SET deleted_at = NOW(), updated_at = NOW(), last_changed_by = ${actor}
      WHERE attachment.page_id = ${id.toLowerCase()} AND attachment.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM version_gate)
      RETURNING attachment.id
    ), restore_files AS (
      UPDATE cms_attachments AS attachment
      SET deleted_at = NULL, title = restored.title, sort_order = restored."sortOrder",
        updated_at = NOW(), last_changed_by = ${actor}
      FROM jsonb_to_recordset(${JSON.stringify(source.files || [])}::jsonb)
        AS restored(id text, title text, "sortOrder" integer)
      WHERE attachment.page_id = ${id.toLowerCase()} AND attachment.id = restored.id
        AND attachment.id = ANY(${fileIds}::text[])
        AND EXISTS (SELECT 1 FROM version_gate) AND (SELECT COUNT(*) FROM deactivate_files) >= 0
      RETURNING attachment.id
    ), updated AS (
      UPDATE cms_pages
      SET title = ${snapshot.title}, slug = ${snapshot.slug}, intro = ${snapshot.intro || null},
        body = ${snapshot.body || null}, body_rich_text = ${rich ? JSON.stringify(rich) : null}::jsonb,
        body_schema_version = ${CMS_RICH_TEXT_SCHEMA_VERSION}, category = ${snapshot.category},
        image_alt = ${snapshot.imageAlt || null}, image_caption = ${snapshot.imageCaption || null},
        image_decorative = ${Boolean(snapshot.imageDecorative)}, version = cms_pages.version + 1,
        updated_at = NOW(), last_changed_by = ${actor}
      WHERE cms_pages.id = ${id.toLowerCase()} AND cms_pages.deleted_at IS NULL AND cms_pages.version = ${expected}
        AND (SELECT COUNT(*) FROM restore_files) >= 0
      RETURNING *
    ), restored AS (
      INSERT INTO cms_page_revisions (page_id, revision_number, snapshot, revision_status, created_by)
      SELECT updated.id, updated.version, ${JSON.stringify(snapshot)}::jsonb, 'restored', ${actor} FROM updated
    ) SELECT updated.id, updated.title, updated.slug, updated.intro, updated.body, updated.body_rich_text, updated.body_schema_version,
      updated.category, updated.image_alt, updated.image_caption, updated.image_decorative, updated.status, updated.version,
      updated.published_revision, updated.created_at, updated.updated_at, updated.published_at, updated.deleted_at,
      (updated.status = 'published' AND updated.version <> COALESCE(updated.published_revision, 0)) AS has_unpublished_changes
      FROM updated
  `;
  if (!page) throw cmsError('Page version conflict', 'CMS_VERSION_CONFLICT');
  return attachFiles(sql, page);
}

export async function getPublishedCmsPage(slug) {
  if (isMockMode() || typeof slug !== 'string') return null;
  const sql = getSql();
  const [page] = await sql`
    SELECT p.id, r.snapshot->>'title' AS title, r.snapshot->>'slug' AS slug,
      r.snapshot->>'intro' AS intro, r.snapshot->>'body' AS body,
      NULLIF(r.snapshot->'bodyRichText', 'null'::jsonb) AS body_rich_text,
      r.snapshot->>'category' AS category, r.snapshot->>'imageAlt' AS image_alt,
      r.snapshot->>'imageCaption' AS image_caption,
      COALESCE((r.snapshot->>'imageDecorative')::boolean, FALSE) AS image_decorative,
      p.status, p.created_at, p.updated_at, p.published_at,
      COALESCE(r.snapshot->'files', '[]'::jsonb) AS snapshot_files
    FROM cms_pages p
    JOIN cms_page_revisions r ON r.page_id = p.id AND r.revision_number = p.published_revision
    WHERE r.snapshot->>'slug' = ${slug} AND p.status = 'published' AND p.deleted_at IS NULL
  `;
  return attachFiles(sql, page);
}

export async function getPublishedCmsPageSummaries(limit = 6) {
  if (isMockMode()) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 20);
  const sql = getSql();
  const pages = await sql`
    SELECT p.id, r.snapshot->>'title' AS title, r.snapshot->>'slug' AS slug,
      r.snapshot->>'intro' AS intro, r.snapshot->>'category' AS category,
      r.snapshot->>'imageAlt' AS image_alt, p.published_at, p.updated_at,
      COALESCE(r.snapshot->'files', '[]'::jsonb) AS snapshot_files
    FROM cms_pages p
    JOIN cms_page_revisions r ON r.page_id = p.id AND r.revision_number = p.published_revision
    WHERE p.status = 'published' AND p.deleted_at IS NULL
    ORDER BY p.published_at DESC, p.updated_at DESC
    LIMIT ${safeLimit}
  `;
  return pages.map(({ snapshot_files: files, ...page }) => {
    const imageId = files.find?.(({ kind }) => kind === 'image')?.id;
    return { ...page, image: imageId ? { id: imageId, url: `/api/cms/files/${imageId}` } : null };
  });
}

export { analyzeCmsContent };
