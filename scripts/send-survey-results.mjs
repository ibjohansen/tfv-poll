import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { getSql } from '../lib/db.js';
import { summarizeSurveyResponses } from '../lib/survey-results.js';
import { buildSurveyResultsEmail } from '../lib/survey-results-email.js';
import { getMailerSendConfig, requireMailerSendBulkEnabled, getMailerSendSuppressions, isSuppressedRecipient, normalizeEmail, sendEmail } from '../lib/mailer-service.js';

// One approved results mailing; never creates survey invitations or access tokens.
const surveyId = '4f7f5ef355f14d87ac2683a224cfe16c';
const batch = `survey-results-2026-10-01:${surveyId}`;
const actor = 'ib@turufjellvel.no';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const sql = getSql();
const mode = process.argv[2] || '--preview';
if (!['--preview', '--send', '--status'].includes(mode)) throw new Error('Use --preview, --send or --status');

async function savedBatch() {
  const [entry] = await sql`SELECT after_value FROM audit_log WHERE table_name='admin_actions' AND row_id=${batch}
    AND after_value->>'action'='survey_results_prepared' ORDER BY id LIMIT 1`;
  return entry?.after_value;
}

async function status(ids) {
  return sql`SELECT status, failure_reason, count(*)::int AS count FROM email_deliveries WHERE id=ANY(${ids}::text[])
    GROUP BY status, failure_reason ORDER BY status, failure_reason`;
}

