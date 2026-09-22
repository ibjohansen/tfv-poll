import { getSql } from './db.js';
import { randomUUID } from 'node:crypto';
import { assertDatabaseEnvironment } from './security-config.js';
import { isMailerSendConfigured, normalizeEmail, sendEmail, getMailerSendSuppressions, isSuppressedRecipient } from './mailer-service.js';
import { renderSurveyReceiptEmail } from './email-templates.js';
import { getApplicationBaseUrl } from './survey-email.js';

export async function processSurveyReceipts(options = {}) {
  const env = options.env || process.env;
  if (!isMailerSendConfigured(env)) return { pending: false, disabled: true };
  const sql = options.sql || getSql();
  await assertDatabaseEnvironment(sql, env);
  const token = randomUUID();
  const [lease] = await sql`UPDATE survey_receipt_worker SET token = ${token}, lease_expires_at = NOW() + INTERVAL '16 minutes'
    WHERE singleton = TRUE AND (token IS NULL OR lease_expires_at < NOW()) RETURNING singleton`;
  if (!lease) return { pending: false, workerBusy: true };
  try {
  const send = options.sendEmail || sendEmail;
  // An interrupted provider call may have succeeded. Never blindly resend it.
  await sql`UPDATE survey_response_receipts SET status = 'failed', failure_reason = 'UNCERTAIN_AFTER_INTERRUPTION'
    WHERE status = 'processing' AND processing_at < NOW() - INTERVAL '15 minutes'`;
  const suppressions = await (options.getSuppressions || getMailerSendSuppressions)({ env, sql });
  const deadline = Date.now() + 12 * 60_000;
  for (let index = 0; index < (options.batchSize || 100) && Date.now() + 35000 < deadline; index++) {
    const [receipt] = await sql`
      UPDATE survey_response_receipts SET status = 'processing', processing_at = NOW()
      WHERE id = (SELECT id FROM survey_response_receipts WHERE status = 'pending'
        ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED) AND status = 'pending'
      RETURNING *
    `;
    if (!receipt) break;
    const [source] = await sql`SELECT m.primary_contact_email, m.h_number, s.title,
      r.questions, r.answers, r.respondent_email
      FROM members m JOIN surveys s ON s.id = ${receipt.survey_id}
      JOIN survey_responses r ON r.id = ${receipt.response_id}
      WHERE m.id = ${receipt.member_id} AND m.deleted_at IS NULL AND s.deleted_at IS NULL`;
    const to = normalizeEmail(receipt.recipient_email);
    if (!source || !to || to !== normalizeEmail(source.primary_contact_email)) {
      await sql`UPDATE survey_response_receipts SET status = 'failed', failure_reason = 'PRIMARY_EMAIL_CHANGED_OR_MISSING' WHERE id = ${receipt.id}`;
      continue;
    }
    const [suppressed] = await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email = ${to}`;
    if (suppressed || isSuppressedRecipient(to, suppressions)) {
      await sql`UPDATE survey_response_receipts SET status = 'suppressed', failure_reason = 'RECIPIENT_SUPPRESSED' WHERE id = ${receipt.id}`;
      continue;
    }
    const rendered = renderSurveyReceiptEmail({ surveyTitle: source.title, hNumber: source.h_number, submittedBy: receipt.submitted_by,
      accepted: receipt.accepted, effectiveRespondent: source.respondent_email, questions: source.questions || [], answers: source.answers || {},
      attemptedQuestions: receipt.attempted_questions, attemptedAnswers: receipt.attempted_answers, baseUrl: getApplicationBaseUrl(env) });
    try {
      const { messageId } = await send({ to, ...rendered, tags: ['survey-receipt'], context: { emailType: 'survey_receipt', memberId: receipt.member_id, surveyId: receipt.survey_id, receiptId: receipt.id, recipient: to } }, { env, sql });
      await sql`UPDATE survey_response_receipts SET status = 'sent', provider_message_id = ${messageId}, sent_at = NOW() WHERE id = ${receipt.id}`;
    } catch (error) {
      await sql`UPDATE survey_response_receipts SET status = ${error.code === 'SUPPRESSED' ? 'suppressed' : 'failed'}, failure_reason = ${error.code || 'SEND_FAILED'} WHERE id = ${receipt.id}`;
    }
    if (options.delayMs !== 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs || 6100));
  }
  const [remaining] = await sql`SELECT EXISTS (SELECT 1 FROM survey_response_receipts WHERE status = 'pending') AS pending`;
  return { pending: Boolean(remaining?.pending) };
  } finally {
    await sql`UPDATE survey_receipt_worker SET token = NULL, lease_expires_at = NULL WHERE singleton = TRUE AND token = ${token}`;
  }
}
