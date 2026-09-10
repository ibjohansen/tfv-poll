import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseMailerSendEvent, processMailerSendEvent, verifyMailerSendSignature } from '../lib/mailersend-webhook.js';

const secret = 'webhook-secret';
const payload = { type: 'activity.delivered', data: { id: 'event-1', message_id: 'message-1', recipient: 'member@example.com' } };

test('webhook signature validates the exact raw payload', () => {
  const raw = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(verifyMailerSendSignature(raw, signature, secret), true);
  assert.equal(verifyMailerSendSignature(`${raw} `, signature, secret), false);
  assert.equal(verifyMailerSendSignature(raw, 'invalid', secret), false);
});

test('webhook parser accepts delivery and maps permanent bounce', () => {
  assert.deepEqual(parseMailerSendEvent(payload), { eventId: 'event-1', messageId: 'message-1', type: 'activity.delivered', status: 'delivered', permanentSuppression: false });
  assert.deepEqual(parseMailerSendEvent({ type: 'activity.hard_bounced', data: { id: 'event-2', message_id: 'message-2' } }).status, 'bounced');
  assert.equal(parseMailerSendEvent({ type: 'activity.opened', data: { id: 'event-3', message_id: 'message-3' } }), null);
});

test('webhook processing is idempotent and tolerates unknown message IDs', async () => {
  const fakeSql = async () => [{ recorded: false, matched: false, campaign_id: null }];
  assert.deepEqual(await processMailerSendEvent(payload, { sql: fakeSql }), { outcome: 'duplicate' });
  const unknownSql = async () => [{ recorded: true, matched: false, campaign_id: null }];
  assert.deepEqual(await processMailerSendEvent(payload, { sql: unknownSql }), { outcome: 'unknown', campaignId: null });
});

test('hard bounce produces an updated result for a known delivery', async () => {
  const fakeSql = async () => [{ recorded: true, matched: true, campaign_id: 'a'.repeat(32) }];
  const result = await processMailerSendEvent({ type: 'activity.hard_bounced', data: { id: 'bounce-1', message_id: 'message-1' } }, { sql: fakeSql });
  assert.deepEqual(result, { outcome: 'updated', campaignId: 'a'.repeat(32) });
});
