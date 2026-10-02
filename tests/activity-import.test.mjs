import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFile } from 'node:fs/promises';
import { polygonCenterline, centerlineIsInside } from '../scripts/activity-centerline.mjs';
import { applyActivityImport, buildActivityImportPlan, readActivityImportState, workbookHeaders } from '../scripts/activity-workbook-import.mjs';
import { activityMatchesSeason, normalizeActivityWebsite, normalizeActivityFeatureInput } from '../lib/activity-map.js';

const rectangle = { type: 'Polygon', coordinates: [[[9.493,60.472],[9.4931,60.472],[9.4931,60.475],[9.493,60.475],[9.493,60.472]]] };
const source = { sourceFile: 'test.xlsx', sourceHash: 'a'.repeat(64), headers: workbookHeaders, rows: [
  ['Pumptrack','Sykkel','Polygon','Sommer','Sykkelområde',null,null,null],
  ['Flytsti Slåttelia','Sykkel','Linje','Sommer','Flytsti','https://example.test/sti',null,null],
  ['Ferdighetspark','Sykkel','Linje','Sommer','Ferdigheter',null,null,null],
  ['Øvre Vesleåtjern','Aktivitet','Polygon','Sommer','Båt',null,null,null],
  ['Kafeen','Utsalg','Punkt','Helårs','Servering','https://example.test/',null,null],
] };

test('season filtering includes year-round and unclassified activities, URLs reject unsafe protocols', () => {
  for (const season of ['all', 'summer', 'winter', 'all_year']) {
    assert.equal(activityMatchesSeason({ season: 'all_year' }, season), true);
    assert.equal(activityMatchesSeason({ season: null }, season), true);
  }
  assert.equal(activityMatchesSeason({ season: 'summer' }, 'winter'), false);
  assert.equal(activityMatchesSeason({ season: 'winter' }, 'winter'), true);
  assert.equal(activityMatchesSeason({ season: 'winter' }, 'all_year'), false);
  assert.equal(normalizeActivityWebsite(' https://example.test/path '), 'https://example.test/path');
  assert.equal(normalizeActivityWebsite(''), null);
  for (const invalid of ['javascript:alert(1)', 'data:text/html,test', '//example.test', 'https://u:p@example.test', 'https://example.test/a b', 123, 'https://example.test/' + 'x'.repeat(2048)]) {
    assert.throws(() => normalizeActivityWebsite(invalid));
  }
  assert.throws(() => normalizeActivityFeatureInput({ action: 'create', name: 'Bad', category: 'cycling', featureType: 'trail', isDraft: true, season: 'autumn' }));
});

test('centerlines preserve the input and run inside straight and bent corridors', () => {
  const before = structuredClone(rectangle);
  const line = polygonCenterline(rectangle);
  assert.deepEqual(rectangle, before);
  assert.equal(line.type, 'LineString'); assert.equal(line.coordinates.length, 2);
  assert.ok(line.coordinates.every((point) => Math.abs(point[0] - 9.49305) < 1e-8));
  assert.ok(centerlineIsInside(rectangle, line));
  const bent = { type: 'Polygon', coordinates: [[[9.49,60.47],[9.494,60.47],[9.494,60.474],[9.4938,60.474],
    [9.4938,60.4702],[9.49,60.4702],[9.49,60.47]]] };
  assert.ok(centerlineIsInside(bent, polygonCenterline(bent)));
  assert.equal(centerlineIsInside(bent, { type: 'LineString', coordinates: [[9.49,60.4701],[9.4939,60.474]] }), false);
  assert.throws(() => polygonCenterline({ ...rectangle, coordinates: [...rectangle.coordinates, rectangle.coordinates[0]] }));
});

