import { getSql } from './db.js';
import {
  renderEmailChangeConfirmationEmail, renderEmailChangeNoticeEmail,
  renderMemberAccessEmail, renderMembershipVerificationEmail,
} from './email-templates.js';
import { getMailerSendSuppressions, isSuppressedRecipient, normalizeEmail, sendEmail } from './mailer-service.js';
import {
  cleanText, createAccessSecret, hashAccessSecret, isAccessSecret,
  MEMBER_ACCESS_TTL_SECONDS, MEMBER_SESSION_ABSOLUTE_TTL_SECONDS, MEMBER_SESSION_TTL_SECONDS,
  normalizeCadastralNumber, normalizeContactDetails, normalizeMemberLookup,
  normalizeHNumberLookup, normalizeMembershipRequest, normalizeSectionNumber, parseCadastralNumber, randomId,
} from './member-self-service-utils.js';
import { isMockMode } from './mock-store.js';
import { addressProperty, lookupAddress, MatrikkelClient, officialAddress } from './matrikkel-client.js';
import { assertDatabaseEnvironment, getSecurityContext } from './security-config.js';
import { recordSecurityEvent } from './security-events.js';

const REQUEST_ID_PATTERN = /^[a-f0-9]{32}$/i;

async function requireAdminUser() {
  const { requirePermission } = await import('./admin-access.js');
  return requirePermission('members');
}

function reviewPayload(status, code, message, extra = {}) {
  return { status, code, message, checkedAt: new Date().toISOString(), ...extra };
}

async function assessSubmittedProperty(values) {
  if (!values.street_address) {
    return {
      values,
      review: reviewPayload('review', 'ADDRESS_MISSING', 'Gateadresse mangler. Eiendommen må kontrolleres manuelt.'),
    };
  }
  const expected = parseCadastralNumber(values.cadastral_number);
  try {
    const match = await lookupAddress(values.street_address, expected);
    const property = addressProperty(match.candidate);
    return {
      values: { ...values, cadastral_number: values.cadastral_number || `${property.gnr}/${property.bnr}` },
      review: reviewPayload('pending', 'MATRIKKEL_CHECK_REQUIRED', 'Adresse og gårds-/bruksnummer er sammenlignet. Matrikkelenheten må kontrolleres før godkjenning.', {
        officialAddress: officialAddress(match.candidate), matchType: match.matchType,
      }),
    };
  } catch (error) {
    return {
      values,
      review: reviewPayload('review', error.code || 'ADDRESS_LOOKUP_FAILED', error.message || 'Adressen kunne ikke kontrolleres.', {
        candidates: error.details?.candidates || [],
      }),
    };
  }
}

export function getSelfServiceBaseUrl(env = process.env) {
  let url;
  try { url = new URL(env.AUTH_URL || 'http://localhost:3000'); } catch { throw new Error('Invalid application URL'); }
  if (env.NODE_ENV === 'production' && (url.protocol !== 'https:' || url.hostname !== 'medlemsservice.turufjellvel.no')) {
    throw new Error('Invalid production application URL');
  }
  return url.origin;
}

async function isRecipientSuppressed(sql, email) {
  const [local] = await sql`SELECT recipient_email FROM email_suppressions WHERE recipient_email = ${email}`;
  if (local) return true;
  const provider = await getMailerSendSuppressions();
  return isSuppressedRecipient(email, provider);
}

async function deliverAccessEmail({ sql, memberId = null, email, emailType, rendered }) {
  const deliveryId = randomId();
  await sql`
    INSERT INTO email_deliveries (id, member_id, recipient_email, email_type, subject, status, processing_at)
    VALUES (${deliveryId}, ${memberId}, ${email}, ${emailType}, ${rendered.subject}, 'processing', NOW())
  `;
  try {
    const { messageId } = await sendEmail({
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: [emailType.replaceAll('_', '-')],
      context: { emailType, memberId: memberId || undefined, recipient: email },
    });
    await sql`UPDATE email_deliveries SET status = 'sent', provider_message_id = ${messageId}, sent_at = NOW() WHERE id = ${deliveryId}`;
    return messageId;
  } catch (error) {
    const status = error.code === 'SUPPRESSED' ? 'suppressed' : 'failed';
    await sql`UPDATE email_deliveries SET status = ${status}, failure_reason = ${error.code || 'SEND_FAILED'}, failed_at = NOW() WHERE id = ${deliveryId}`;
    throw error;
  }
}

