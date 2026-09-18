// One statement claims the session, chooses the first committed response for its
// scope and queues the receipt. A conflict never replaces answers or snapshots.
export async function storeSurveyResponse(sql, { sessionHash, environment, audience, questionVersion, answers }) {
  const [result] = await sql`
    WITH claimed AS (
      UPDATE survey_sessions ss SET answered_at = NOW(), revoked_at = NOW()
      FROM surveys s, members m
      WHERE ss.session_token_hash = ${sessionHash} AND ss.revoked_at IS NULL AND ss.answered_at IS NULL
        AND ss.expires_at > NOW() AND ss.absolute_expires_at > NOW()
        AND ss.environment = ${environment} AND ss.audience = ${audience}
        AND s.id = ss.survey_id AND s.deleted_at IS NULL AND s.is_open = TRUE
        AND s.question_version = ${questionVersion} AND s.ends_on >= (NOW() AT TIME ZONE 'Europe/Oslo')::date
        AND m.id = ss.member_id AND m.deleted_at IS NULL AND m.membership_status = 'member'
        AND COALESCE(ss.recipient_email, NULLIF(btrim(m.primary_contact_email), '')) IS NOT NULL
        AND (ss.recipient_email IS NULL OR ss.recipient_email = lower(btrim(m.primary_contact_email))
          OR EXISTS (SELECT 1 FROM unnest(m.other_contact_emails) e WHERE lower(btrim(e)) = ss.recipient_email))
      RETURNING ss.id, ss.member_id, ss.survey_id,
        COALESCE(ss.recipient_email, lower(btrim(m.primary_contact_email))) AS respondent_email,
        lower(btrim(m.primary_contact_email)) AS primary_email,
        s.questions, s.question_version, s.single_response_per_property
    ), winner AS (
      INSERT INTO survey_responses (member_id, survey_id, response_key, respondent_email, submission_session_id, question_version, questions, answers, last_changed_by)
      SELECT member_id, survey_id, CASE WHEN single_response_per_property THEN 'property' ELSE 'email:' || respondent_email END,
        respondent_email, id, question_version, questions, ${JSON.stringify(answers)}::jsonb, 'member:' || member_id::text
      FROM claimed
      ON CONFLICT (member_id, survey_id, response_key) DO UPDATE SET response_key = EXCLUDED.response_key
      RETURNING id, member_id, survey_id, submission_session_id
    ), receipt AS (
      INSERT INTO survey_response_receipts (id, response_id, member_id, survey_id, recipient_email, submitted_by, accepted, attempted_questions, attempted_answers)
      SELECT c.id, w.id, c.member_id, c.survey_id, c.primary_email, c.respondent_email,
        w.submission_session_id IS NOT DISTINCT FROM c.id, c.questions, ${JSON.stringify(answers)}::jsonb
      FROM claimed c JOIN winner w ON w.member_id = c.member_id AND w.survey_id = c.survey_id
      ON CONFLICT (id) DO NOTHING RETURNING id, response_id, member_id, survey_id, accepted
    ), completed_tokens AS (
      UPDATE survey_access_tokens t SET answered_at = NOW(), revoked_at = NOW()
      FROM claimed c WHERE t.member_id = c.member_id AND t.survey_id = c.survey_id
        AND COALESCE(t.recipient_email, c.primary_email) = c.respondent_email AND t.revoked_at IS NULL
      RETURNING t.id
    ), security_event AS (
      INSERT INTO security_events (event_type, actor_type, result, member_id, survey_id, entity_id, metadata)
      SELECT 'survey_response_submitted', 'member', CASE WHEN accepted THEN 'accepted' ELSE 'already_answered' END,
        member_id, survey_id, id, ${JSON.stringify({ environment, audience })}::jsonb
      FROM receipt
      RETURNING id
    ) SELECT * FROM receipt
  `;
  return result || null;
}
