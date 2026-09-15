import { randomUUID } from 'node:crypto';

// Only metadata about the generated export belongs here, never its contents,
// recipient addresses, tokens, request headers or download URLs.
export async function recordAdminExport(sql, { actor, action, count, scope, surveyId }) {
  if (!['member_export', 'survey_results_export'].includes(action)
    || typeof actor !== 'string' || !actor.trim() || actor.length > 320
    || !Number.isSafeInteger(count) || count < 0
    || !['all', 'selected'].includes(scope)
    || !/^[a-f0-9]{32}$/i.test(surveyId || '')) throw new Error('Invalid audit event');
  const details = { action, count, scope, survey_id: surveyId };
  await sql`
    INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
    VALUES ('admin_actions', ${randomUUID()}, 'INSERT', ${actor.trim().toLowerCase()}, ${JSON.stringify(details)}::jsonb)
  `;
}