async function findMemberAccessTarget(identifier) {
  const lookup = normalizeMemberLookup(identifier);
  const hNumberLookup = normalizeHNumberLookup(identifier);
  const sql = getSql();
  const matches = await sql`
    SELECT id, h_number, street_address, primary_contact_email
    FROM members
    WHERE deleted_at IS NULL AND (
      lower(btrim(h_number)) = ${lookup} OR
      (${hNumberLookup}::text IS NOT NULL AND
        regexp_replace(lower(btrim(h_number)), '^h[[:space:]-]*', '') = ${hNumberLookup}) OR
      lower(btrim(COALESCE(street_address, ''))) = ${lookup} OR
      lower(btrim(COALESCE(primary_contact_email, ''))) = ${lookup} OR
      EXISTS (SELECT 1 FROM unnest(other_contact_emails) AS email WHERE lower(btrim(email)) = ${lookup})
    )
    ORDER BY id LIMIT 2
  `;
  if (matches.length !== 1) return { sql };
  const member = matches[0];
  const email = normalizeEmail(member.primary_contact_email);
  return { sql, member, email };
}

export async function requestMemberAccess(identifier, options = {}) {
  const { sql, member, email } = await findMemberAccessTarget(identifier);
  const env = options.env || process.env;
  const context = await assertDatabaseEnvironment(sql, env);
  if (!member || !email) {
    await recordSecurityEvent(sql, { eventType: 'member_access_requested', actorType: 'public', result: 'no_delivery', key: identifier }, env);
    return { accepted: true };
  }
  await sql`DELETE FROM member_access_tokens WHERE expires_at < NOW() - INTERVAL '7 days'`;
  const [recent] = await sql`
    SELECT id FROM member_access_tokens
    WHERE member_id = ${member.id} AND created_at > NOW() - INTERVAL '10 minutes'
    ORDER BY created_at DESC LIMIT 1
  `;
  if (recent) return { accepted: true };
  if (await isRecipientSuppressed(sql, email)) {
    await recordSecurityEvent(sql, { eventType: 'member_access_requested', actorType: 'public', result: 'suppressed', memberId: member.id, key: identifier }, env);
    return { accepted: true };
  }

  const secret = createAccessSecret();
  const tokenHash = hashAccessSecret(secret);
  const tokenId = randomId();
  let created;
  try {
    const result = await sql.transaction([
      sql`UPDATE member_access_tokens SET revoked_at = NOW() WHERE member_id = ${member.id} AND revoked_at IS NULL`,
      sql`INSERT INTO member_access_tokens (id, member_id, token_hash, environment, audience, purpose, expires_at)
          VALUES (${tokenId}, ${member.id}, ${tokenHash}, ${context.environment}, ${context.audience}, 'member_login',
            NOW() + (${MEMBER_ACCESS_TTL_SECONDS} * INTERVAL '1 second')) RETURNING expires_at`,
    ]);
    [created] = result[1];
  } catch (error) {
    if (error.code === '23505' || error.cause?.code === '23505') return { accepted: true };
    throw error;
  }
  const actionUrl = new URL('/api/member-access/verify', getSelfServiceBaseUrl());
  actionUrl.searchParams.set('token', secret);
  const rendered = renderMemberAccessEmail({ actionUrl: actionUrl.toString(), baseUrl: getSelfServiceBaseUrl() });
  try {
    await deliverAccessEmail({ sql, memberId: member.id, email, emailType: 'member_access', rendered });
  } catch (error) {
    await sql`UPDATE member_access_tokens SET revoked_at = NOW() WHERE id = ${tokenId}`;
    throw error;
  }
  await recordSecurityEvent(sql, {
    eventType: 'member_access_token_issued', actorType: 'public', result: 'sent',
    memberId: member.id, entityId: tokenId, key: identifier,
    metadata: { purpose: 'member_login', environment: context.environment, audience: context.audience },
  }, env);
  return { accepted: true, expiresAt: created.expires_at };
}

export async function verifyMemberAccess(secret, options = {}) {
  if (!isAccessSecret(secret)) return null;
  const sql = options.sql || getSql();
  const env = options.env || process.env;
  const context = await assertDatabaseEnvironment(sql, env);
  const tokenHash = hashAccessSecret(secret);
  const sessionSecret = createAccessSecret();
  const sessionId = randomId();
  const [session] = await sql`
    WITH consumed AS (
      UPDATE member_access_tokens SET consumed_at = NOW(), last_used_at = NOW()
      WHERE token_hash = ${tokenHash} AND consumed_at IS NULL AND revoked_at IS NULL
        AND expires_at > NOW() AND environment = ${context.environment}
        AND audience = ${context.audience} AND purpose = 'member_login'
      RETURNING id, member_id
    ), created AS (
      INSERT INTO member_sessions (
        id, member_id, session_token_hash, environment, audience, expires_at, absolute_expires_at
      )
      SELECT ${sessionId}, member_id, ${hashAccessSecret(sessionSecret)}, ${context.environment}, ${context.audience},
        NOW() + (${MEMBER_SESSION_TTL_SECONDS} * INTERVAL '1 second'),
        NOW() + (${MEMBER_SESSION_ABSOLUTE_TTL_SECONDS} * INTERVAL '1 second')
      FROM consumed
      RETURNING member_id, expires_at
    )
    SELECT member_id, expires_at FROM created
  `;
  await recordSecurityEvent(sql, {
    eventType: 'member_access_token_consumed', actorType: 'public', result: session ? 'accepted' : 'rejected',
    memberId: session?.member_id, entityId: session ? sessionId : null, key: 'member-login-attempt',
    metadata: { purpose: 'member_login', environment: context.environment, audience: context.audience },
  }, env);
  return session ? { ...session, secret: sessionSecret } : null;
}

