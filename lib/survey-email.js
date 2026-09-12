import { randomUUID } from 'node:crypto';
import { requirePermission } from './admin-access.js';
import { getSql } from './db.js';
import { renderSurveyInvitationEmail } from './email-templates.js';
import { getMailerSendConfig, getMailerSendSuppressions, isMailerSendBulkEnabled, isMailerSendConfigured, isSuppressedRecipient, MailerServiceError, normalizeEmail, requireMailerSendBulkEnabled, sendEmail } from './mailer-service.js';
import { isMockMode } from './mock-store.js';
import { buildSurveyUrl, isPastSurveyEnd, parseTestRecipients, selectCampaignRecipients } from './survey-email-utils.js';
import { createAccessSecret, hashAccessSecret, randomId } from './member-self-service-utils.js';
import { assertDatabaseEnvironment } from './security-config.js';
import { recordSecurityEvent } from './security-events.js';

const SURVEY_ID_PATTERN = /^[a-f0-9]{32}$/i;

async function issueSurveyAccessToken(sql, { memberId, surveyId, endsOn }, env = process.env) {
  const context = await assertDatabaseEnvironment(sql, env);
  const secret = createAccessSecret();
  const tokenId = randomId();
  const result = await sql.transaction([
    sql`UPDATE survey_access_tokens SET revoked_at = NOW()
        WHERE member_id = ${memberId} AND survey_id = ${surveyId}
          AND consumed_at IS NULL AND answered_at IS NULL AND revoked_at IS NULL`,
    sql`INSERT INTO survey_access_tokens (
          id, member_id, survey_id, token_hash, environment, audience, expires_at
        ) VALUES (
          ${tokenId}, ${memberId}, ${surveyId}, ${hashAccessSecret(secret)},
          ${context.environment}, ${context.audience},
          LEAST(((${endsOn}::date + INTERVAL '1 day') AT TIME ZONE 'Europe/Oslo'), NOW() + INTERVAL '14 days')
        ) RETURNING id`,
  ]);
  if (!result[1][0]) throw new Error('Survey access token could not be issued');
  await recordSecurityEvent(sql, {
    eventType: 'survey_access_token_issued', actorType: 'admin', result: 'issued',
    memberId, surveyId, entityId: tokenId,
    metadata: { environment: context.environment, audience: context.audience },
  }, env);
  return { id: tokenId, secret };
}

function validateSurveyId(id) {
  if (!SURVEY_ID_PATTERN.test(id || '')) throw new Error('Invalid survey ID');
}

export function getApplicationBaseUrl(env = process.env) {
  let url;
  try { url = new URL(env.AUTH_URL || 'http://localhost:3000'); } catch { throw new Error('Invalid application URL'); }
  if (env.NODE_ENV === 'production' && (url.protocol !== 'https:' || url.hostname !== 'medlemsservice.turufjellvel.no')) {
    throw new Error('Invalid production application URL');
  }
  return url.origin;
}

function campaignSummary(row) {
  if (!row) return null;
  return {
    id: row.id, status: row.status, total_count: row.total_count,
    missing_email_count: row.missing_email_count, sent_count: row.sent_count,
    delivered_count: row.delivered_count, failed_count: row.failed_count,
    suppressed_count: row.suppressed_count, created_at: row.created_at,
    started_at: row.started_at, completed_at: row.completed_at,
    error_message: row.error_message || null,
  };
}

async function getCampaign(sql, campaignId) {
  const [campaign] = await sql`
    SELECT id, survey_id, status, total_count, missing_email_count, sent_count,
      delivered_count, failed_count, suppressed_count, error_message, created_at, started_at, completed_at
    FROM email_campaigns WHERE id = ${campaignId}
  `;
  return campaign;
}

