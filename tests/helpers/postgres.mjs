import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { splitSqlStatements } from '../../scripts/split-sql-statements.mjs';

// Deliberately separate from DATABASE_URL and .env.local. This suite is allowed
// to create synthetic fixtures only in a dedicated, loopback test database.
export function testDatabaseUrl(value = process.env.TEST_DATABASE_URL) {
  if (!value) throw new Error('TEST_DATABASE_URL is required; use an isolated local Postgres database.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.pathname !== '/tfv_test' || url.search || url.hash) {
    throw new Error('Integration tests require loopback database tfv_test, without URL options.');
  }
  return value;
}

export function createTestDatabase() {
  const pool = new Pool({ connectionString: testDatabaseUrl(), max: 8 });
  function query(text, values = []) {
    // Match Neon's lazy query contract: transaction([...]) must not execute
    // statements outside the transaction before it acquires a single client.
    let promise;
    return { text, values, then(resolve, reject) {
      promise ??= pool.query(text, values).then((result) => result.rows);
      return promise.then(resolve, reject);
    } };
  }
  function sql(strings, ...values) {
    return query(strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, ''), values);
  }
  sql.query = query;
  sql.transaction = async (queries) => {
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
    await sql.transaction(splitSqlStatements(schema).map((statement) => sql.query(statement)));
    await sql`INSERT INTO application_environment (singleton, environment)
      VALUES (TRUE, 'development') ON CONFLICT (singleton) DO NOTHING`;
  } };
}
