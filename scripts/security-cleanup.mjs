import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { splitSqlStatements } from './split-sql-statements.mjs';

try {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url || new URL(url).hostname.includes('-pooler')) throw new Error('DATABASE_URL_UNPOOLED mangler eller er pooled');
  if (process.env.SECURITY_CLEANUP_CONFIRMED !== 'true') throw new Error('SECURITY_CLEANUP_CONFIRMED=true kreves');
  if (!['staging', 'production'].includes(process.env.APP_ENVIRONMENT)) throw new Error('Ugyldig APP_ENVIRONMENT');
  const sql = neon(url);
  const [database] = await sql`SELECT environment FROM application_environment WHERE singleton = TRUE`;
  if (database?.environment !== process.env.APP_ENVIRONMENT) throw new Error('Database environment mismatch');
  const source = await readFile(new URL('../database/security-cleanup.sql', import.meta.url), 'utf8');
  await sql.transaction(splitSqlStatements(source).map((statement) => sql.query(statement)));
  console.log('Sikkerhetsopprydding fullført.');
} catch (error) {
  console.error('Sikkerhetsopprydding mislyktes.', { code: error.code || error.cause?.code, message: error.message });
  process.exitCode = 1;
}
