// Explicitly mapped import of the approved activity workbook. No fuzzy matching,
// publication of unplaced activities, mail, deployments or destructive deletes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizeActivityFeatureInput } from '../lib/activity-map.js';
import { polygonCenterline } from './activity-centerline.mjs';

export const workbookHeaders = ['Navn', 'Kategori', 'Kartmerking', 'Sesong', 'Kort tekst i kartmarkør', 'Webside', 'Ferdighetsnivå/Farge', 'Nummer eller annen merkning'];
const categoryDefinitions = {
  Utsalg: { id: 'retail', name: 'Utsalg', color: '#805c2f' },
  Aktivitet: { id: 'activity', name: 'Aktivitet', color: '#73559b' },
  Trening: { id: 'training', name: 'Trening', color: '#326981' },
  Sykkel: { id: 'cycling', name: 'Sykkel', color: '#16745a' },
};
const geometryNames = { Punkt: 'point', Polygon: 'polygon', Linje: 'line' };
const seasons = { Sommer: 'summer', Vinter: 'winter', Helårs: 'all_year' };
const aliases = { Pumptrack: 'Pupmtrack', 'Flytsti Slåttelia': 'Flytsti', 'Øvre Vesleåtjern': 'Robåt' };
const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const sameName = (a, b) => normalize(a).toLocaleLowerCase('nb') === normalize(b).toLocaleLowerCase('nb');
export const importHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function buildActivityImportPlan(source, state) {
  assert.deepEqual(source.headers, workbookHeaders, 'Unexpected workbook columns');
  assert.match(source.sourceHash, /^[a-f0-9]{64}$/);
  assert.ok(source.rows.length > 0 && source.rows.length <= 200);
  const catalog = {
    categories: state.categories.map((row) => ({ ...row })),
    types: state.types.map((row) => ({ ...row, geometryKind: row.geometry_kind })),
    subtypes: (state.subtypes || []).map((row) => ({ ...row })),
  };
  const categoryCreates = [], typeCreates = [], typeChanges = [], featureChanges = [];
  const active = state.features.filter((row) => !row.deleted_at);
  const names = new Set();
  const ids = new Set();
  const converted = [];
  const ensureCategory = (name) => {
    const definition = categoryDefinitions[name];
    assert.ok(definition, `Unknown category: ${name}`);
    let category = catalog.categories.find((row) => sameName(row.name, name));
    if (!category) {
      assert.ok(!catalog.categories.some((row) => row.id === definition.id), `Category ID conflict: ${definition.id}`);
      category = { ...definition };
      catalog.categories.push(category); categoryCreates.push(category);
    }
    return category.id;
  };
  const ensureType = (category, kind) => {
    let type = catalog.types.find((row) => row.category === category && row.geometryKind === kind);
    if (!type) {
      const id = { point: 'point', polygon: 'area', line: 'route' }[kind];
      assert.ok(!catalog.types.some((row) => row.category === category && row.id === id), 'Type ID conflict');
      type = { id, category, name: { point: 'Sted', polygon: 'Område', line: category === 'cycling' ? 'Sykkelrute' : 'Rute' }[kind], geometryKind: kind };
      catalog.types.push(type); typeCreates.push(type);
    }
    return type.id;
  };
  for (const type of catalog.types.filter((row) => row.category === 'alpine' && row.geometryKind === 'polygon')) {
    typeChanges.push({ category: type.category, id: type.id, version: type.version });
    type.geometryKind = 'line';
  }
  for (const row of source.rows) {
    assert.equal(row.length, 8);
    const [name, categoryName, marking, seasonName, description, website, color, number] = row.map(normalize);
    assert.ok(name && !names.has(name.toLocaleLowerCase('nb')), `Duplicate or missing activity: ${name}`);
    names.add(name.toLocaleLowerCase('nb'));
    // No values were supplied for these columns. Fail rather than invent mapping.
    assert.ok(!color && !number, 'Nonblank colour/number requires an explicit mapping');
    assert.ok(seasons[seasonName], `Unknown season: ${seasonName}`);
    const matches = active.filter((item) => sameName(item.name, name) || (aliases[name] && sameName(item.name, aliases[name])));
    assert.ok(matches.length <= 1, `Ambiguous activity: ${name}`);
    const before = matches[0];
    if (before) { assert.ok(!ids.has(before.id), `Activity matched twice: ${name}`); ids.add(before.id); }
    const category = ensureCategory(categoryName);
    // User explicitly overrode the spreadsheet's line marking for this area.
    const kind = name === 'Ferdighetspark' ? 'polygon' : geometryNames[marking];
    assert.ok(kind, `Unknown geometry marking: ${marking}`);
    let geometry = before?.geometry || null;
    if (geometry && geometry.type === 'Polygon' && kind === 'line') {
      assert.equal(name, 'Flytsti Slåttelia', 'Only the approved cycling polygon may be converted');
      geometry = polygonCenterline(geometry); converted.push(name);
    }
    const featureType = before?.category === category && catalog.types.some((type) => type.category === category && type.id === before.feature_type && type.geometryKind === kind)
      ? before.feature_type : ensureType(category, kind);
    const input = { action: before ? 'update' : 'create', id: before?.id, version: before?.version,
      name, category, featureType, geometry, isDraft: before ? before.is_draft : true,
      activityNumber: before?.activity_number || null, featureSubtype: before?.feature_subtype || null, alpineColor: before?.alpine_color || null,
      tooltipText: description || null, season: seasons[seasonName], websiteUrl: website || null };
    const value = normalizeActivityFeatureInput(input, catalog);
    value.id = before?.id || importHash(['activity-workbook', category, name]).slice(0, 32);
    assert.ok(before || !state.features.some((item) => item.id === value.id), 'New activity ID already exists (possibly deleted)');
    featureChanges.push(value);
  }
  for (const before of state.features.filter((row) => row.category === 'alpine')) {
    assert.ok(!ids.has(before.id), 'Workbook overlaps alpine conversion');
    let geometry = before.geometry;
    if (geometry?.type === 'Polygon') { geometry = polygonCenterline(geometry); converted.push(before.name); }
    // Include drafts to give all alpine activities the appropriate season.
    if (!before.deleted_at) featureChanges.push(normalizeActivityFeatureInput({ action: 'update', id: before.id, version: before.version,
      name: before.name, category: before.category, featureType: before.feature_type, geometry, isDraft: before.is_draft,
      activityNumber: before.activity_number, featureSubtype: before.feature_subtype, alpineColor: before.alpine_color, tooltipText: before.tooltip_text,
      season: before.season || 'winter', websiteUrl: before.website_url }, catalog));
    else assert.notEqual(before.geometry?.type, 'Polygon', 'Deleted alpine polygons require explicit recovery handling');
  }
  const summary = { workbookRows: source.rows.length, created: featureChanges.filter((row) => row.action === 'create').length,
    workbookUpdated: source.rows.length - featureChanges.filter((row) => row.action === 'create').length,
    converted, categoriesCreated: categoryCreates.map((row) => row.name),
    draftsWithoutGeometry: featureChanges.filter((row) => row.isDraft && !row.geometry).map((row) => row.name) };
  // Include the complete source and current state: applying a reviewed plan fails
  // if the workbook, metadata, publication state, catalog or geometry has changed.
  const hash = importHash({ source, state, categoryCreates, typeCreates, typeChanges, featureChanges });
  return { hash, categoryCreates, typeCreates, typeChanges, featureChanges, summary };
}

