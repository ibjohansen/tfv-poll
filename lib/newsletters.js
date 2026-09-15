import { randomUUID } from 'node:crypto';
import { getSql } from './db.js';
import { isMockMode } from './mock-store.js';
import { normalizeNewsletter, renderNewsletter } from './newsletter-utils.js';
import { getApplicationBaseUrl } from './survey-email.js';
import { getMailerSendConfig, requireMailerSendBulkEnabled, isMailerSendBulkEnabled,
  getMailerSendSuppressions, isSuppressedRecipient, normalizeEmail, sendEmail } from './mailer-service.js';

async function requireMembers() { return (await import('./admin-access.js')).requirePermission('members'); }
function validateId(id) { if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid newsletter'); }
const newId = () => randomUUID().replaceAll('-', '');
const recipientSql = `SELECT lower(btrim(e.email)) AS email, array_agg(DISTINCT m.id ORDER BY m.id) AS member_ids
  FROM member_email_group_members link JOIN member_email_groups g ON g.id = link.group_id AND g.deleted_at IS NULL
  JOIN members m ON m.id = link.member_id AND m.deleted_at IS NULL AND m.membership_status = 'member'
  CROSS JOIN LATERAL unnest(ARRAY[m.primary_contact_email] || COALESCE(m.other_contact_emails, ARRAY[]::text[])) e(email)
  WHERE link.group_id = ANY($1::bigint[]) AND btrim(e.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
  GROUP BY lower(btrim(e.email)) ORDER BY lower(btrim(e.email)) LIMIT 5001`;

async function campaignWithCounts(sql, id) {
  const [campaign] = await sql`
    SELECT n.*, count(d.id)::int AS total_count,
      count(d.id) FILTER (WHERE d.status IN ('pending', 'processing'))::int AS pending_count,
      count(d.id) FILTER (WHERE d.status IN ('sent', 'delivered'))::int AS sent_count,
      count(d.id) FILTER (WHERE d.status = 'delivered')::int AS delivered_count,
      count(d.id) FILTER (WHERE d.status IN ('failed', 'bounced'))::int AS failed_count,
      count(d.id) FILTER (WHERE d.status = 'suppressed')::int AS suppressed_count
    FROM newsletter_campaigns n LEFT JOIN email_deliveries d ON d.newsletter_id = n.id AND d.email_type = 'newsletter'
    WHERE n.id = ${id} GROUP BY n.id
  `;
  if (!campaign) throw new Error('Newsletter not found');
  // A worker token is internal coordination state, not a public DTO field.
  const { worker_token: token, worker_lease_expires_at: expiry, ...result } = campaign;
  void token; void expiry;
  return result;
}

export async function getNewsletters(id = null) {
  await requireMembers();
  if (isMockMode()) return { campaigns: [], campaign: null, deliveries: [], bulkEnabled: false };
  const sql = getSql();
  if (id !== null) validateId(id);
  const campaigns = await sql`SELECT id, subject, status, created_at, queued_at, completed_at FROM newsletter_campaigns ORDER BY created_at DESC LIMIT 100`;
  const campaign = id ? await campaignWithCounts(sql, id) : null;
  const deliveries = id ? await sql`SELECT id, email_type, status, failure_reason,
    split_part(recipient_email, '@', 2) AS recipient_domain, created_at, sent_at, delivered_at
    FROM email_deliveries WHERE newsletter_id = ${id} ORDER BY created_at DESC, id LIMIT 250` : [];
  return { campaigns, campaign, deliveries, bulkEnabled: isMailerSendBulkEnabled() };
}

export async function saveNewsletter(input) {
  const user = await requireMembers();
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const values = normalizeNewsletter(input);
  const id = input.id || newId(); validateId(id);
  const sql = getSql();
  const [campaign] = await sql`
    WITH saved AS (
      INSERT INTO newsletter_campaigns (id, subject, body, group_ids, requested_by)
      SELECT ${id}, ${values.subject}, ${JSON.stringify(values.body)}::jsonb, ${values.groupIds}::bigint[], ${user.email.toLowerCase()}
      WHERE (SELECT count(*) FROM member_email_groups WHERE id = ANY(${values.groupIds}::bigint[]) AND deleted_at IS NULL) = ${values.groupIds.length}
      ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body, group_ids = EXCLUDED.group_ids,
        updated_at = NOW(), requested_by = EXCLUDED.requested_by WHERE newsletter_campaigns.status = 'draft'
      RETURNING id
    ), logged AS (
      INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
      SELECT 'admin_actions', id, 'INSERT', ${user.email.toLowerCase()}, jsonb_build_object('action', 'newsletter_saved', 'newsletter_id', id) FROM saved
    ) SELECT id FROM saved
  `;
  if (!campaign) throw new Error('Invalid newsletter');
  return campaignWithCounts(sql, campaign.id);
}

export async function previewNewsletter(id) {
  await requireMembers(); validateId(id);
  const sql = getSql();
  const campaign = await campaignWithCounts(sql, id);
  const recipients = await sql.query(recipientSql, [campaign.group_ids]);
  if (recipients.length > 5000) throw new Error('Invalid member selection');
  return { campaign, recipientCount: recipients.length };
}

export async function queueNewsletter(id) {
  const user = await requireMembers(); validateId(id);
  getMailerSendConfig(); requireMailerSendBulkEnabled();
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const sql = getSql();
  // Locking the draft and setting its status freezes content and audience in
  // the same transaction that creates exactly one delivery per address.
  const [queued] = await sql.query(`WITH draft AS MATERIALIZED (
    SELECT * FROM newsletter_campaigns WHERE id = $2 AND status = 'draft' FOR UPDATE
  ), recipients AS MATERIALIZED (${recipientSql.replaceAll('$1::bigint[]', '(SELECT group_ids FROM draft)::bigint[]')}),
  queued AS (
    UPDATE newsletter_campaigns SET status = 'pending', queued_at = NOW(), requested_by = $1::text
    WHERE id IN (SELECT id FROM draft) AND (SELECT count(*) FROM recipients) BETWEEN 1 AND 5000 RETURNING id, subject
  ), deliveries AS (
    INSERT INTO email_deliveries (id, newsletter_id, recipient_email, email_type, subject, audience_member_ids, requested_by)
    SELECT replace(gen_random_uuid()::text, '-', ''), q.id, r.email, 'newsletter', q.subject, r.member_ids, $1::text
    FROM queued q CROSS JOIN recipients r RETURNING id
  ), logged AS (
    INSERT INTO audit_log (table_name, row_id, operation, changed_by, after_value)
    SELECT 'admin_actions', id, 'INSERT', $1::text, jsonb_build_object('action', 'newsletter_queued', 'newsletter_id', id, 'count', (SELECT count(*) FROM deliveries)) FROM queued
  ) SELECT id FROM queued`, [user.email.toLowerCase(), id]);
  if (!queued) {
    const existing = await campaignWithCounts(sql, id);
    if (existing.status === 'draft') throw new Error('No recipients');
    return existing;
  }
  return campaignWithCounts(sql, id);
}

export async function failPendingNewsletter(id) {
  await requireMembers(); validateId(id);
  const sql = getSql();
  await sql`UPDATE newsletter_campaigns SET status = 'failed', completed_at = NOW(), error_message = 'Bakgrunnsjobben kunne ikke startes. Prøv igjen eller kontroller konfigurasjonen.'
    WHERE id = ${id} AND status = 'pending' AND started_at IS NULL`;
  return campaignWithCounts(sql, id);
}

export async function sendNewsletterTest(id, recipient) {
  const user = await requireMembers(); validateId(id);
  getMailerSendConfig();
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  const email = normalizeEmail(recipient);
  if (!email) throw new Error('Invalid test recipient');
  const sql = getSql();
  const campaign = await campaignWithCounts(sql, id);
  const suppressions = await getMailerSendSuppressions();
  const [local] = await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email = ${email}`;
  if (local || isSuppressedRecipient(email, suppressions)) throw new Error('Email delivery unavailable');
  const rendered = renderNewsletter({ ...campaign, baseUrl: getApplicationBaseUrl(), isTest: true });
  const deliveryId = newId();
  await sql`INSERT INTO email_deliveries (id, newsletter_id, recipient_email, email_type, subject, status, processing_at, requested_by)
    VALUES (${deliveryId}, ${id}, ${email}, 'newsletter_test', ${rendered.subject}, 'processing', NOW(), ${user.email.toLowerCase()})`;
  try {
    const { messageId } = await sendEmail({ ...rendered, to: email, tags: ['newsletter-test'], context: { emailType: 'newsletter_test' } });
    await sql`UPDATE email_deliveries SET status = 'sent', sent_at = NOW(), provider_message_id = ${messageId} WHERE id = ${deliveryId}`;
  } catch {
    await sql`UPDATE email_deliveries SET status = 'failed', failed_at = NOW(), failure_reason = 'SEND_FAILED_OR_UNCERTAIN' WHERE id = ${deliveryId}`;
    throw new Error('Email delivery unavailable');
  }
  return { sent: true };
}

export async function processNewsletter(id, options = {}) {
  validateId(id); requireMailerSendBulkEnabled(options.env || process.env);
  const sql = options.sql || getSql();
  const token = newId();
  const deadline = options.deadline || Date.now() + 12 * 60_000;
  const [claimed] = await sql`UPDATE newsletter_campaigns SET worker_token = ${token}, worker_lease_expires_at = NOW() + INTERVAL '16 minutes',
    status = 'running', started_at = COALESCE(started_at, NOW()), completed_at = NULL, error_message = NULL
    WHERE id = ${id} AND status IN ('pending', 'running', 'failed') AND queued_at IS NOT NULL
      AND (worker_token IS NULL OR worker_lease_expires_at < NOW()) RETURNING subject, body, group_ids`;
  if (!claimed) {
    const campaign = await campaignWithCounts(sql, id);
    return { id, status: campaign.status, workerBusy: campaign.status === 'running' };
  }
  try {
    await sql`UPDATE email_deliveries SET status = 'failed', failed_at = NOW(), failure_reason = 'UNCERTAIN_AFTER_INTERRUPTION'
      WHERE newsletter_id = ${id} AND email_type = 'newsletter' AND status = 'processing' AND processing_at < NOW() - INTERVAL '15 minutes'`;
    const suppressions = await getMailerSendSuppressions({ env: options.env });
    const rendered = renderNewsletter({ ...claimed, baseUrl: getApplicationBaseUrl(options.env || process.env) });
    for (let index = 0; index < 100 && Date.now() + 35000 < deadline; index++) {
      const [delivery] = await sql`UPDATE email_deliveries SET status = 'processing', processing_at = NOW()
        WHERE id = (SELECT id FROM email_deliveries WHERE newsletter_id = ${id} AND email_type = 'newsletter' AND status = 'pending' ORDER BY created_at, id LIMIT 1)
          AND status = 'pending' AND EXISTS (SELECT 1 FROM newsletter_campaigns WHERE id = ${id} AND status = 'running'
            AND worker_token = ${token} AND worker_lease_expires_at > NOW() + INTERVAL '35 seconds')
        RETURNING id, recipient_email, audience_member_ids`;
      if (!delivery) break;
      const [eligible] = await sql`SELECT m.id FROM members m JOIN member_email_group_members link ON link.member_id = m.id
        JOIN member_email_groups g ON g.id = link.group_id AND g.deleted_at IS NULL
        WHERE m.id = ANY(${delivery.audience_member_ids}::bigint[]) AND m.deleted_at IS NULL AND m.membership_status = 'member'
          AND link.group_id = ANY(${claimed.group_ids}::bigint[]) AND EXISTS (
            SELECT 1 FROM unnest(ARRAY[m.primary_contact_email] || COALESCE(m.other_contact_emails, ARRAY[]::text[])) e(email)
            WHERE lower(btrim(email)) = ${delivery.recipient_email}) LIMIT 1`;
      const [local] = await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email = ${delivery.recipient_email}`;
      if (!eligible || local || isSuppressedRecipient(delivery.recipient_email, suppressions)) {
        await sql`UPDATE email_deliveries SET status = 'suppressed', failed_at = NOW(), failure_reason = ${eligible ? 'RECIPIENT_SUPPRESSED' : 'SOURCE_DATA_CHANGED'} WHERE id = ${delivery.id}`;
        continue;
      }
      try {
        const { messageId } = await sendEmail({ ...rendered, to: delivery.recipient_email, tags: ['newsletter'], context: { emailType: 'newsletter' } }, { env: options.env });
        await sql`UPDATE email_deliveries SET status = 'sent', sent_at = NOW(), provider_message_id = ${messageId} WHERE id = ${delivery.id}`;
      } catch {
        await sql`UPDATE email_deliveries SET status = 'failed', failed_at = NOW(), failure_reason = 'SEND_FAILED_OR_UNCERTAIN' WHERE id = ${delivery.id}`;
      }
      if ((options.delayMs ?? 6100) > 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? 6100));
    }
    const state = await campaignWithCounts(sql, id);
    const status = state.pending_count ? 'running' : 'completed';
    await sql`UPDATE newsletter_campaigns SET status = ${status}, completed_at = CASE WHEN ${status} = 'completed' THEN NOW() ELSE NULL END WHERE id = ${id} AND worker_token = ${token}`;
    return { id, status, sent_count: state.sent_count, failed_count: state.failed_count };
  } catch {
    await sql`UPDATE newsletter_campaigns SET status = 'failed', completed_at = NOW(), error_message = 'Utsendingen ble avbrutt. Leveringsstatus beholdes; kontroller før ny oppstart.' WHERE id = ${id} AND worker_token = ${token}`;
    throw new Error('Newsletter processing failed');
  } finally {
    await sql`UPDATE newsletter_campaigns SET worker_token = NULL, worker_lease_expires_at = NULL WHERE id = ${id} AND worker_token = ${token}`;
  }
}
