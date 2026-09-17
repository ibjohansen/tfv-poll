import { randomUUID } from 'node:crypto';
import { requirePermission } from './admin-access.js';
import { deleteCmsObject, uploadCmsObject } from './cms-storage.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { defaultFileTitle, validateUploadedFile } from './upload-validation.js';

const idPattern = /^[a-f0-9]{32}$/i;

function validateId(value, message) {
  if (!idPattern.test(value || '')) throw new Error(message);
  return value.toLowerCase();
}

function fileResult(file) {
  return {
    id: file.id, title: file.title, original_filename: file.original_filename,
    mime_type: file.mime_type, size_bytes: Number(file.size_bytes), sort_order: file.sort_order,
    url: `/api/survey/files/${file.id}`,
  };
}

export async function listSurveyAttachments(sql, surveyId) {
  const rows = await sql`
    SELECT id, title, original_filename, mime_type, size_bytes, sort_order
    FROM survey_attachments
    WHERE survey_id = ${surveyId} AND deleted_at IS NULL
    ORDER BY sort_order, created_at, id
  `;
  return rows.map(fileResult);
}

async function requireSurvey(sql, surveyId) {
  const id = validateId(surveyId, 'Invalid survey ID');
  const [survey] = await sql`SELECT id FROM surveys WHERE id = ${id} AND deleted_at IS NULL`;
  if (!survey) throw new Error('Survey not found');
  return survey;
}

export async function uploadAdminSurveyAttachment(surveyId, file) {
  const user = await requirePermission('surveys');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const sql = getSql();
  const survey = await requireSurvey(sql, surveyId);
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM survey_attachments
    WHERE survey_id = ${survey.id} AND deleted_at IS NULL
  `;
  if (count >= 20) throw new Error('Too many survey attachments');
  const validated = await validateUploadedFile(file);
  const id = randomUUID().replaceAll('-', '');
  const key = `surveys/${survey.id}/attachments/${id}.${validated.extension}`;
  const actor = user.email.toLowerCase();
  await uploadCmsObject(key, validated.bytes, validated.mimeType);
  try {
    const results = await sql.transaction([
      sql`
        INSERT INTO survey_attachments (id, survey_id, title, original_filename,
          storage_key, mime_type, size_bytes, sort_order, last_changed_by)
        VALUES (${id}, ${survey.id}, ${defaultFileTitle(validated.filename)}, ${validated.filename},
          ${key}, ${validated.mimeType}, ${validated.size}, COALESCE((
            SELECT MAX(sort_order) + 1 FROM survey_attachments
            WHERE survey_id = ${survey.id} AND deleted_at IS NULL
          ), 0), ${actor})
        RETURNING id, title, original_filename, mime_type, size_bytes, sort_order
      `,
      sql`UPDATE surveys SET updated_at = NOW(), last_changed_by = ${actor} WHERE id = ${survey.id}`,
    ]);
    return fileResult(results[0][0]);
  } catch (error) {
    await deleteCmsObject(key).catch(() => {});
    throw error;
  }
}

export async function updateAdminSurveyAttachment(surveyId, attachmentId, title) {
  const user = await requirePermission('surveys');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const id = validateId(surveyId, 'Invalid survey ID');
  const fileId = validateId(attachmentId, 'Invalid attachment');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) throw new Error('Invalid attachment');
  const sql = getSql();
  const [file] = await sql`
    WITH updated_attachment AS (
      UPDATE survey_attachments SET title = ${title.trim()}, updated_at = NOW(), last_changed_by = ${user.email.toLowerCase()}
      WHERE id = ${fileId} AND survey_id = ${id} AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM surveys WHERE id = ${id} AND deleted_at IS NULL)
      RETURNING id, title, original_filename, mime_type, size_bytes, sort_order
    ), updated_survey AS (
      UPDATE surveys SET updated_at = NOW(), last_changed_by = ${user.email.toLowerCase()}
      WHERE id = ${id} AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM updated_attachment)
      RETURNING id
    )
    SELECT a.* FROM updated_attachment a JOIN updated_survey s ON TRUE
  `;
  if (!file) throw new Error('Attachment not found');
  return fileResult(file);
}

export async function deleteAdminSurveyAttachment(surveyId, attachmentId) {
  const user = await requirePermission('surveys');
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const id = validateId(surveyId, 'Invalid survey ID');
  const fileId = validateId(attachmentId, 'Invalid attachment');
  const sql = getSql();
  const [file] = await sql`
    WITH deleted_attachment AS (
      UPDATE survey_attachments SET deleted_at = NOW(), updated_at = NOW(), last_changed_by = ${user.email.toLowerCase()}
      WHERE id = ${fileId} AND survey_id = ${id} AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM surveys WHERE id = ${id} AND deleted_at IS NULL)
      RETURNING id
    ), updated_survey AS (
      UPDATE surveys SET updated_at = NOW(), last_changed_by = ${user.email.toLowerCase()}
      WHERE id = ${id} AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM deleted_attachment)
      RETURNING id
    )
    SELECT a.id FROM deleted_attachment a JOIN updated_survey s ON TRUE
  `;
  if (!file) throw new Error('Attachment not found');
}

async function attachmentForDownload(id, surveyId = null) {
  if (!idPattern.test(id || '') || (surveyId !== null && !idPattern.test(surveyId || ''))) return null;
  const sql = getSql();
  const [file] = await sql`
    SELECT a.id, a.survey_id, a.original_filename, a.storage_key, a.mime_type, a.size_bytes
    FROM survey_attachments a JOIN surveys s ON s.id = a.survey_id
    WHERE a.id = ${id.toLowerCase()} AND a.deleted_at IS NULL AND s.deleted_at IS NULL
      AND (${surveyId}::text IS NULL OR a.survey_id = ${surveyId ? surveyId.toLowerCase() : null})
  `;
  return file || null;
}

export async function getMemberSurveyAttachment(id, surveyId) {
  return attachmentForDownload(id, surveyId);
}

export async function getAdminSurveyAttachment(id) {
  await requirePermission('surveys');
  return attachmentForDownload(id);
}