export async function getSurveyEmailOverview(surveyId, requestedPage = 1) {
  await requirePermission('surveys');
  validateSurveyId(surveyId);
  if (isMockMode()) return { configured: false, bulk_enabled: false, mock: true, recipient_count: 0, missing_email_count: 0, campaign: null, deliveries: [], page: 1, pages: 1 };
  const sql = getSql();
  const [survey] = await sql`
    SELECT id, title, is_open, ends_on,
      (is_open AND ends_on >= (NOW() AT TIME ZONE 'Europe/Oslo')::date) AS can_send
    FROM surveys WHERE id = ${surveyId} AND deleted_at IS NULL
  `;
  if (!survey) throw new Error('Survey not found');
  const [counts] = await sql`
    SELECT COUNT(*) FILTER (WHERE primary_contact_email IS NOT NULL
      AND btrim(primary_contact_email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')::int AS recipient_count,
      COUNT(*) FILTER (WHERE primary_contact_email IS NULL
        OR btrim(primary_contact_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')::int AS missing_email_count
    FROM members
    WHERE deleted_at IS NULL
  `;
  const [latest] = await sql`
    SELECT c.id, c.status, c.total_count, c.missing_email_count,
      COALESCE(x.sent_count, 0)::int AS sent_count,
      COALESCE(x.delivered_count, 0)::int AS delivered_count,
      COALESCE(x.failed_count, 0)::int AS failed_count,
      COALESCE(x.suppressed_count, 0)::int AS suppressed_count,
      c.error_message, c.created_at, c.started_at, c.completed_at
    FROM email_campaigns c
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE status IN ('sent', 'delivered')) AS sent_count,
        COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_count,
        COUNT(*) FILTER (WHERE status IN ('failed', 'bounced')) AS failed_count,
        COUNT(*) FILTER (WHERE status = 'suppressed') AS suppressed_count
      FROM email_deliveries WHERE campaign_id = c.id
    ) x ON TRUE
    WHERE c.survey_id = ${surveyId} AND c.kind = 'survey'
    ORDER BY c.created_at DESC LIMIT 1
  `;
  const pageSize = 25;
  const pages = latest ? Math.max(1, Math.ceil(latest.total_count / pageSize)) : 1;
  const page = Math.min(Math.max(Number(requestedPage) || 1, 1), pages);
  const deliveries = latest ? await sql`
    SELECT d.id, d.status, d.failure_reason, d.sent_at, d.delivered_at,
      m.h_number, split_part(d.recipient_email, '@', 2) AS recipient_domain
    FROM email_deliveries d
    LEFT JOIN members m ON m.id = d.member_id
    WHERE d.campaign_id = ${latest.id}
    ORDER BY d.created_at, d.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  ` : [];
  return {
    configured: isMailerSendConfigured(), bulk_enabled: isMailerSendBulkEnabled(), mock: false,
    survey: { id: survey.id, title: survey.title, is_open: survey.is_open, ends_on: survey.ends_on, can_send: survey.can_send },
    recipient_count: counts.recipient_count, missing_email_count: counts.missing_email_count,
    campaign: campaignSummary(latest), deliveries, page, pages,
  };
}

export async function createSurveyEmailCampaign(surveyId, { replaceCompleted = false } = {}) {
  const user = await requirePermission('surveys');
  validateSurveyId(surveyId);
  getMailerSendConfig();
  requireMailerSendBulkEnabled();
  if (isMockMode()) throw new Error('Mock data cannot send email');
  const sql = getSql();
  const [existing] = await sql`
    SELECT id FROM email_campaigns
    WHERE survey_id = ${surveyId} AND kind = 'survey' AND status <> 'cancelled' LIMIT 1
  `;
  if (existing) {
    const current = await getCampaign(sql, existing.id);
    if (!replaceCompleted || current.status !== 'completed') {
      return { campaign: campaignSummary(current), existing: true };
    }
  }
  const [survey] = await sql`
    SELECT id, title, ends_on FROM surveys
    WHERE id = ${surveyId} AND deleted_at IS NULL AND is_open = TRUE
      AND ends_on >= (NOW() AT TIME ZONE 'Europe/Oslo')::date
  `;
  if (!survey) throw new Error('Survey not sendable');
  const members = await sql`
    SELECT id, primary_contact_email FROM members
    WHERE deleted_at IS NULL
    ORDER BY id
  `;
  const recipients = selectCampaignRecipients(members);
  if (!recipients.length) throw new Error('No recipients');
  const campaignId = randomUUID().replaceAll('-', '');
  const subject = `Invitasjon: ${survey.title}`;
  const operations = [
    ...(existing ? [sql`
      UPDATE email_campaigns
      SET status = 'cancelled', completed_at = COALESCE(completed_at, NOW())
      WHERE id = ${existing.id} AND status = 'completed'
    `] : []),
    sql`
    INSERT INTO email_campaigns (id, survey_id, requested_by, total_count, missing_email_count)
    VALUES (${campaignId}, ${surveyId}, ${user.email.toLowerCase()}, ${recipients.length}, ${members.length - recipients.length})
  `, ...recipients.map((member) => sql`
    INSERT INTO email_deliveries (id, campaign_id, member_id, survey_id, recipient_email, email_type, subject)
    VALUES (${randomUUID().replaceAll('-', '')}, ${campaignId}, ${member.id}, ${surveyId}, ${member.email}, 'survey_invitation', ${subject})
  `)];
  try { await sql.transaction(operations); }
  catch (error) {
    if (error.code !== '23505' && error.cause?.code !== '23505') throw error;
    const [concurrent] = await sql`SELECT id FROM email_campaigns WHERE survey_id = ${surveyId} AND kind = 'survey' AND status <> 'cancelled' LIMIT 1`;
    if (!concurrent) throw error;
    return { campaign: campaignSummary(await getCampaign(sql, concurrent.id)), existing: true };
  }
  return { campaign: campaignSummary(await getCampaign(sql, campaignId)), existing: false, replaced: Boolean(existing) };
}