async function getSessionMember(secret, sql = getSql(), env = process.env) {
  if (!isAccessSecret(secret)) return null;
  const context = await assertDatabaseEnvironment(sql, env);
  const sessionHash = hashAccessSecret(secret);
  const [member] = await sql`
    WITH valid_session AS (
      UPDATE member_sessions SET last_seen_at = NOW(),
        expires_at = LEAST(absolute_expires_at, NOW() + (${MEMBER_SESSION_TTL_SECONDS} * INTERVAL '1 second'))
      WHERE session_token_hash = ${sessionHash} AND revoked_at IS NULL
        AND expires_at > NOW() AND absolute_expires_at > NOW()
        AND environment = ${context.environment} AND audience = ${context.audience}
      RETURNING member_id, expires_at
    )
    SELECT m.id, m.h_number, m.cadastral_number, m.section_number, m.street_address, m.title_holder,
      m.registration_date, m.primary_contact_name, m.primary_contact_email,
      m.other_contact_emails, s.expires_at
    FROM valid_session s JOIN members m ON m.id = s.member_id
    WHERE m.deleted_at IS NULL
  `;
  return member || null;
}

export async function getMemberSelfServiceProfile(secret) {
  const sql = getSql();
  const member = await getSessionMember(secret, sql);
  if (!member) return null;
  const [responses, deliveries, requests, updates] = await Promise.all([
    sql`
      SELECT r.id, r.answers, r.questions, r.question_version, r.created_at,
        s.title AS survey_title
      FROM survey_responses r
      LEFT JOIN surveys s ON s.id = r.survey_id
      WHERE r.member_id = ${member.id}
      ORDER BY r.created_at DESC
    `,
    sql`
      SELECT recipient_email, email_type, subject, status, failure_reason,
        created_at, sent_at, delivered_at, failed_at
      FROM email_deliveries WHERE member_id = ${member.id}
      ORDER BY created_at DESC LIMIT 50
    `,
    sql`
      SELECT id, request_type, status, h_number, cadastral_number, section_number, street_address,
        requested_contact_name, requested_primary_email, requested_other_emails,
        created_at, resolved_at
      FROM member_requests WHERE member_id = ${member.id}
      ORDER BY created_at DESC LIMIT 20
    `,
    sql`SELECT changed_fields, created_at FROM member_profile_updates WHERE member_id = ${member.id} ORDER BY created_at DESC LIMIT 20`,
  ]);
  return { member, responses, deliveries, requests, updates };
}

export async function updateMemberSelfServiceProfile(secret, input, options = {}) {
  const contacts = normalizeContactDetails(input);
  const sql = options.sql || getSql();
  const env = options.env || process.env;
  const current = await getSessionMember(secret, sql, env);
  if (!current) throw new Error('Invalid member session');
  if (contacts.primary_contact_email !== normalizeEmail(current.primary_contact_email)) {
    throw new Error('Primary email change requires verification');
  }
  const changedFields = ['primary_contact_name', 'other_contact_emails'].filter((field) => {
    if (field === 'other_contact_emails') return JSON.stringify(current[field] || []) !== JSON.stringify(contacts[field]);
    return (current[field] || null) !== contacts[field];
  });
  if (!changedFields.length) return current;
  const sessionHash = hashAccessSecret(secret);
  const context = getSecurityContext(env);
  const updateId = randomId();
  const [updated] = await sql`
    WITH valid_session AS (
      SELECT member_id FROM member_sessions
      WHERE session_token_hash = ${sessionHash} AND revoked_at IS NULL AND expires_at > NOW()
        AND absolute_expires_at > NOW() AND environment = ${context.environment} AND audience = ${context.audience}
    ), updated AS (
      UPDATE members m SET
        primary_contact_name = ${contacts.primary_contact_name},
        other_contact_emails = ${contacts.other_contact_emails},
        last_changed_by = ${`member:${current.id}`}
      FROM valid_session t
      WHERE m.id = t.member_id AND m.deleted_at IS NULL
      RETURNING m.*
    ), audit AS (
      INSERT INTO member_profile_updates (id, member_id, changed_fields)
      SELECT ${updateId}, id, ${changedFields} FROM updated
    )
    SELECT id, h_number, cadastral_number, section_number, street_address, title_holder, registration_date,
      primary_contact_name, primary_contact_email, other_contact_emails
    FROM updated
  `;
  if (!updated) throw new Error('Invalid member session');
  return updated;
}

