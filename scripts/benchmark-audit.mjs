import { createTestDatabase } from '../tests/helpers/postgres.mjs';

// Synthetic, rollback-only benchmark. The shared helper refuses production,
// non-loopback hosts and any database other than tfv_test. No .env is read.
const database = createTestDatabase();
await database.migrate();
const client = await database.pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout = '30s'");
  await client.query(`INSERT INTO audit_log(table_name, row_id, operation, changed_by, before_value, after_value, changed_at)
    SELECT 'members', 'benchmark:' || i, 'UPDATE', 'synthetic-' || (i % 20) || '@example.invalid',
      jsonb_build_object('street_address', 'Syntetiskvegen ' || i, 'primary_contact_name', 'Testperson ' || i),
      jsonb_build_object('street_address', 'Syntetiskvegen ' || i, 'primary_contact_name', 'Endret testperson ' || i,
        'admin_comment', repeat('Kun syntetiske verdier. ', 12)),
      NOW() - make_interval(secs => i)
    FROM generate_series(1, 100000) i`);
  await client.query('ANALYZE audit_log');
  for (const [name, statement, parameters] of [
    ['rare-substring-count', "SELECT COUNT(*) FROM admin_activity_log WHERE strpos(lower(concat_ws(' ', changed_by, row_id, before_value::text, after_value::text)), lower($1)) > 0", ['testperson 98765']],
    ['common-substring-page-25', "SELECT id, table_name, row_id, before_value, after_value, changed_at FROM admin_activity_log WHERE strpos(lower(concat_ws(' ', changed_by, row_id, before_value::text, after_value::text)), lower($1)) > 0 ORDER BY changed_at DESC, id DESC LIMIT 50 OFFSET 1200", ['syntetiskvegen']],
    ['actor-date-page', "SELECT id, table_name, row_id, changed_at FROM admin_activity_log WHERE changed_by = $1 AND changed_at > NOW() - INTERVAL '1 day' ORDER BY changed_at DESC, id DESC LIMIT 50", ['synthetic-7@example.invalid']],
  ]) {
    const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`, parameters);
    const result = rows[0]['QUERY PLAN'][0];
    const nodeTypes = (node) => [node['Node Type'], ...(node.Plans || []).flatMap(nodeTypes)];
    console.log(JSON.stringify({ name, syntheticRows: 100000, executionMs: result['Execution Time'],
      returnedRows: result.Plan['Actual Rows'], sharedHitBlocks: result.Plan['Shared Hit Blocks'], nodes: [...new Set(nodeTypes(result.Plan))] }));
  }
} finally {
  await client.query('ROLLBACK'); client.release(); await database.close();
}
