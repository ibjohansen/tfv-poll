import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { buildMemberWorkbook } from './member-workbook.js';

function normalizeMemberIds(scope, memberIds) {
  if (scope === 'all') return [];
  if (scope !== 'selected' || !Array.isArray(memberIds) || !memberIds.length || memberIds.length > 5000) {
    throw new Error('Invalid member selection');
  }
  const ids = [...new Set(memberIds.map(String))];
  if (!ids.every((id) => /^\d+$/.test(id))) throw new Error('Invalid member selection');
  return ids;
}

export async function createMemberExport({ scope, memberIds, surveyId, baseUrl }) {
  await requirePermission('members');
  if (isMockMode()) throw new Error('Mock data cannot be exported');
  if (!/^[a-f0-9]{32}$/i.test(surveyId || '')) throw new Error('Invalid survey ID');
  const ids = normalizeMemberIds(scope, memberIds);
  const sql = getSql();
  const [survey] = await sql`SELECT id, title, is_open FROM surveys WHERE id = ${surveyId.toLowerCase()} AND deleted_at IS NULL`;
  if (!survey) throw new Error('Survey not found');
  const members = await sql`
    SELECT m.h_number, m.cadastral_number, m.section_number, m.street_address,
      m.title_holder, m.registration_date, m.primary_contact_name,
      m.primary_contact_email, m.other_contact_emails,
      EXISTS (
        SELECT 1 FROM survey_responses r
        WHERE r.member_id = m.id AND r.survey_id = ${survey.id}
      ) AS has_responded
    FROM members m
    WHERE m.deleted_at IS NULL
      AND (${scope === 'all'} OR m.id = ANY(${ids}::bigint[]))
    ORDER BY CASE WHEN m.h_number ~ '^\d+$' THEN m.h_number::bigint END NULLS LAST,
      m.h_number, m.id
  `;
  if (!members.length) throw new Error('No members selected');
  return {
    buffer: await buildMemberWorkbook({ members, survey, baseUrl }),
    count: members.length,
    survey,
  };
}