export async function requestMemberEmailChange(secret, requestedEmail, options = {}) {
  const email = normalizeEmail(requestedEmail);
  if (!email) throw new Error('Invalid member data');
  const sql = options.sql || getSql();
  const env = options.env || process.env;
  const member = await getSessionMember(secret, sql, env);
  if (!member) throw new Error('Invalid member session');
  const oldEmail = normalizeEmail(member.primary_contact_email);
  if (!oldEmail || oldEmail === email) throw new Error('Invalid member data');
  if (await isRecipientSuppressed(sql, oldEmail)) throw new Error('Email delivery unavailable');
  const context = getSecurityContext(env);
  const changeId = randomId();
  const oldSecret = createAccessSecret();
  await sql.transaction([
    sql`UPDATE member_email_changes SET status = 'cancelled', cancelled_at = NOW(),
        old_token_hash = NULL, new_token_hash = NULL
        WHERE member_id = ${member.id} AND status IN ('pending_old', 'pending_new')`,
    sql`INSERT INTO member_email_changes (
          id, member_id, old_email, pending_email, old_token_hash, environment, audience, expires_at
        ) VALUES (
          ${changeId}, ${member.id}, ${oldEmail}, ${email}, ${hashAccessSecret(oldSecret)},
          ${context.environment}, ${context.audience},
          NOW() + (${MEMBER_ACCESS_TTL_SECONDS} * INTERVAL '1 second')
        )`,
  ]);
  const actionUrl = new URL('/api/member-access/email-change/verify', getSelfServiceBaseUrl(env));
  actionUrl.searchParams.set('token', oldSecret);
  try {
    await deliverAccessEmail({
      sql, memberId: member.id, email: oldEmail, emailType: 'member_email_change_old',
      rendered: renderEmailChangeConfirmationEmail({ actionUrl: actionUrl.toString(), baseUrl: getSelfServiceBaseUrl(env), stage: 'old' }),
    });
  } catch (error) {
    await sql`UPDATE member_email_changes SET status = 'cancelled', cancelled_at = NOW(), old_token_hash = NULL
      WHERE id = ${changeId} AND status = 'pending_old'`;
    throw error;
  }
  await recordSecurityEvent(sql, {
    eventType: 'member_email_change_requested', actorType: 'member', result: 'old_confirmation_sent',
    memberId: member.id, entityId: changeId,
    metadata: { environment: context.environment, audience: context.audience },
  }, env);
  return { accepted: true };
}

async function sendEmailChangeNotice(sql, memberId, email, completed, env) {
  try {
    await deliverAccessEmail({
      sql, memberId, email, emailType: 'member_email_change_notice',
      rendered: renderEmailChangeNoticeEmail({ baseUrl: getSelfServiceBaseUrl(env), completed }),
    });
  } catch (error) {
    console.error('Member email change notice failed', { code: error.code || error.cause?.code, occurredAt: new Date().toISOString() });
  }
}

