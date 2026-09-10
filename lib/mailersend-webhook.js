import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSql } from './db.js';

export const MAILERSEND_TEST_SIGNING_SECRET = 'test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G';

const EVENT_STATUS = new Map([
  ['activity.sent', 'sent'],
  ['activity.delivered', 'delivered'],
  ['activity.soft_bounced', 'failed'],
  ['activity.hard_bounced', 'bounced'],
  ['activity.suppressed', 'suppressed'],
  ['activity.spam_complaint', 'suppressed'],
  ['activity.unsubscribed', 'suppressed'],
]);

export function verifyMailerSendSignature(rawBody, signature, secret) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function parseMailerSendEvent(payload) {
  if (payload?.type === 'webhook.test') return { type: 'webhook.test' };
  const status = EVENT_STATUS.get(payload?.type);
  const eventId = String(payload?.data?.id || '');
  const messageId = String(payload?.data?.message_id || '');
  if (!status || !eventId || eventId.length > 255 || !messageId || messageId.length > 255) return null;
  return {
    eventId,
    messageId,
    type: payload.type,
    status,
    permanentSuppression: ['activity.hard_bounced', 'activity.suppressed', 'activity.spam_complaint', 'activity.unsubscribed'].includes(payload.type),
  };
}

export async function processMailerSendEvent(payload, options = {}) {
  const event = parseMailerSendEvent(payload);
  if (!event) return { outcome: 'ignored' };
  if (event.type === 'webhook.test') return { outcome: 'test' };
  const sql = options.sql || getSql();
  const [result] = await sql`
    WITH recorded AS (
      INSERT INTO email_webhook_events (provider_event_id, provider_message_id, event_type)
      VALUES (${event.eventId}, ${event.messageId}, ${event.type})
      ON CONFLICT (provider_event_id) DO NOTHING
      RETURNING provider_event_id
    ), updated AS (
      UPDATE email_deliveries SET
        status = CASE
          WHEN ${event.status} = 'sent' AND status NOT IN ('pending', 'processing', 'sent') THEN status
          WHEN status = 'delivered' AND ${event.status} <> 'delivered' THEN status
          ELSE ${event.status}
        END,
        sent_at = CASE WHEN ${event.status} = 'sent' THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
        delivered_at = CASE WHEN ${event.status} = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
        failed_at = CASE WHEN ${event.status} IN ('failed', 'bounced', 'suppressed') AND status <> 'delivered' THEN COALESCE(failed_at, NOW()) ELSE failed_at END,
        failure_reason = CASE WHEN ${event.status} IN ('failed', 'bounced', 'suppressed') AND status <> 'delivered' THEN ${event.type} ELSE failure_reason END
      WHERE provider_message_id = ${event.messageId} AND EXISTS (SELECT 1 FROM recorded)
      RETURNING campaign_id, recipient_email
    ), suppression AS (
      INSERT INTO email_suppressions (recipient_email, reason)
      SELECT recipient_email, ${event.type} FROM updated WHERE ${event.permanentSuppression}
      ON CONFLICT (recipient_email) DO UPDATE SET reason = EXCLUDED.reason, updated_at = NOW()
      RETURNING recipient_email
    )
    SELECT
      EXISTS (SELECT 1 FROM recorded) AS recorded,
      EXISTS (SELECT 1 FROM updated) AS matched,
      (SELECT campaign_id FROM updated LIMIT 1) AS campaign_id
  `;
  if (!result.recorded) return { outcome: 'duplicate' };
  return { outcome: result.matched ? 'updated' : 'unknown', campaignId: result.campaign_id || null };
}
