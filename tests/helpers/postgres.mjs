import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';

// Deliberately separate from DATABASE_URL and .env.local.
// Remote tests additionally require an explicitly verified, temporary schema-only
// branch AND a matching marker in that database before any test SQL can execute.
export function testDatabaseUrl(value = process.env.TEST_DATABASE_URL, env = process.env) {
  if (!value) throw new Error('TEST_DATABASE_URL is required; use an isolated local Postgres database.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) throw new Error('Invalid test database URL.');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/tfv_test' && !url.search;
  const isolatedNeon = url.hostname === env.TEST_NEON_HOST && /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname)
    && !url.hostname.includes('-pooler.') && url.pathname === '/neondb' && (!url.port || url.port === '5432')
    && /^br-[a-z0-9-]+$/.test(env.TEST_NEON_BRANCH_ID || '') && /^[a-f0-9]{64}$/.test(env.TEST_NEON_RUN_ID || '')
    && url.searchParams.get('sslmode') === 'verify-full'
    && [...url.searchParams.keys()].every((key) => ['sslmode', 'channel_binding'].includes(key));
  if (!local && !isolatedNeon) throw new Error('Integration tests require loopback tfv_test or a verified temporary Neon test branch.');
  return value;
}

export function createTestDatabase() {
  const connectionString = testDatabaseUrl();
  const remote = !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(connectionString).hostname);
  const pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 15000 });
  let verified;
  function verifyTarget() {
    if (!remote) return Promise.resolve();
    verified ??= pool.query(`SELECT g.branch_id FROM integration_test_guard g
      JOIN application_environment e ON e.singleton = TRUE AND e.environment = 'development'
      WHERE g.singleton = TRUE AND g.branch_id = $1 AND g.run_id = $2 AND g.expires_at > NOW()`,
    [process.env.TEST_NEON_BRANCH_ID, process.env.TEST_NEON_RUN_ID]).then(({ rows }) => {
      if (rows.length !== 1) throw new Error('Refusing unverified remote test database.');
    });
    return verified;
  }
  function query(text, values = []) {
    // Match Neon's lazy query contract: transaction([...]) must not execute
    // statements outside the transaction before it acquires a single client.
    let promise;
    return { text, values, then(resolve, reject) {
      promise ??= verifyTarget().then(() => pool.query(text, values)).then((result) => result.rows);
      return promise.then(resolve, reject);
    } };
  }
  function sql(strings, ...values) {
    return query(strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, ''), values);
  }
  sql.query = query;
  sql.transaction = async (queries) => {
    await verifyTarget();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const statements = typeof queries === 'function' ? queries(sql) : queries;
      const result = [];
      for (const statement of statements) result.push((await client.query(statement.text, statement.values)).rows);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  };
  return { sql, pool, close: () => pool.end(), async migrate() {
    const [{ exists }] = await sql`SELECT to_regclass('public.application_environment') IS NOT NULL AS exists`;
    if (exists) {
      const rows = await sql`SELECT environment FROM application_environment`;
      if (rows.some((row) => row.environment !== 'development')) throw new Error('Refusing a non-development database.');
    }
    const schema = await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8');
    // One round trip for the DDL, still inside the same explicit transaction.
    await sql.transaction([sql.query(schema)]);
    await sql`INSERT INTO application_environment (singleton, environment)
      VALUES (TRUE, 'development') ON CONFLICT (singleton) DO NOTHING`;
  } };
}