export async function sendSurveyTestEmail(surveyId, recipientInput) {
  await requirePermission('surveys');
  validateSurveyId(surveyId);
  const recipients = parseTestRecipients(recipientInput);
  getMailerSendConfig();
  if (isMockMode()) throw new Error('Mock data cannot send email');
  const sql = getSql();
  const [survey] = await sql`SELECT id, title, ends_on FROM surveys WHERE id = ${surveyId} AND deleted_at IS NULL`;
  if (!survey) throw new Error('Survey not found');
  const providerSuppressions = await getMailerSendSuppressions();
  for (const email of recipients) {
    const [localSuppressed] = await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email = ${email}`;
    if (localSuppressed || isSuppressedRecipient(email, providerSuppressions)) {
      throw new MailerServiceError('En testmottaker er undertrykt hos MailerSend.', 'SUPPRESSED', 409);
    }
  }
  const baseUrl = getApplicationBaseUrl();
  const testUrl = new URL('/survey', baseUrl).toString();
  const rendered = renderSurveyInvitationEmail({ surveyTitle: survey.title, endsOn: survey.ends_on, surveyUrl: testUrl, baseUrl, isTest: true });
  const deliveries = [];
  for (const email of recipients) {
    const deliveryId = randomUUID().replaceAll('-', '');
    await sql`
      INSERT INTO email_deliveries (id, survey_id, recipient_email, email_type, subject, status, processing_at)
      VALUES (${deliveryId}, ${surveyId}, ${email}, 'survey_test', ${rendered.subject}, 'processing', NOW())
    `;
    try {
      const { messageId } = await sendEmail({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text, tags: ['survey-test'], context: { emailType: 'survey_test', surveyId, recipient: email } });
      await sql`UPDATE email_deliveries SET status = 'sent', provider_message_id = ${messageId}, sent_at = NOW() WHERE id = ${deliveryId}`;
      deliveries.push({ deliveryId, messageId });
    } catch (error) {
      const status = error.code === 'SUPPRESSED' ? 'suppressed' : 'failed';
      await sql`UPDATE email_deliveries SET status = ${status}, failure_reason = ${error.code || 'SEND_FAILED'}, failed_at = NOW() WHERE id = ${deliveryId}`;
      throw error;
    }
  }
  return { deliveries, recipientCount: deliveries.length };
}

export async function sendSurveyInvitationToMember({ memberId, surveyId }, options = {}) {
  await requirePermission('surveys');
  validateSurveyId(surveyId);
  if (!Number.isSafeInteger(Number(memberId)) || Number(memberId) < 1) throw new Error('Invalid member ID');
  getMailerSendConfig(options.env || process.env);
  if (isMockMode()) throw new Error('Mock data cannot send email');
  const sql = options.sql || getSql();
  const fetchImpl = options.fetchImpl || fetch;
  const [source] = await sql`
    SELECT m.id AS member_id, m.primary_contact_email,
      s.id AS survey_id, s.title, s.ends_on
    FROM members m CROSS JOIN surveys s
    WHERE m.id = ${Number(memberId)} AND m.deleted_at IS NULL
      AND s.id = ${surveyId} AND s.deleted_at IS NULL AND s.is_open = TRUE
      AND s.ends_on >= (NOW() AT TIME ZONE 'Europe/Oslo')::date
  `;
  if (!source) throw new Error('Member or survey not sendable');
  const email = normalizeEmail(source.primary_contact_email);
  if (!email) throw new Error('Member has no valid email');
  const [localSuppressed] = await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email = ${email}`;
  const providerSuppressions = await getMailerSendSuppressions({ fetchImpl, env: options.env });
  const baseUrl = getApplicationBaseUrl(options.env || process.env);
  const deliveryId = randomUUID().replaceAll('-', '');
  if (localSuppressed || isSuppressedRecipient(email, providerSuppressions)) {
    const rendered = renderSurveyInvitationEmail({ surveyTitle: source.title, endsOn: source.ends_on, surveyUrl: new URL('/survey', baseUrl).toString(), baseUrl });
    await sql`INSERT INTO email_deliveries (id, member_id, survey_id, recipient_email, email_type, subject, status, failure_reason, failed_at)
      VALUES (${deliveryId}, ${source.member_id}, ${surveyId}, ${email}, 'survey_invitation', ${rendered.subject}, 'suppressed', 'RECIPIENT_SUPPRESSED', NOW())`;
    throw new MailerServiceError('Mottakeren er undertrykt hos MailerSend.', 'SUPPRESSED', 409);
  }
  const access = await issueSurveyAccessToken(sql, {
    memberId: source.member_id, surveyId, endsOn: source.ends_on,
  }, options.env || process.env);
  const surveyUrl = buildSurveyUrl({ baseUrl, accessToken: access.secret, surveyId });
  const rendered = renderSurveyInvitationEmail({ surveyTitle: source.title, endsOn: source.ends_on, surveyUrl, baseUrl });
  await sql`INSERT INTO email_deliveries (id, member_id, survey_id, recipient_email, email_type, subject, status, processing_at)
    VALUES (${deliveryId}, ${source.member_id}, ${surveyId}, ${email}, 'survey_invitation', ${rendered.subject}, 'processing', NOW())`;
  try {
    const { messageId } = await sendEmail({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text, tags: ['survey-invitation'], context: { emailType: 'survey_invitation', memberId: source.member_id, surveyId, recipient: email } }, { fetchImpl, env: options.env });
    await sql`UPDATE email_deliveries SET status = 'sent', provider_message_id = ${messageId}, sent_at = NOW() WHERE id = ${deliveryId}`;
    return { deliveryId, messageId };
  } catch (error) {
    await sql`UPDATE survey_access_tokens SET revoked_at = NOW() WHERE id = ${access.id} AND revoked_at IS NULL`;
    const status = error instanceof MailerServiceError && error.code === 'SUPPRESSED' ? 'suppressed' : 'failed';
    await sql`UPDATE email_deliveries SET status = ${status}, failure_reason = ${error.code || 'SEND_FAILED'}, failed_at = NOW() WHERE id = ${deliveryId}`;
    throw error;
  }
}

async function refreshCampaignCounts(sql, campaignId) {
  const [campaign] = await sql`
    UPDATE email_campaigns c SET
      sent_count = x.sent_count, delivered_count = x.delivered_count,
      failed_count = x.failed_count, suppressed_count = x.suppressed_count,
      status = CASE WHEN x.pending_count = 0 THEN 'completed' ELSE 'running' END,
      completed_at = CASE WHEN x.pending_count = 0 THEN COALESCE(c.completed_at, NOW()) ELSE NULL END
    FROM (
      SELECT campaign_id,
        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered'))::int AS sent_count,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_count,
        COUNT(*) FILTER (WHERE status IN ('failed', 'bounced'))::int AS failed_count,
        COUNT(*) FILTER (WHERE status = 'suppressed')::int AS suppressed_count,
        COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS pending_count
      FROM email_deliveries WHERE campaign_id = ${campaignId} GROUP BY campaign_id
    ) x WHERE c.id = x.campaign_id RETURNING c.*
  `;
  return campaign;
}

export async function processSurveyEmailCampaign(campaignId, options = {}) {
  if (!SURVEY_ID_PATTERN.test(campaignId || '')) throw new Error('Invalid campaign ID');
  requireMailerSendBulkEnabled(options.env || process.env);
  const sql = options.sql || getSql();
  const fetchImpl = options.fetchImpl || fetch;
  const delayMs = options.delayMs ?? 6100;
  const batchSize = options.batchSize ?? 100;
  const workerToken = randomUUID().replaceAll('-', '');
  const [lease] = await sql`
    UPDATE email_campaigns SET worker_token = ${workerToken},
      worker_lease_expires_at = NOW() + INTERVAL '16 minutes',
      status = 'running', error_message = NULL, completed_at = NULL,
      started_at = COALESCE(started_at, NOW())
    WHERE id = ${campaignId} AND status IN ('pending', 'running', 'failed')
      AND (worker_token IS NULL OR worker_lease_expires_at < NOW())
    RETURNING id
  `;
  if (!lease) {
    const campaign = await getCampaign(sql, campaignId);
    if (!campaign) throw new Error('Campaign not found');
    return { ...campaignSummary(campaign), workerBusy: campaign.status === 'running' };
  }
  try {
    await sql`UPDATE email_deliveries SET status = 'failed', failure_reason = 'UNCERTAIN_AFTER_INTERRUPTION', failed_at = NOW()
      WHERE campaign_id = ${campaignId} AND status = 'processing' AND processing_at < NOW() - INTERVAL '15 minutes'`;
    const localSuppressedRows = await sql`SELECT recipient_email FROM email_suppressions`;
    const localSuppressions = new Set(localSuppressedRows.map((row) => row.recipient_email));
    let providerSuppressions;
    try { providerSuppressions = await getMailerSendSuppressions({ fetchImpl }); }
    catch (error) {
      await sql`UPDATE email_campaigns SET status = 'failed', error_message = 'SUPPRESSION_CHECK_FAILED', completed_at = NOW() WHERE id = ${campaignId}`;
      throw error;
    }
    for (let index = 0; index < batchSize; index += 1) {
      const [delivery] = await sql`
        UPDATE email_deliveries SET status = 'processing', processing_at = NOW()
        WHERE id = (SELECT id FROM email_deliveries WHERE campaign_id = ${campaignId} AND status = 'pending' ORDER BY created_at, id LIMIT 1)
        RETURNING id, member_id, survey_id, recipient_email
      `;
      if (!delivery) break;
      const [source] = await sql`
        SELECT m.primary_contact_email, m.deleted_at,
          s.title, s.ends_on, s.is_open, s.deleted_at AS survey_deleted_at
        FROM members m CROSS JOIN surveys s WHERE m.id = ${delivery.member_id} AND s.id = ${delivery.survey_id}
      `;
      const currentEmail = normalizeEmail(source?.primary_contact_email);
      if (!source || source.deleted_at ||
        source.survey_deleted_at || !source.is_open || isPastSurveyEnd(source.ends_on) || currentEmail !== delivery.recipient_email) {
        await sql`UPDATE email_deliveries SET status = 'failed', failure_reason = 'SOURCE_DATA_CHANGED', failed_at = NOW() WHERE id = ${delivery.id}`;
        continue;
      }
      if (localSuppressions.has(currentEmail) || isSuppressedRecipient(currentEmail, providerSuppressions)) {
        await sql`UPDATE email_deliveries SET status = 'suppressed', failure_reason = 'RECIPIENT_SUPPRESSED', failed_at = NOW() WHERE id = ${delivery.id}`;
        continue;
      }
      const baseUrl = getApplicationBaseUrl();
      const access = await issueSurveyAccessToken(sql, {
        memberId: delivery.member_id, surveyId: delivery.survey_id, endsOn: source.ends_on,
      });
      const surveyUrl = buildSurveyUrl({ baseUrl, accessToken: access.secret, surveyId: delivery.survey_id });
      const rendered = renderSurveyInvitationEmail({ surveyTitle: source.title, endsOn: source.ends_on, surveyUrl, baseUrl });
      try {
        const { messageId } = await sendEmail({ to: currentEmail, subject: rendered.subject, html: rendered.html, text: rendered.text, tags: ['survey-invitation'], context: { emailType: 'survey_invitation', memberId: delivery.member_id, surveyId: delivery.survey_id, recipient: currentEmail } }, { fetchImpl });
        await sql`UPDATE email_deliveries SET status = 'sent', provider_message_id = ${messageId}, sent_at = NOW() WHERE id = ${delivery.id}`;
      } catch (error) {
        await sql`UPDATE survey_access_tokens SET revoked_at = NOW() WHERE id = ${access.id} AND revoked_at IS NULL`;
        const status = error instanceof MailerServiceError && error.code === 'SUPPRESSED' ? 'suppressed' : 'failed';
        await sql`UPDATE email_deliveries SET status = ${status}, failure_reason = ${error.code || 'SEND_FAILED'}, failed_at = NOW() WHERE id = ${delivery.id}`;
      }
      if (delayMs && index < batchSize - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return campaignSummary(await refreshCampaignCounts(sql, campaignId));
  } finally {
    await sql`UPDATE email_campaigns SET worker_token = NULL, worker_lease_expires_at = NULL WHERE id = ${campaignId} AND worker_token = ${workerToken}`;
  }
}
