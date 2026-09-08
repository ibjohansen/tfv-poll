import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
try {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url || new URL(url).hostname.includes('-pooler')) throw new Error('DATABASE_URL_UNPOOLED mangler eller er en pooled URL');
  const sql = neon(url);
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  const statements = schema.split(';').map((value) => value.trim()).filter(Boolean);
  await sql.transaction(statements.map((statement) => sql.query(statement)));
  console.log('Databaseoppsett fullført.');
} catch (error) {
  console.error('Databaseoppsett mislyktes.', {
    code: error.code || error.cause?.code,
    message: error.message,
  });
  process.exitCode = 1;
}
