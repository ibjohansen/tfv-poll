// Copies the approved Trollbåndet image to every other alpine activity.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Client } from 'pg';
import { deleteCmsObject, downloadCmsObject, uploadCmsObject } from '../lib/cms-storage.js';

const SOURCE_NAME = 'Trollbåndet';
const keyFor = (id) => `activity-map/images/${id}/${randomUUID().replaceAll('-', '')}.webp`;

async function bytesFrom(body) {
  if (typeof body?.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
  const chunks = [];
  for await (const chunk of body || []) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function unreferenced(db, key) {
  return !(await db.query(`SELECT 1 FROM activity_map_features
    WHERE deleted_at IS NULL AND image_storage_key = $1 LIMIT 1`, [key])).rowCount;
}

async function main() {
  const { values } = parseArgs({ options: {
    action: { type: 'string', default: 'status' }, host: { type: 'string' }, environment: { type: 'string' },
    actor: { type: 'string' }, confirmed: { type: 'boolean' }, snapshot: { type: 'string' },
  } });
  assert.ok(['status', 'apply'].includes(values.action), 'Action must be status or apply');
  assert.ok(['development', 'production'].includes(values.environment));
  const url = new URL(process.env.DATABASE_URL_UNPOOLED);
  assert.equal(url.hostname, values.host, 'Unexpected database host');
  assert.ok(!url.hostname.includes('-pooler'), 'Use a direct connection');
  url.searchParams.set('sslmode', 'verify-full');
  const db = new Client({ connectionString: url.href, connectionTimeoutMillis: 15_000 });
  const uploaded = [];
  let committed = false;
  try {
    await db.connect();
    assert.equal((await db.query('SELECT environment FROM application_environment WHERE singleton=TRUE')).rows[0]?.environment, values.environment);
    const sources = (await db.query(`SELECT id, image_storage_key, image_source_url, image_mime_type, image_size_bytes
      FROM activity_map_features WHERE deleted_at IS NULL AND category = 'alpine' AND lower(name) = lower($1)`, [SOURCE_NAME])).rows;
    assert.equal(sources.length, 1, 'Expected exactly one alpine Trollbåndet activity');
    const source = sources[0];
    assert.match(source.image_storage_key || '', /^activity-map\/images\/[a-f0-9]{32}\/[a-f0-9]{32}\.webp$/);
    assert.equal(source.image_mime_type, 'image/webp');
    const targets = (await db.query(`SELECT id, name, version, image_storage_key FROM activity_map_features
      WHERE deleted_at IS NULL AND category = 'alpine' AND id <> $1 ORDER BY id`, [source.id])).rows;
    if (values.action === 'status') {
      console.log(JSON.stringify({ source: SOURCE_NAME, targets: targets.length,
        alreadyUsingOwnCopy: targets.filter((row) => row.image_storage_key).length }, null, 2));
      return;
    }
    assert.equal(values.confirmed, true, 'Apply requires explicit confirmation');
    assert.match(values.actor || '', /^[a-z0-9][a-z0-9:._@+-]{2,159}$/i, 'A bounded audit actor is required');
    if (values.environment === 'production') assert.match(values.snapshot || '', /^snap-[a-z0-9-]+$/, 'A verified restore snapshot is required');
    const object = await downloadCmsObject(source.image_storage_key);
    const bytes = await bytesFrom(object.Body);
    assert.equal(bytes.length, Number(source.image_size_bytes), 'Stored image size does not match the database');
    const prepared = [];
    for (const target of targets) {
      const key = keyFor(target.id);
      await uploadCmsObject(key, bytes, 'image/webp');
      uploaded.push(key);
      prepared.push({ ...target, key });
    }
    await db.query('BEGIN');
    try {
      for (const target of prepared) {
        const result = await db.query(`UPDATE activity_map_features SET image_storage_key = $1, image_source_url = $2,
          image_mime_type = 'image/webp', image_size_bytes = $3, last_changed_by = $4
          WHERE id = $5 AND version = $6 AND deleted_at IS NULL`,
        [target.key, source.image_source_url, bytes.length, values.actor, target.id, target.version]);
        assert.equal(result.rowCount, 1, `Activity changed concurrently: ${target.id}`);
      }
      await db.query('COMMIT');
      committed = true;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    const oldKeys = [...new Set(targets.map((row) => row.image_storage_key).filter(Boolean))];
    for (const key of oldKeys) {
      if (key === source.image_storage_key) continue;
      try { if (await unreferenced(db, key)) await deleteCmsObject(key); } catch { /* Orphan cleanup is safe to retry later. */ }
    }
    console.log(JSON.stringify({ updated: prepared.length, source: SOURCE_NAME, snapshot: values.snapshot || null,
      occurredAt: new Date().toISOString() }));
  } catch (error) {
    if (!committed) for (const key of uploaded) await deleteCmsObject(key).catch(() => {});
    throw error;
  } finally { await db.end(); }
}

main().catch((error) => {
  console.error('Alpine image update stopped:', error.code || error.name,
    error.name === 'AssertionError' ? error.message : 'No credentials or activity data logged.');
  process.exitCode = 1;
});