export async function verifyMemberEmailChange(secret, options = {}) {
  if (!isAccessSecret(secret)) return null;
  const sql = options.sql || getSql();
  const env = options.env || process.env;
  const context = await assertDatabaseEnvironment(sql, env);
  const tokenHash = hashAccessSecret(secret);
  const newSecret = createAccessSecret();
  const [oldStage] = await sql`
    UPDATE member_email_changes SET
      old_confirmed_at = NOW(), old_token_hash = NULL,
      new_token_hash = ${hashAccessSecret(newSecret)}, status = 'pending_new',
      expires_at = NOW() + (${MEMBER_ACCESS_TTL_SECONDS} * INTERVAL '1 second')
    WHERE old_token_hash = ${tokenHash} AND status = 'pending_old' AND expires_at > NOW()
      AND environment = ${context.environment} AND audience = ${context.audience}
    RETURNING id, member_id, old_email, pending_email
  `;
  if (oldStage) {
    if (await isRecipientSuppressed(sql, oldStage.pending_email)) {
      await sql`UPDATE member_email_changes SET status = 'cancelled', cancelled_at = NOW(), new_token_hash = NULL
        WHERE id = ${oldStage.id} AND status = 'pending_new'`;
      await sendEmailChangeNotice(sql, oldStage.member_id, oldStage.old_email, false, env);
      return { stage: 'cancelled' };
    }
    const actionUrl = new URL('/api/member-access/email-change/verify', getSelfServiceBaseUrl(env));
    actionUrl.searchParams.set('token', newSecret);
    try {
      await deliverAccessEmail({
        sql, memberId: oldStage.member_id, email: oldStage.pending_email, emailType: 'member_email_change_new',
        rendered: renderEmailChangeConfirmationEmail({ actionUrl: actionUrl.toString(), baseUrl: getSelfServiceBaseUrl(env), stage: 'new' }),
      });
    } catch (error) {
      await sql`UPDATE member_email_changes SET status = 'cancelled', cancelled_at = NOW(), new_token_hash = NULL
        WHERE id = ${oldStage.id} AND status = 'pending_new'`;
      throw error;
    }
    await recordSecurityEvent(sql, {
      eventType: 'member_email_change_old_confirmed', actorType: 'member', result: 'new_confirmation_sent',
      memberId: oldStage.member_id, entityId: oldStage.id,
      metadata: { environment: context.environment, audience: context.audience },
    }, env);
    return { stage: 'old-confirmed' };
  }

  const [completed] = await sql`
    WITH confirmed AS (
      UPDATE member_email_changes c SET
        new_confirmed_at = NOW(), completed_at = NOW(), status = 'completed', new_token_hash = NULL
      WHERE c.new_token_hash = ${tokenHash} AND c.status = 'pending_new' AND c.expires_at > NOW()
        AND c.environment = ${context.environment} AND c.audience = ${context.audience}
        AND EXISTS (
          SELECT 1 FROM members m WHERE m.id = c.member_id AND m.deleted_at IS NULL
            AND lower(btrim(m.primary_contact_email)) = lower(c.old_email)
        )
      RETURNING c.id, c.member_id, c.old_email, c.pending_email
    ), updated_member AS (
      UPDATE members m SET primary_contact_email = c.pending_email,
        last_changed_by = 'member:' || c.member_id::text
      FROM confirmed c WHERE m.id = c.member_id
      RETURNING m.id
    ), revoked_member_tokens AS (
      UPDATE member_access_tokens SET revoked_at = NOW()
      WHERE member_id IN (SELECT id FROM updated_member) AND revoked_at IS NULL RETURNING id
    ), revoked_member_sessions AS (
      UPDATE member_sessions SET revoked_at = NOW()
      WHERE member_id IN (SELECT id FROM updated_member) AND revoked_at IS NULL RETURNING id
    ), revoked_survey_tokens AS (
      UPDATE survey_access_tokens SET revoked_at = NOW()
      WHERE member_id IN (SELECT id FROM updated_member) AND revoked_at IS NULL RETURNING id
    ), revoked_survey_sessions AS (
      UPDATE survey_sessions SET revoked_at = NOW()
      WHERE member_id IN (SELECT id FROM updated_member) AND revoked_at IS NULL RETURNING id
    )
    SELECT c.* FROM confirmed c JOIN updated_member m ON m.id = c.member_id
  `;
  if (!completed) {
    await recordSecurityEvent(sql, {
      eventType: 'member_email_change_verification', actorType: 'public', result: 'rejected', key: 'email-change-attempt',
      metadata: { environment: context.environment, audience: context.audience },
    }, env);
    return null;
  }
  await recordSecurityEvent(sql, {
    eventType: 'member_email_change_completed', actorType: 'member', result: 'completed',
    memberId: completed.member_id, entityId: completed.id,
    metadata: { environment: context.environment, audience: context.audience },
  }, env);
  await Promise.all([
    sendEmailChangeNotice(sql, completed.member_id, completed.old_email, true, env),
    sendEmailChangeNotice(sql, completed.member_id, completed.pending_email, true, env),
  ]);
  return { stage: 'completed' };
}

export async function revokeMemberSession(secret, options = {}) {
  if (!isAccessSecret(secret)) return false;
  const sql = options.sql || getSql();
  const env = options.env || process.env;
  const context = await assertDatabaseEnvironment(sql, env);
  const [revoked] = await sql`
    UPDATE member_sessions SET revoked_at = NOW()
    WHERE session_token_hash = ${hashAccessSecret(secret)} AND revoked_at IS NULL
      AND environment = ${context.environment} AND audience = ${context.audience}
    RETURNING id, member_id
  `;
  if (revoked) await recordSecurityEvent(sql, {
    eventType: 'member_session_revoked', actorType: 'member', result: 'logout',
    memberId: revoked.member_id, entityId: revoked.id,
    metadata: { environment: context.environment, audience: context.audience },
  }, env);
  return Boolean(revoked);
}

