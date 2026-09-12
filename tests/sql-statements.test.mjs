import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { splitSqlStatements } from '../scripts/split-sql-statements.mjs';

test('database setup ignores semicolons in comments and quoted values', () => {
  const statements = splitSqlStatements(`
    -- Feltverdier dupliseres ikke; bare feltnavn lagres.
    CREATE TABLE example (value TEXT DEFAULT 'a;b');
    /* Også blokkkommentarer; kan inneholde semikolon. */
    INSERT INTO example (value) VALUES ($body$x;y$body$);
  `);

  assert.equal(statements.length, 2);
  assert.match(statements[0], /CREATE TABLE example/);
  assert.match(statements[1], /INSERT INTO example/);
});

test('database setup rejects unterminated SQL quoting', () => {
  assert.throws(() => splitSqlStatements("SELECT 'uferdig;"), /Uavsluttet SQL/);
});

test('production schema contains complete audit triggers without sensitive values', async () => {
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  const statements = splitSqlStatements(schema);
  const auditFunction = statements.find((statement) => statement.includes('FUNCTION record_audit_change()'));
  const auditTriggers = statements.filter((statement) => /CREATE TRIGGER \w+_audit_trigger/.test(statement));
  const contextTriggers = statements.filter((statement) => /CREATE TRIGGER \w+_audit_context_trigger/.test(statement));

  assert.ok(auditFunction);
  assert.equal(auditTriggers.length, 6);
  assert.equal(contextTriggers.length, 6);
  assert.match(auditFunction, /old_data := old_data - 'access_token'/);
  assert.match(auditFunction, /old_data := old_data - 'verification_token_hash'/);
  assert.match(auditFunction, /old_data := old_data - 'storage_key'/);
  assert.ok(auditTriggers.every((statement) => statement.includes('AFTER INSERT OR UPDATE OR DELETE')));
  assert.ok(contextTriggers.every((statement) => statement.includes('BEFORE INSERT OR UPDATE OR DELETE')));
  for (const table of ['member_sessions', 'member_email_changes', 'survey_access_tokens', 'survey_sessions', 'security_events', 'security_rate_limits', 'application_environment']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  const cleanup = await readFile(new URL('../database/security-cleanup.sql', import.meta.url), 'utf8');
  assert.match(cleanup, /ALTER TABLE members DROP COLUMN IF EXISTS access_token/);
  assert.match(schema, /member_access_tokens[\s\S]*consumed_at/);
  assert.match(schema, /security_events_append_only_trigger/);
});