const existing = await savedBatch();
if (mode === '--status') {
  console.log(JSON.stringify(existing ? { batch, expected: existing.count, deliveries: await status(existing.delivery_ids) } : { batch, prepared: false }));
} else {
  const [[survey], responses, audience] = await sql.transaction([
    sql`SELECT id,title,questions,question_version FROM surveys WHERE id=${surveyId} AND deleted_at IS NULL`,
    sql`SELECT question_version,questions,answers FROM survey_responses WHERE survey_id=${surveyId} ORDER BY created_at,id`,
    sql`SELECT lower(btrim(recipient_email)) AS email, array_agg(DISTINCT member_id ORDER BY member_id) AS member_ids
      FROM email_deliveries WHERE survey_id=${surveyId} AND email_type='survey_invitation'
        AND (sent_at IS NOT NULL OR delivered_at IS NOT NULL OR status IN ('sent','delivered'))
      GROUP BY lower(btrim(recipient_email)) ORDER BY lower(btrim(recipient_email))`,
  ], { readOnly: true, isolationLevel: 'RepeatableRead' });
  const propertyCount = new Set(audience.flatMap(a => a.member_ids.map(String))).size;
  if (!survey || responses.length !== 274 || audience.length !== 424 || propertyCount !== 419
    || audience.some(a => normalizeEmail(a.email) !== a.email)) throw new Error('Approved survey or audience differs; inspect before sending.');
  const results = summarizeSurveyResponses(survey, responses);
  const counts = results.versions.flatMap(v => v.questions.map(q => Object.values(q.counts)));
  if (JSON.stringify(counts) !== '[[159,115],[163,111],[98,176],[50,224]]') throw new Error('Approved results changed.');
  const message = await buildSurveyResultsEmail({ results, baseUrl: 'https://medlemsservice.turufjellvel.no', isTest: false });
  if (message.subject !== 'Resultatet av medlemsundersøkelsen' || message.html.includes('Testmelding:')) throw new Error('Invalid production message');
  const messageHash = digest(JSON.stringify(message));
  const recipients = audience.map(a => ({ ...a, id: digest(`${batch}:${a.email}`).slice(0, 32) }));
  let suppressions = await getMailerSendSuppressions({ sql, context: { emailType: 'newsletter', surveyId } });
  const local = new Set((await sql`SELECT recipient_email FROM email_suppressions`).map(r => r.recipient_email));
  console.log(JSON.stringify({ batch, properties: propertyCount, recipients: recipients.length, responses: results.response_count,
    suppressed: recipients.filter(r => local.has(r.email) || isSuppressedRecipient(r.email, suppressions)).length,
    inlineImages: message.attachments.length, messageHash, mode }));
  if (mode === '--send') {
    getMailerSendConfig(); requireMailerSendBulkEnabled();
    const [database] = await sql`SELECT environment FROM application_environment WHERE singleton=TRUE`;
    if (database?.environment !== 'production' || (process.env.APP_ENVIRONMENT && process.env.APP_ENVIRONMENT !== 'production')) {
      throw new Error('Production database required');
    }
    const metadata = { action: 'survey_results_prepared', survey_id: surveyId, count: recipients.length,
      property_count: propertyCount, message_sha256: messageHash, delivery_ids: recipients.map(r => r.id) };
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext(${batch}))`,
      sql`INSERT INTO email_deliveries (id,survey_id,recipient_email,email_type,subject,audience_member_ids,requested_by)
        SELECT r.id,${surveyId},r.email,'newsletter',${message.subject},r.member_ids,${actor}
        FROM jsonb_to_recordset(${JSON.stringify(recipients)}::jsonb) AS r(id text,email text,member_ids bigint[])
        WHERE NOT EXISTS(SELECT 1 FROM audit_log WHERE table_name='admin_actions' AND row_id=${batch}
          AND after_value->>'action'='survey_results_prepared')`,
      sql`INSERT INTO audit_log (table_name,row_id,operation,changed_by,after_value)
        SELECT 'admin_actions',${batch},'INSERT',${actor},${JSON.stringify(metadata)}::jsonb
        WHERE NOT EXISTS(SELECT 1 FROM audit_log WHERE table_name='admin_actions' AND row_id=${batch}
          AND after_value->>'action'='survey_results_prepared')`,
    ]);
    const saved = await savedBatch();
    if (saved.message_sha256 !== messageHash || JSON.stringify(saved.delivery_ids) !== JSON.stringify(metadata.delivery_ids)) {
      throw new Error('Frozen message or audience changed; no sending.');
    }
    let handled = 0;
    let retryAttempts = 0;
    while (true) {
      if (handled && handled % 50 === 0) suppressions = await getMailerSendSuppressions({ sql, context: { emailType: 'newsletter', surveyId } });
      const [delivery] = await sql`UPDATE email_deliveries SET status='processing',processing_at=NOW()
        WHERE id=(SELECT id FROM email_deliveries WHERE id=ANY(${saved.delivery_ids}::text[]) AND status='pending' ORDER BY id LIMIT 1)
          AND status='pending' RETURNING id,recipient_email`;
      if (!delivery) break;
      const [blocked] = await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email=${delivery.recipient_email}`;
      if (blocked || isSuppressedRecipient(delivery.recipient_email, suppressions)) {
        await sql`UPDATE email_deliveries SET status='suppressed',failure_reason='RECIPIENT_SUPPRESSED',failed_at=NOW() WHERE id=${delivery.id}`;
        handled++;
        continue;
      }
      let accepted;
      try {
        accepted = await sendEmail({ ...message, to: delivery.recipient_email, tags: ['survey-results'],
          context: { emailType: 'newsletter', surveyId, deliveryId: delivery.id, recipient: delivery.recipient_email } }, { sql });
      } catch (error) {
        if (['MAILERSEND_RATE_LIMIT', 'MAILERSEND_DAILY_QUOTA'].includes(error.code)) {
          await sql`UPDATE email_deliveries SET status='pending',processing_at=NULL WHERE id=${delivery.id} AND status='processing'`;
          console.log(JSON.stringify({ paused: error.code, retryAt: error.retryAt, deliveries: await status(saved.delivery_ids) }));
          if (error.code === 'MAILERSEND_DAILY_QUOTA' || ++retryAttempts > 5) throw error;
          const until = Math.max(Date.now() + 60_000, Date.parse(error.retryAt || '') || 0);
          while (Date.now() < until) await delay(Math.min(30_000, until - Date.now()));
          continue;
        }
        await sql`UPDATE email_deliveries SET status=${error.code === 'SUPPRESSED' ? 'suppressed' : 'failed'},
          failure_reason=${error.code === 'SUPPRESSED' ? 'RECIPIENT_SUPPRESSED' : 'SEND_FAILED_OR_UNCERTAIN'},failed_at=NOW() WHERE id=${delivery.id}`;
        // Stop to inspect any ambiguous delivery; never automatically resend it.
        throw error;
      }
      // Log acceptance before updating the database, so a failed update cannot cause a blind retry.
      console.log(JSON.stringify({ accepted: delivery.id, messageId: accepted.messageId }));
      await sql`UPDATE email_deliveries SET status='sent',provider_message_id=${accepted.messageId},sent_at=NOW()
        WHERE id=${delivery.id} AND status='processing'`;
      handled++;
      if (handled % 25 === 0) console.log(JSON.stringify({ progress: await status(saved.delivery_ids) }));
      await delay(1100);
    }
    const final = await status(saved.delivery_ids);
    await sql`INSERT INTO audit_log (table_name,row_id,operation,changed_by,after_value)
      VALUES ('admin_actions',${batch},'INSERT',${actor},${JSON.stringify({ action: 'survey_results_processed', survey_id: surveyId, counts: final })}::jsonb)`;
    console.log(JSON.stringify({ finished: true, deliveries: final }));
  }
}
