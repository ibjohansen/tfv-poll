import { getSql } from './db.js';
import { renderMemberAccessEmail, renderMembershipVerificationEmail } from './email-templates.js';
import { getMailerSendSuppressions, isSuppressedRecipient, normalizeEmail, sendEmail } from './mailer-service.js';
import {
  cleanText, createAccessSecret, hashAccessSecret, isAccessSecret, maskEmailAddress,
  MEMBER_ACCESS_TTL_SECONDS, normalizeCadastralNumber, normalizeContactDetails, normalizeMemberLookup,
  normalizeHNumberLookup, normalizeMembershipRequest, normalizeSectionNumber, parseCadastralNumber, randomId,
} from './member-self-service-utils.js';
import { requireAdmin } from './admin-access.js';
import { isMockMode } from './mock-store.js';
import { addressProperty, lookupAddress, MatrikkelClient, officialAddress } from './matrikkel-client.js';

const REQUEST_ID_PATTERN = /^[a-f0-9]{32}$/i;

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
  const submittedLookup = cleanText(String(identifier || ''), 320, true);
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
  if (matches.length !== 1) {
    return { sql, publicResult: { accepted: true, found: false, lookup: submittedLookup } };
  }
  const member = matches[0];
  const email = normalizeEmail(member.primary_contact_email);
  const publicResult = {
    accepted: true,
    found: true,
    lookup: submittedLookup,
    hNumber: member.h_number,
    streetAddress: member.street_address,
    maskedEmail: maskEmailAddress(email),
  };
  if (!email) publicResult.deliveryAvailable = false;
  return { sql, member, email, publicResult };
}

export async function lookupMemberAccess(identifier) {
  const { publicResult } = await findMemberAccessTarget(identifier);
  return publicResult;
}

export async function requestMemberAccess(identifier) {
  const { sql, member, email, publicResult } = await findMemberAccessTarget(identifier);
  if (!publicResult.found || !email) return publicResult;
  await sql`DELETE FROM member_access_tokens WHERE expires_at < NOW() - INTERVAL '7 days'`;
  const [recent] = await sql`
    SELECT id FROM member_access_tokens
    WHERE member_id = ${member.id} AND created_at > NOW() - INTERVAL '10 minutes'
    ORDER BY created_at DESC LIMIT 1
  `;
  if (recent) return publicResult;
  if (await isRecipientSuppressed(sql, email)) return { ...publicResult, deliveryAvailable: false };

  const secret = createAccessSecret();
  const tokenHash = hashAccessSecret(secret);
  const tokenId = randomId();
  let created;
  try {
    const result = await sql.transaction([
      sql`UPDATE member_access_tokens SET revoked_at = NOW() WHERE member_id = ${member.id} AND revoked_at IS NULL`,
      sql`INSERT INTO member_access_tokens (id, member_id, token_hash, expires_at)
          VALUES (${tokenId}, ${member.id}, ${tokenHash}, NOW() + INTERVAL '24 hours') RETURNING expires_at`,
    ]);
    [created] = result[1];
  } catch (error) {
    if (error.code === '23505' || error.cause?.code === '23505') return publicResult;
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
  return { ...publicResult, expiresAt: created.expires_at };
}

export async function verifyMemberAccess(secret) {
  if (!isAccessSecret(secret)) return null;
  const sql = getSql();
  const tokenHash = hashAccessSecret(secret);
  const [session] = await sql`
    UPDATE member_access_tokens SET last_used_at = NOW()
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > NOW()
    RETURNING id, member_id, expires_at
  `;
  return session || null;
}

async function getSessionMember(secret, sql = getSql()) {
  if (!isAccessSecret(secret)) return null;
  const tokenHash = hashAccessSecret(secret);
  const [member] = await sql`
    SELECT m.id, m.h_number, m.cadastral_number, m.section_number, m.street_address, m.title_holder,
      m.registration_date, m.primary_contact_name, m.primary_contact_email,
      m.other_contact_emails, m.admin_comment, t.expires_at
    FROM member_access_tokens t
    JOIN members m ON m.id = t.member_id
    WHERE t.token_hash = ${tokenHash} AND t.revoked_at IS NULL AND t.expires_at > NOW()
      AND m.deleted_at IS NULL
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

export async function updateMemberSelfServiceProfile(secret, input) {
  const contacts = normalizeContactDetails(input);
  const sql = getSql();
  const current = await getSessionMember(secret, sql);
  if (!current) throw new Error('Invalid member session');
  const changedFields = ['primary_contact_name', 'primary_contact_email', 'other_contact_emails'].filter((field) => {
    if (field === 'other_contact_emails') return JSON.stringify(current[field] || []) !== JSON.stringify(contacts[field]);
    return (current[field] || null) !== contacts[field];
  });
  if (!changedFields.length) return current;
  const tokenHash = hashAccessSecret(secret);
  const updateId = randomId();
  const [updated] = await sql`
    WITH valid_token AS (
      SELECT member_id FROM member_access_tokens
      WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > NOW()
    ), updated AS (
      UPDATE members m SET
        primary_contact_name = ${contacts.primary_contact_name},
        primary_contact_email = ${contacts.primary_contact_email},
        other_contact_emails = ${contacts.other_contact_emails},
        last_changed_by = ${`member:${current.id}`}
      FROM valid_token t
      WHERE m.id = t.member_id AND m.deleted_at IS NULL
      RETURNING m.*
    ), audit AS (
      INSERT INTO member_profile_updates (id, member_id, changed_fields)
      SELECT ${updateId}, id, ${changedFields} FROM updated
    )
    SELECT id, h_number, cadastral_number, section_number, street_address, title_holder, registration_date,
      primary_contact_name, primary_contact_email, other_contact_emails, admin_comment
    FROM updated
  `;
  if (!updated) throw new Error('Invalid member session');
  return updated;
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
      verification_token_hash, verification_expires_at, last_changed_by
    ) VALUES (
      ${requestId}, 'membership', 'pending_verification', ${values.h_number}, ${values.cadastral_number}, ${values.section_number}, ${values.street_address}, ${JSON.stringify(assessment.review)}::jsonb,
      ${values.primary_contact_name}, ${values.primary_contact_email}, ${values.other_contact_emails},
      ${tokenHash}, NOW() + INTERVAL '24 hours', ${`unverified:${values.primary_contact_email}`}
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
  return { accepted: true, requestId: request.id };
}

export async function verifyMembershipRequest(secret) {
  if (!isAccessSecret(secret)) return null;
  const sql = getSql();
  const [request] = await sql`
    UPDATE member_requests SET status = 'pending', verified_at = NOW(),
      verification_token_hash = NULL, verification_expires_at = NULL,
      last_changed_by = 'applicant:' || requested_primary_email
    WHERE verification_token_hash = ${hashAccessSecret(secret)}
      AND status = 'pending_verification' AND verification_expires_at > NOW()
    RETURNING id
  `;
  return request || null;
}

export async function getAdminMemberRequests() {
  await requireAdmin();
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
  const user = await requireAdmin();
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
  const user = await requireAdmin();
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
