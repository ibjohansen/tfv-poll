import { randomUUID } from 'node:crypto';
import { getSql } from './db.js';
import { requirePermission } from './admin-access.js';
import { isMockMode } from './mock-store.js';
import { validateCmsPageInput } from './cms-validation.js';

function cleanOptional(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function publicFile(file) {
  if (!file) return null;
  return { ...file, url: `/api/cms/files/${file.id}` };
}

async function attachFiles(sql, page) {
  if (!page) return null;
  const files = await sql`
    SELECT id, kind, title, original_filename, mime_type, size_bytes, sort_order
    FROM cms_attachments
    WHERE page_id = ${page.id} AND deleted_at IS NULL
    ORDER BY kind DESC, sort_order, created_at, id
  `;
  return {
    ...page,
    image: publicFile(files.find(({ kind }) => kind === 'image')),
    attachments: files.filter(({ kind }) => kind === 'attachment').map(publicFile),
  };
}

export async function getAdminCmsPages(search = '') {
  await requirePermission('cms');
  if (isMockMode()) return [];
  const sql = getSql();
  return sql`
    SELECT p.id, p.title, p.slug, p.category, p.status, p.created_at,
      p.updated_at, p.published_at, COUNT(a.id)::int AS attachment_count
    FROM cms_pages p
    LEFT JOIN cms_attachments a ON a.page_id = p.id AND a.deleted_at IS NULL AND a.kind = 'attachment'
    WHERE p.deleted_at IS NULL AND strpos(lower(p.title), lower(${search})) > 0
    GROUP BY p.id
    ORDER BY p.updated_at DESC, lower(p.title), p.id
    LIMIT 500
  `;
}

export async function getAdminCmsPage(id) {
  await requirePermission('cms');
  if (isMockMode()) return null;
  if (!/^[a-f0-9]{32}$/i.test(id || '')) return null;
  const sql = getSql();
  const [page] = await sql`
    SELECT id, title, slug, intro, body, category, image_alt, image_caption,
      status, created_at, updated_at, published_at
    FROM cms_pages
    WHERE id = ${id.toLowerCase()} AND deleted_at IS NULL
  `;
  return attachFiles(sql, page);
}

export async function createAdminCmsPage(input) {
  const user = await requirePermission('cms');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!validateCmsPageInput(input)) throw new Error('Invalid page');
  const id = randomUUID().replaceAll('-', '');
  const sql = getSql();
  const [page] = await sql`
    INSERT INTO cms_pages (id, title, slug, intro, body, category, image_alt,
      image_caption, status, published_at, last_changed_by)
    VALUES (${id}, ${input.title.trim()}, ${input.slug}, ${cleanOptional(input.intro)},
      ${cleanOptional(input.body)}, ${input.category}, ${cleanOptional(input.imageAlt)},
      ${cleanOptional(input.imageCaption)}, ${input.status},
      CASE WHEN ${input.status} = 'published' THEN NOW() ELSE NULL END, ${user.email.toLowerCase()})
    RETURNING id, title, slug, intro, body, category, image_alt, image_caption,
      status, created_at, updated_at, published_at
  `;
  return { ...page, image: null, attachments: [] };
}

export async function updateAdminCmsPage(id, input) {
  const user = await requirePermission('cms');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!/^[a-f0-9]{32}$/i.test(id || '') || !validateCmsPageInput(input)) throw new Error('Invalid page');
  const sql = getSql();
  const [page] = await sql`
    UPDATE cms_pages
    SET title = ${input.title.trim()}, slug = ${input.slug}, intro = ${cleanOptional(input.intro)},
      body = ${cleanOptional(input.body)}, category = ${input.category},
      image_alt = ${cleanOptional(input.imageAlt)}, image_caption = ${cleanOptional(input.imageCaption)},
      status = ${input.status},
      published_at = CASE WHEN ${input.status} = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END,
      updated_at = NOW(), last_changed_by = ${user.email.toLowerCase()}
    WHERE id = ${id.toLowerCase()} AND deleted_at IS NULL
    RETURNING id, title, slug, intro, body, category, image_alt, image_caption,
      status, created_at, updated_at, published_at
  `;
  if (!page) throw new Error('Page not found');
  return attachFiles(sql, page);
}

export async function setAdminCmsPageStatus(id, status) {
  const user = await requirePermission('cms');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!/^[a-f0-9]{32}$/i.test(id || '') || !['draft', 'published'].includes(status)) throw new Error('Invalid page');
  const sql = getSql();
  const [page] = await sql`
    UPDATE cms_pages
    SET status = ${status},
      published_at = CASE WHEN ${status} = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END,
      updated_at = NOW(), last_changed_by = ${user.email.toLowerCase()}
    WHERE id = ${id.toLowerCase()} AND deleted_at IS NULL
    RETURNING id, title, slug, category, status, created_at, updated_at, published_at
  `;
  if (!page) throw new Error('Page not found');
  return page;
}

export async function deleteAdminCmsPage(id) {
  const user = await requirePermission('cms');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!/^[a-f0-9]{32}$/i.test(id || '')) throw new Error('Invalid page');
  const sql = getSql();
  const [page] = await sql`
    UPDATE cms_pages SET status = 'draft', deleted_at = NOW(), updated_at = NOW(), last_changed_by = ${user.email.toLowerCase()}
    WHERE id = ${id.toLowerCase()} AND deleted_at IS NULL
    RETURNING id
  `;
  if (!page) throw new Error('Page not found');
}

export async function getPublishedCmsPage(slug) {
  if (isMockMode() || typeof slug !== 'string') return null;
  const sql = getSql();
  const [page] = await sql`
    SELECT id, title, slug, intro, body, category, image_alt, image_caption,
      status, created_at, updated_at, published_at
    FROM cms_pages
    WHERE slug = ${slug} AND status = 'published' AND deleted_at IS NULL
  `;
  return attachFiles(sql, page);
}

export async function getPublishedCmsPageSummaries(limit = 6) {
  if (isMockMode()) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 20);
  const sql = getSql();
  const pages = await sql`
    SELECT p.id, p.title, p.slug, p.intro, p.category, p.image_alt,
      p.published_at, p.updated_at, image.id AS image_id
    FROM cms_pages p
    LEFT JOIN LATERAL (
      SELECT id
      FROM cms_attachments
      WHERE page_id = p.id AND kind = 'image' AND deleted_at IS NULL
      ORDER BY created_at DESC, id
      LIMIT 1
    ) image ON TRUE
    WHERE p.status = 'published' AND p.deleted_at IS NULL
    ORDER BY p.published_at DESC, p.updated_at DESC
    LIMIT ${safeLimit}
  `;
  return pages.map(({ image_id: imageId, ...page }) => ({
    ...page,
    image: imageId ? { id: imageId, url: `/api/cms/files/${imageId}` } : null,
  }));
}