export async function createOwnershipTransferRequest(secret, input) {
  const contacts = normalizeContactDetails(input);
  const sql = getSql();
  const member = await getSessionMember(secret, sql);
  if (!member) throw new Error('Invalid member session');
  try {
    const [request] = await sql`
      INSERT INTO member_requests (
        id, request_type, status, member_id, h_number, cadastral_number, section_number, street_address,
        requested_contact_name, requested_primary_email, requested_other_emails, verified_at, last_changed_by
      ) VALUES (
        ${randomId()}, 'ownership_transfer', 'pending', ${member.id}, ${member.h_number}, ${member.cadastral_number}, ${member.section_number}, ${member.street_address},
        ${contacts.primary_contact_name}, ${contacts.primary_contact_email}, ${contacts.other_contact_emails}, NOW(), ${`member:${member.id}`}
      ) RETURNING id, status, created_at
    `;
    return request;
  } catch (error) {
    if (error.code === '23505' || error.cause?.code === '23505') throw new Error('Ownership request already pending');
    throw error;
  }
}

export async function createMembershipRequest(input) {
  let values = normalizeMembershipRequest(input);
  const sql = getSql();
  const context = await assertDatabaseEnvironment(sql);
  await sql`
    DELETE FROM member_requests
    WHERE status = 'pending_verification'
      AND verification_expires_at < NOW() - INTERVAL '7 days'
  `;
  const [existing] = await sql`
    SELECT id FROM members WHERE deleted_at IS NULL AND (
      (${values.h_number}::text IS NOT NULL AND lower(btrim(h_number)) = lower(${values.h_number})) OR
      (${values.cadastral_number}::text IS NOT NULL AND lower(btrim(COALESCE(cadastral_number, ''))) = lower(${values.cadastral_number})
        AND (${values.section_number}::text IS NULL OR COALESCE(section_number, '') = ${values.section_number})) OR
      (${values.cadastral_number}::text IS NULL AND ${values.street_address}::text IS NOT NULL
        AND lower(btrim(COALESCE(street_address, ''))) = lower(${values.street_address}))
    ) LIMIT 1
  `;
  if (existing) return { accepted: true };
  const [recent] = await sql`
    SELECT id FROM member_requests
    WHERE request_type = 'membership'
      AND created_at > NOW() - INTERVAL '10 minutes'
      AND (
        requested_primary_email = ${values.primary_contact_email} OR
        (${values.h_number}::text IS NOT NULL AND lower(btrim(COALESCE(h_number, ''))) = lower(${values.h_number})) OR
        (${values.cadastral_number}::text IS NOT NULL AND lower(btrim(COALESCE(cadastral_number, ''))) = lower(${values.cadastral_number})
          AND (${values.section_number}::text IS NULL OR COALESCE(section_number, '') = ${values.section_number})) OR
        (${values.cadastral_number}::text IS NULL AND ${values.street_address}::text IS NOT NULL
          AND lower(btrim(COALESCE(street_address, ''))) = lower(${values.street_address}))
      )
    LIMIT 1
  `;
  if (recent) return { accepted: true };
  if (await isRecipientSuppressed(sql, values.primary_contact_email)) return { accepted: true };
  const assessment = await assessSubmittedProperty(values);
  values = assessment.values;
  const secret = createAccessSecret();
  const requestId = randomId();
  const tokenHash = hashAccessSecret(secret);
  const [request] = await sql`
    INSERT INTO member_requests (
      id, request_type, status, h_number, cadastral_number, section_number, street_address, matrikkel_review,
      requested_contact_name, requested_primary_email, requested_other_emails,
      verification_token_hash, verification_expires_at, verification_environment,
      verification_audience, verification_purpose, last_changed_by
    ) VALUES (
      ${requestId}, 'membership', 'pending_verification', ${values.h_number}, ${values.cadastral_number}, ${values.section_number}, ${values.street_address}, ${JSON.stringify(assessment.review)}::jsonb,
      ${values.primary_contact_name}, ${values.primary_contact_email}, ${values.other_contact_emails},
      ${tokenHash}, NOW() + INTERVAL '15 minutes', ${context.environment}, ${context.audience},
      'membership_verification', ${`unverified:${values.primary_contact_email}`}
    ) RETURNING id
  `;
  const actionUrl = new URL('/api/membership-requests/verify', getSelfServiceBaseUrl());
  actionUrl.searchParams.set('token', secret);
  const rendered = renderMembershipVerificationEmail({ actionUrl: actionUrl.toString(), baseUrl: getSelfServiceBaseUrl() });
  try {
    await deliverAccessEmail({ sql, email: values.primary_contact_email, emailType: 'membership_verification', rendered });
  } catch (error) {
    await sql`DELETE FROM member_requests WHERE id = ${requestId} AND status = 'pending_verification'`;
    throw error;
  }
  await recordSecurityEvent(sql, {
    eventType: 'membership_verification_issued', actorType: 'public', result: 'sent', entityId: requestId,
    metadata: { purpose: 'membership_verification', environment: context.environment, audience: context.audience },
  });
  return { accepted: true, requestId: request.id };
}

