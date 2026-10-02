import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSql } from '../lib/db.js';
import { summarizeSurveyResponses } from '../lib/survey-results.js';
import { buildSurveyResultsEmail } from '../lib/survey-results-email.js';
import { getMailerSendSuppressions, isSuppressedRecipient, sendEmail } from '../lib/mailer-service.js';

// Deliberately a single-recipient test only. No bulk-send path.
const recipient = 'ib.johansen.jr@gmail.com';
const surveyId = '4f7f5ef355f14d87ac2683a224cfe16c';
const sql = getSql();
const [[survey], responses] = await sql.transaction([
  sql`SELECT id, title, questions, question_version FROM surveys WHERE id = ${surveyId} AND deleted_at IS NULL`,
  sql`SELECT question_version, questions, answers FROM survey_responses WHERE survey_id = ${surveyId} ORDER BY created_at, id`,
], { readOnly: true, isolationLevel: 'RepeatableRead' });
if (!survey || responses.length !== 274) throw new Error('Resultatene må kontrolleres mot teksten før sending.');
const results = summarizeSurveyResponses(survey, responses);
const message = await buildSurveyResultsEmail({ results, baseUrl: 'https://medlemsservice.turufjellvel.no', isTest: true });
const directory = await mkdtemp(join(tmpdir(), 'survey-results-preview-'));
let preview = message.html;
for (const attachment of message.attachments) {
  await writeFile(join(directory, attachment.filename), Buffer.from(attachment.content, 'base64'));
  preview = preview.replaceAll(`cid:${attachment.id}`, attachment.filename);
}
await writeFile(join(directory, 'index.html'), preview);
await writeFile(join(directory, 'message.txt'), message.text);
console.log(JSON.stringify({ preview: directory, responses: results.response_count, questions: results.versions.flatMap(v => v.questions.map(q => ({ number: q.number, counts: q.counts, percentages: q.percentages }))), inlineImages: message.attachments.length }));
if (process.argv.includes('--send')) {
  const suppressions = await getMailerSendSuppressions({ sql, context: { emailType: 'survey_test', surveyId } });
  const local = await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email = ${recipient}`;
  if (local.length || isSuppressedRecipient(recipient, suppressions)) throw new Error('Testmottakeren er undertrykt.');
  const deliveryId = randomUUID().replaceAll('-', '');
  await sql`INSERT INTO email_deliveries (id, survey_id, recipient_email, email_type, subject, status, processing_at, requested_by)
    VALUES (${deliveryId}, ${surveyId}, ${recipient}, 'survey_test', ${message.subject}, 'processing', NOW(), 'ib@turufjellvel.no')`;
  let accepted;
  try {
    accepted = await sendEmail({ ...message, to: recipient, tags: ['survey-results-test'], context: { emailType: 'survey_test', surveyId, deliveryId, recipient } }, { sql });
  } catch (error) {
    await sql`UPDATE email_deliveries SET status = 'failed', failure_reason = ${error.code || 'SEND_FAILED'}, failed_at = NOW() WHERE id = ${deliveryId}`;
    throw error;
  }
  console.log(JSON.stringify({ accepted: true, messageId: accepted.messageId, deliveryId }));
  await sql`UPDATE email_deliveries SET status = 'sent', provider_message_id = ${accepted.messageId}, sent_at = NOW() WHERE id = ${deliveryId}`;
}
