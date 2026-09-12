import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { splitSqlStatements } from './split-sql-statements.mjs';
try {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url || new URL(url).hostname.includes('-pooler')) throw new Error('DATABASE_URL_UNPOOLED mangler eller er en pooled URL');
  const applicationEnvironment = process.env.APP_ENVIRONMENT;
  if (!['development', 'staging', 'production'].includes(applicationEnvironment)) {
    throw new Error('APP_ENVIRONMENT må være development, staging eller production');
  }
  const sql = neon(url);
  const [environmentTable] = await sql`SELECT to_regclass('public.application_environment') AS table_name`;
  if (environmentTable?.table_name) {
    const [database] = await sql`SELECT environment FROM application_environment WHERE singleton = TRUE`;
    if (database && database.environment !== applicationEnvironment) {
      throw new Error(`Database environment mismatch: ${database.environment}`);
    }
  }
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  const statements = splitSqlStatements(schema);
  await sql.transaction([
    ...statements.map((statement) => sql.query(statement)),
    sql`INSERT INTO application_environment (singleton, environment, updated_at)
        VALUES (TRUE, ${applicationEnvironment}, NOW())
        ON CONFLICT (singleton) DO UPDATE
        SET environment = EXCLUDED.environment, updated_at = NOW()`,
  ]);
  console.log('Databaseoppsett fullført.');
} catch (error) {
  console.error('Databaseoppsett mislyktes.', {
    code: error.code || error.cause?.code,
    message: error.message,
  });
  process.exitCode = 1;
}