export async function verifyMembershipRequest(secret) {
  if (!isAccessSecret(secret)) return null;
  const sql = getSql();
  const context = await assertDatabaseEnvironment(sql);
  const [request] = await sql`
    UPDATE member_requests SET status = 'pending', verified_at = NOW(),
      verification_token_hash = NULL, verification_expires_at = NULL,
      verification_consumed_at = NOW(),
      last_changed_by = 'applicant:' || requested_primary_email
    WHERE verification_token_hash = ${hashAccessSecret(secret)}
      AND status = 'pending_verification' AND verification_expires_at > NOW()
      AND verification_environment = ${context.environment}
      AND verification_audience = ${context.audience}
      AND verification_purpose = 'membership_verification'
    RETURNING id
  `;
  await recordSecurityEvent(sql, {
    eventType: 'membership_verification_consumed', actorType: 'public', result: request ? 'accepted' : 'rejected',
    entityId: request?.id || null, key: 'membership-verification-attempt',
    metadata: { purpose: 'membership_verification', environment: context.environment, audience: context.audience },
  });
  return request || null;
}

export async function getAdminMemberRequests() {
  await requireAdminUser();
  if (isMockMode()) return [];
  const sql = getSql();
  return sql`
    SELECT r.id, r.request_type, r.status, r.member_id, r.h_number, r.cadastral_number,
      r.section_number, r.street_address, r.matrikkel_review,
      r.requested_contact_name, r.requested_primary_email, r.requested_other_emails,
      r.created_at, m.title_holder
    FROM member_requests r
    LEFT JOIN members m ON m.id = r.member_id
    WHERE r.status IN ('pending', 'pending_verification')
    ORDER BY r.created_at
  `;
}

export async function updateAdminMemberRequestProperty(requestId, input, verifyWithMatrikkel = false) {
  const user = await requireAdminUser();
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!REQUEST_ID_PATTERN.test(requestId || '')) throw new Error('Invalid member request');
  const cadastralNumber = normalizeCadastralNumber(input?.cadastral_number);
  const sectionNumber = normalizeSectionNumber(input?.section_number);
  if (!cadastralNumber) throw new Error('Cadastral number required');
  const sql = getSql();
  const [request] = await sql`
    SELECT id, street_address FROM member_requests
    WHERE id = ${requestId} AND request_type = 'membership'
      AND status IN ('pending', 'pending_verification')
  `;
  if (!request) throw new Error('Member request not found');

  let review;
  if (!verifyWithMatrikkel) {
    review = reviewPayload('manual', 'MANUALLY_CONFIRMED', 'Gårds-/bruksnummer og eventuell seksjon er bekreftet manuelt av saksbehandler.', { checkedBy: user.email.toLowerCase() });
  } else {
    const property = parseCadastralNumber(cadastralNumber);
    try {
      let addressMatch = null;
      if (request.street_address) addressMatch = await lookupAddress(request.street_address, property);
      const details = await new MatrikkelClient().lookupProperty({ ...property, snr: sectionNumber || '0' });
      review = !sectionNumber && !details.owners.length
        ? reviewPayload('review', 'SECTION_REQUIRED', 'Matrikkelenheten finnes, men ingen aktiv hjemmelshaver ble funnet uten seksjonsnummer. Kontroller om adressen er seksjonert.', {
          officialAddress: addressMatch ? officialAddress(addressMatch.candidate) : null,
        })
        : reviewPayload('verified', 'MATRIKKEL_VERIFIED', 'Matrikkelenheten er kontrollert mot adresse og Matrikkel-API.', {
          checkedBy: user.email.toLowerCase(), officialAddress: addressMatch ? officialAddress(addressMatch.candidate) : null,
        });
    } catch (error) {
      const needsSection = error.code === 'NOT_FOUND' && !sectionNumber;
      review = reviewPayload('review', needsSection ? 'SECTION_REQUIRED' : (error.code || 'MATRIKKEL_LOOKUP_FAILED'),
        needsSection
          ? 'Matrikkelenheten kunne ikke finnes uten seksjonsnummer. Kontroller hvilken seksjon adressen gjelder.'
          : (error.message || 'Matrikkelenheten kunne ikke verifiseres.'),
        { candidates: error.details?.candidates || [] });
    }
  }
  const [updated] = await sql`
    UPDATE member_requests SET cadastral_number = ${cadastralNumber}, section_number = ${sectionNumber},
      matrikkel_review = ${JSON.stringify(review)}::jsonb, last_changed_by = ${user.email.toLowerCase()}
    WHERE id = ${requestId} AND request_type = 'membership'
      AND status IN ('pending', 'pending_verification')
    RETURNING id, cadastral_number, section_number, matrikkel_review
  `;
  if (!updated) throw new Error('Member request not found');
  return updated;
}

