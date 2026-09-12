import { createHmac } from 'node:crypto';
import { getSecurityContext } from './security-config.js';

const SAFE_METADATA_KEYS = new Set(['scope', 'reason', 'purpose', 'environment', 'audience']);

export function securityKeyHmac(value, env = process.env) {
  const { hmacKey } = getSecurityContext(env);
  return createHmac('sha256', hmacKey).update(String(value || ''), 'utf8').digest('hex');
}

function safeMetadata(metadata) {
  return Object.fromEntries(Object.entries(metadata || {}).filter(([key, value]) =>
    SAFE_METADATA_KEYS.has(key) && ['string', 'number', 'boolean'].includes(typeof value)));
}

export async function recordSecurityEvent(sql, event, env = process.env) {
  const keyHmac = event.key === undefined ? null : securityKeyHmac(event.key, env);
  const metadata = safeMetadata(event.metadata);
  await sql`
    INSERT INTO security_events (
      event_type, actor_type, result, member_id, survey_id, entity_id, key_hmac, metadata
    ) VALUES (
      ${event.eventType}, ${event.actorType || 'system'}, ${event.result},
      ${event.memberId || null}, ${event.surveyId || null}, ${event.entityId || null},
      ${keyHmac}, ${JSON.stringify(metadata)}::jsonb
    )
  `;
}