export async function readActivityImportState(db) {
  return {
    features: (await db.query('SELECT * FROM activity_map_features ORDER BY id')).rows,
    categories: (await db.query('SELECT * FROM activity_map_categories ORDER BY id')).rows,
    types: (await db.query('SELECT * FROM activity_map_types ORDER BY category, id')).rows,
    subtypes: (await db.query('SELECT * FROM activity_map_subtypes ORDER BY category, feature_type, id')).rows,
  };
}

export async function applyActivityImport(db, source, { expectedHash, snapshotId, actor }) {
  assert.ok(snapshotId && actor && expectedHash, 'Snapshot, actor and reviewed plan required');
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query("SET LOCAL statement_timeout='60s'");
    await db.query('SELECT pg_advisory_xact_lock(62719, 0)');
    await db.query('LOCK TABLE activity_map_features, activity_map_categories, activity_map_types, activity_map_subtypes, activity_map_import_runs IN SHARE ROW EXCLUSIVE MODE');
    const previous = (await db.query('SELECT summary FROM activity_map_import_runs WHERE source_sha256=$1', [source.sourceHash])).rows[0];
    if (previous) { await db.query('COMMIT'); return { alreadyImported: true, ...previous.summary }; }
    const before = await readActivityImportState(db);
    const plan = buildActivityImportPlan(source, before);
    assert.equal(plan.hash, expectedHash, 'The reviewed import plan is stale; review again before applying');
    await db.query(`INSERT INTO activity_map_import_runs
      (source_sha256,source_file,plan_sha256,snapshot_id,created_by,features_before,categories_before,types_before,summary)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb)`,
    [source.sourceHash, source.sourceFile, plan.hash, snapshotId, actor, JSON.stringify(before.features), JSON.stringify(before.categories), JSON.stringify(before.types), JSON.stringify(plan.summary)]);
    for (const row of plan.categoryCreates) await db.query('INSERT INTO activity_map_categories (id,name,color,last_changed_by) VALUES ($1,$2,$3,$4)', [row.id,row.name,row.color,actor]);
    for (const row of plan.typeCreates) await db.query('INSERT INTO activity_map_types (category,id,name,geometry_kind,last_changed_by) VALUES ($1,$2,$3,$4,$5)', [row.category,row.id,row.name,row.geometryKind,actor]);
    // This is a locked, one-off data conversion. Normal admin edits still cannot
    // change a type's geometry. Both trigger state and data roll back on failure.
    await db.query('ALTER TABLE activity_map_types DISABLE TRIGGER activity_map_types_geometry_trigger');
    for (const row of plan.typeChanges) {
      const result = await db.query("UPDATE activity_map_types SET geometry_kind='line', last_changed_by=$1 WHERE category=$2 AND id=$3 AND version=$4 RETURNING id", [actor,row.category,row.id,row.version]);
      assert.equal(result.rows.length, 1);
    }
    await db.query('ALTER TABLE activity_map_types ENABLE TRIGGER activity_map_types_geometry_trigger');
    for (const row of plan.featureChanges) {
      const values = [row.name,row.category,row.featureType,row.featureSubtype,row.activityNumber,row.alpineColor,row.tooltipText,row.season,row.websiteUrl,
        row.geometry ? JSON.stringify(row.geometry) : null,row.isDraft,actor,row.id];
      if (row.action === 'create') await db.query(`INSERT INTO activity_map_features
        (name,category,feature_type,feature_subtype,activity_number,alpine_color,tooltip_text,season,website_url,geometry,is_draft,last_changed_by,id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`, values);
      else {
        const result = await db.query(`UPDATE activity_map_features SET name=$1,category=$2,feature_type=$3,feature_subtype=$4,activity_number=$5,alpine_color=$6,
          tooltip_text=$7,season=$8,website_url=$9,geometry=$10::jsonb,is_draft=$11,last_changed_by=$12 WHERE id=$13 AND version=$14 AND deleted_at IS NULL RETURNING id`, [...values,row.version]);
        assert.equal(result.rows.length, 1, 'Activity changed while importing');
      }
    }
    const after = await readActivityImportState(db);
    assert.equal(after.features.length, before.features.length + plan.summary.created);
    for (const original of before.features) {
      const updated = after.features.find((row) => row.id === original.id);
      assert.ok(updated);
      assert.equal(updated.is_draft, original.is_draft, 'Publication state changed');
      assert.equal(updated.activity_number, original.activity_number, 'Activity number changed');
      assert.equal(updated.alpine_color, original.alpine_color, 'Alpine colour changed');
      if (!plan.featureChanges.some((row) => row.id === original.id)) assert.deepEqual(updated, original, 'Unrelated activity changed');
      if (['Ferdighetspark','Pupmtrack','Pumptrack'].includes(original.name)) assert.deepEqual(updated.geometry, original.geometry, 'Protected polygon changed');
    }
    for (const expected of plan.featureChanges) {
      const actual = after.features.find((row) => row.id === expected.id);
      for (const [field, column] of Object.entries({ name: 'name', category: 'category', featureType: 'feature_type', featureSubtype: 'feature_subtype', tooltipText: 'tooltip_text', season: 'season', websiteUrl: 'website_url', geometry: 'geometry', isDraft: 'is_draft' })) {
        assert.deepEqual(actual[column], expected[field], `Imported ${column} does not match the plan`);
      }
    }
    const invalid = (await db.query(`SELECT f.id FROM activity_map_features f JOIN activity_map_types t ON (t.category=f.category AND t.id=f.feature_type)
      WHERE NULLIF(f.geometry,'null'::jsonb) IS NOT NULL AND f.geometry->>'type' IS DISTINCT FROM
      CASE t.geometry_kind WHEN 'polygon' THEN 'Polygon' WHEN 'line' THEN 'LineString' ELSE 'Point' END`)).rows;
    assert.equal(invalid.length, 0);
    await db.query('COMMIT');
    return { alreadyImported: false, ...plan.summary };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