export async function resolveAdminMemberRequest(requestId, action) {
  const user = await requireAdminUser();
  if (isMockMode()) throw new Error('Mock data cannot be changed');
  if (!REQUEST_ID_PATTERN.test(requestId || '') || !['approve', 'reject'].includes(action)) throw new Error('Invalid member request');
  const sql = getSql();
  if (action === 'reject') {
    const [rejected] = await sql`
      UPDATE member_requests SET status = 'rejected', resolved_at = NOW(), resolved_by = ${user.email.toLowerCase()},
        verification_token_hash = NULL, verification_expires_at = NULL, last_changed_by = ${user.email.toLowerCase()}
      WHERE id = ${requestId} AND status IN ('pending', 'pending_verification') RETURNING id, status
    `;
    if (!rejected) throw new Error('Member request not found');
    return rejected;
  }
  const [request] = await sql`SELECT * FROM member_requests WHERE id = ${requestId} AND status IN ('pending', 'pending_verification')`;
  if (!request) throw new Error('Member request not found');
  if (request.request_type === 'membership' && !['verified', 'manual'].includes(request.matrikkel_review?.status)) {
    throw new Error('Member request property unresolved');
  }
  if (request.request_type === 'ownership_transfer') {
    const [approved] = await sql`
      WITH updated_member AS (
        UPDATE members SET
          primary_contact_name = ${request.requested_contact_name},
          primary_contact_email = ${request.requested_primary_email},
          other_contact_emails = ${request.requested_other_emails},
          last_changed_by = ${user.email.toLowerCase()}
        WHERE id = ${request.member_id} AND deleted_at IS NULL RETURNING id
      ), revoked_access AS (
        UPDATE member_access_tokens SET revoked_at = NOW()
        WHERE member_id IN (SELECT id FROM updated_member) AND revoked_at IS NULL
        RETURNING id
      ), revoked_sessions AS (
        UPDATE member_sessions SET revoked_at = NOW()
        WHERE member_id IN (SELECT id FROM updated_member) AND revoked_at IS NULL
        RETURNING id
      ), revoked_survey_access AS (
        UPDATE survey_access_tokens SET revoked_at = NOW()
        WHERE member_id IN (SELECT id FROM updated_member) AND revoked_at IS NULL
        RETURNING id
      ), revoked_survey_sessions AS (
        UPDATE survey_sessions SET revoked_at = NOW()
        WHERE member_id IN (SELECT id FROM updated_member) AND revoked_at IS NULL
        RETURNING id
      )
      UPDATE member_requests SET status = 'approved', resolved_at = NOW(), resolved_by = ${user.email.toLowerCase()},
        verification_token_hash = NULL, verification_expires_at = NULL, last_changed_by = ${user.email.toLowerCase()}
      WHERE id = ${requestId} AND status IN ('pending', 'pending_verification')
        AND EXISTS (SELECT 1 FROM updated_member)
        AND (SELECT COUNT(*) FROM revoked_access) >= 0
      RETURNING id, status, member_id
    `;
    if (!approved) throw new Error('Member request conflict');
    return approved;
  }
  const [approved] = await sql`
    WITH inserted_member AS (
      INSERT INTO members (h_number, cadastral_number, section_number, street_address, primary_contact_name, primary_contact_email, other_contact_emails, last_changed_by)
      SELECT COALESCE(${request.h_number}, 'N/A'), ${request.cadastral_number}, ${request.section_number}, ${request.street_address}, ${request.requested_contact_name},
        ${request.requested_primary_email}, ${request.requested_other_emails}, ${user.email.toLowerCase()}
      WHERE NOT EXISTS (
        SELECT 1 FROM members WHERE deleted_at IS NULL AND (
          (${request.h_number}::text IS NOT NULL AND lower(btrim(h_number)) = lower(${request.h_number})) OR
          (${request.cadastral_number}::text IS NOT NULL AND lower(btrim(COALESCE(cadastral_number, ''))) = lower(${request.cadastral_number})
            AND (${request.section_number}::text IS NULL OR COALESCE(section_number, '') = ${request.section_number})) OR
          (${request.cadastral_number}::text IS NULL AND ${request.street_address}::text IS NOT NULL
            AND lower(btrim(COALESCE(street_address, ''))) = lower(${request.street_address}))
        )
      ) RETURNING id
    )
    UPDATE member_requests SET status = 'approved', member_id = inserted_member.id,
      resolved_at = NOW(), resolved_by = ${user.email.toLowerCase()},
      verification_token_hash = NULL, verification_expires_at = NULL, last_changed_by = ${user.email.toLowerCase()}
    FROM inserted_member WHERE member_requests.id = ${requestId}
      AND member_requests.status IN ('pending', 'pending_verification')
    RETURNING member_requests.id, member_requests.status, member_requests.member_id
  `;
  if (!approved) throw new Error('Member request conflict');
  return approved;
}

export function getMemberAccessTtlSeconds() {
  return MEMBER_ACCESS_TTL_SECONDS;
}
