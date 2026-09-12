import { neon } from '@neondatabase/serverless';
import { createAccessSecret, hashAccessSecret, randomId } from '../lib/member-self-service-utils.js';
import { verifyMemberAccess } from '../lib/member-self-service.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL mangler');
if (!['development', 'staging'].includes(process.env.APP_ENVIRONMENT)) {
  throw new Error('Sikkerhetsverifikasjonen kan ikke kjøres mot production');
}

const sql = neon(process.env.DATABASE_URL);
const [database] = await sql`SELECT environment FROM application_environment WHERE singleton = TRUE`;
if (database?.environment !== process.env.APP_ENVIRONMENT) throw new Error('Database environment mismatch');

const marker = randomId();
const [member] = await sql`
  INSERT INTO members (h_number, primary_contact_email)
  VALUES (${`SECURITY-TEST-${marker}`}, 'security-test@example.invalid')
  RETURNING id
`;
const secret = createAccessSecret();
await sql`
  INSERT INTO member_access_tokens (
    id, member_id, token_hash, environment, audience, purpose, expires_at
  ) VALUES (
    ${randomId()}, ${member.id}, ${hashAccessSecret(secret)}, ${process.env.APP_ENVIRONMENT},
    ${process.env.TOKEN_AUDIENCE}, 'member_login', NOW() + INTERVAL '15 minutes'
  )
`;

const results = await Promise.all(Array.from({ length: 8 }, () => verifyMemberAccess(secret)));
const [counts] = await sql`
  SELECT COUNT(*) FILTER (WHERE consumed_at IS NOT NULL)::int AS consumed,
    (SELECT COUNT(*)::int FROM member_sessions WHERE member_id = ${member.id}) AS sessions
  FROM member_access_tokens WHERE member_id = ${member.id}
`;
const successfulExchanges = results.filter(Boolean).length;
if (successfulExchanges !== 1 || counts.consumed !== 1 || counts.sessions !== 1) {
  throw new Error('Replay-verifikasjonen feilet');
}
console.log({ successfulExchanges, consumedTokens: counts.consumed, sessions: counts.sessions });