test('activity import updates exact matches, preserves protected fields, backs up and is idempotent', async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
    await db.exec(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));
    for (const [i,name] of ['Pupmtrack','Flytsti','Ferdighetspark','Robåt'].entries()) {
      await db.query(`INSERT INTO activity_map_features (id,name,category,feature_type,geometry,is_draft)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6)`, [String(i+1).repeat(32),name,i===3?'hiking':'cycling',i===3?'route':'trail',i===3?null:JSON.stringify(rectangle),i===3]);
    }
    await db.query(`UPDATE activity_map_features SET geometry=$1::jsonb,is_draft=FALSE WHERE name='Slåtteliløypa'`, [JSON.stringify(rectangle)]);
    const state = await readActivityImportState(db);
    const plan = buildActivityImportPlan(source, state);
    assert.equal(plan.summary.created, 1); assert.equal(plan.summary.workbookUpdated, 4);
    assert.deepEqual(plan.summary.converted.sort(), ['Flytsti Slåttelia','Slåtteliløypa']);
    assert.throws(() => buildActivityImportPlan({ ...source, rows: [...source.rows, source.rows[0]] }, state));
    assert.throws(() => buildActivityImportPlan(source, { ...state, features: [...state.features, { ...state.features.find(r=>r.name==='Pupmtrack'),id:'f'.repeat(32),name:'Pumptrack' }] }));
    await assert.rejects(applyActivityImport(db, source, { expectedHash: 'bad', snapshotId: 'test', actor: 'test@example.test' }));
    assert.deepEqual(await readActivityImportState(db), state);
    // A late failure must roll back the backup, catalog changes and geometry too.
    await db.exec(`CREATE FUNCTION fail_activity_import() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='Kafeen' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER test_import_fail BEFORE INSERT ON activity_map_features FOR EACH ROW EXECUTE FUNCTION fail_activity_import();`);
    const options = { expectedHash: plan.hash, snapshotId: 'test', actor: 'test@example.test' };
    await assert.rejects(applyActivityImport(db, source, options));
    assert.deepEqual(await readActivityImportState(db), state);
    assert.equal((await db.query('SELECT count(*)::int n FROM activity_map_import_runs')).rows[0].n, 0);
    await db.exec('DROP TRIGGER test_import_fail ON activity_map_features');
    const result = await applyActivityImport(db, source, options);
    assert.equal(result.alreadyImported, false);
    const after = await readActivityImportState(db);
    const byName = (name) => after.features.find((r) => r.name === name);
    assert.equal(byName('Slåtteliløypa').geometry.type, 'LineString');
    assert.equal(byName('Slåtteliløypa').activity_number, '1');
    assert.equal(byName('Slåtteliløypa').alpine_color, 'blue');
    assert.equal(byName('Slåtteliløypa').season, 'winter');
    assert.equal(byName('Flytsti Slåttelia').geometry.type, 'LineString');
    assert.equal(byName('Flytsti Slåttelia').website_url, 'https://example.test/sti');
    assert.deepEqual(byName('Ferdighetspark').geometry, rectangle);
    assert.deepEqual(byName('Pumptrack').geometry, rectangle);
    assert.equal(byName('Øvre Vesleåtjern').id, '4'.repeat(32));
    assert.equal(byName('Øvre Vesleåtjern').category, 'activity');
    assert.equal(byName('Kafeen').is_draft, true); assert.equal(byName('Kafeen').geometry, null);
    const backup = (await db.query('SELECT features_before FROM activity_map_import_runs')).rows[0].features_before;
    assert.deepEqual(JSON.parse(JSON.stringify(state.features)), backup);
    assert.equal((await applyActivityImport(db, source, options)).alreadyImported, true);
    assert.deepEqual(await readActivityImportState(db), after);
    await assert.rejects(db.query("UPDATE activity_map_types SET geometry_kind='polygon' WHERE category='alpine' AND id='trail'"));
    await assert.rejects(db.query("UPDATE activity_map_features SET season='autumn' WHERE name='Kafeen'"));
    await assert.rejects(db.query("UPDATE activity_map_features SET website_url='javascript:alert(1)' WHERE name='Kafeen'"));
    await db.exec(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));
    assert.deepEqual(await readActivityImportState(db), after, 'Schema reruns must not undo imported geometry or metadata');
  } finally { await db.close(); }
});
