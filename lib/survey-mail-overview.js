// Load the complete survey-wide set before client filtering, sorting and display.
// Test emails are excluded. Accepted invitations do not imply delivery.
export async function getSurveyMailOverview(sql, surveyId) {
  const [result] = await sql.query(`
    WITH mail AS (
      SELECT 'invitation:' || id AS id, member_id, 'invitation'::text AS kind,
        recipient_email, status, failure_reason, created_at,
        (sent_at IS NOT NULL OR delivered_at IS NOT NULL OR status IN ('sent', 'delivered')) AS accepted
      FROM email_deliveries WHERE survey_id = $1 AND email_type = 'survey_invitation'
      UNION ALL
      SELECT 'receipt:' || id, member_id, 'receipt', recipient_email, status,
        failure_reason, created_at, (sent_at IS NOT NULL OR status = 'sent')
      FROM survey_response_receipts WHERE survey_id = $1
    ), counts AS (
      SELECT COUNT(*) FILTER (WHERE kind = 'invitation' AND accepted)::int AS sent_invitations,
        COUNT(DISTINCT member_id) FILTER (WHERE kind = 'invitation' AND accepted)::int AS sent_properties,
        COUNT(*) FILTER (WHERE status IN ('failed', 'bounced'))::int AS failed,
        COUNT(*) FILTER (WHERE status = 'suppressed')::int AS suppressed
      FROM mail
    ), failures AS (
      SELECT DISTINCT ON (after_value->>'mail_id') after_value->>'mail_id' AS mail_id, after_value AS diagnostic
      FROM audit_log WHERE table_name = 'email_events' AND after_value->>'survey_id' = $1::text
      ORDER BY after_value->>'mail_id', changed_at DESC, id DESC
    ), entries AS (
      SELECT f.id, f.member_id, f.kind, f.status, f.failure_reason, f.created_at, f.accepted,
        m.h_number, m.street_address, split_part(f.recipient_email, '@', 2) AS recipient_domain,
        CASE WHEN f.kind = 'receipt' THEN f.recipient_email ELSE NULL END AS recipient_email,
        CASE WHEN f.status IN ('failed', 'bounced', 'suppressed') THEN failures.diagnostic ELSE NULL END AS diagnostic
      FROM mail f LEFT JOIN members m ON m.id = f.member_id
      LEFT JOIN failures ON failures.mail_id = f.id
    )
    SELECT row_to_json(counts) AS counts,
      COALESCE((SELECT json_agg(entries ORDER BY created_at DESC, id DESC) FROM entries), '[]'::json) AS entries
    FROM counts
  `, [surveyId]);
  return result;
}
