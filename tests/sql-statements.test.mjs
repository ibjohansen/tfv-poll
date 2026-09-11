import test from 'node:test';
import assert from 'node:assert/strict';
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
