import test from 'node:test';
import assert from 'node:assert/strict';
import { area, featureCollection, intersect } from '@turf/turf';
import catalog from '../data/map-hamlet-drafts.json' with { type: 'json' };
import { HAMLET_DRAFT_OPTIONS, prepareHamletDraft } from '../lib/map/hamlet-drafts.js';
import { validatePolygon } from '../lib/map/geo.js';
import { normalizeHamletInput } from '../lib/map/hamlets.js';

test('eleven named red regions produce valid nearby editable drafts, never reviewed borders', () => {
  assert.deepEqual(HAMLET_DRAFT_OPTIONS.map((d) => d.name), [
    'Slåttelia', 'Slåtta Vest', 'Slåtta Øst', 'Turuhaugen', 'Sprenåsen', 'Istjern',
    'Molteputten', 'Nedre Kristnatten', 'Turusvingen', 'Veslesetra', 'Høgsetra',
  ]);
  assert.equal(new Set(HAMLET_DRAFT_OPTIONS.map((d) => d.id)).size, 11);
  for (const option of HAMLET_DRAFT_OPTIONS) {
    const { current, draft } = prepareHamletDraft(option.id);
    assert.equal(current, null); assert.equal(draft.reviewed, false); assert.equal(draft.imageDraft, true);
    assert.match(draft.source, /omtrentlig utkast/);
    const { bbox, areaM2 } = validatePolygon(draft.polygon);
    assert.ok(areaM2 > 1000 && areaM2 < 500000);
    assert.ok(bbox[0] > 9.47 && bbox[2] < 9.515 && bbox[1] > 60.457 && bbox[3] < 60.479);
    const input = normalizeHamletInput({ action: 'create', ...draft });
    assert.equal(input.name, draft.name); assert.equal(input.reviewed, false);
    assert.equal(draft.polygon.properties.referencePixels, undefined);
  }
  // Shared edges are allowed; two named regions must not overlap in area.
  for (let i = 0; i < catalog.features.length; i++) for (let j = i + 1; j < catalog.features.length; j++) {
    const overlap = intersect(featureCollection([catalog.features[i], catalog.features[j]]));
    assert.ok(!overlap || area(overlap) < 1, `${catalog.features[i].properties.name} overlaps ${catalog.features[j].properties.name}`);
  }
});

test('editing a draft never mutates the reference catalog or another draft', () => {
  const id = HAMLET_DRAFT_OPTIONS[0].id;
  const original = JSON.stringify(catalog);
  const a = prepareHamletDraft(id).draft;
  const b = prepareHamletDraft(id).draft;
  a.polygon.geometry.coordinates[0][0][0] += .0001;
  a.name = 'Edited'; a.reviewed = true;
  assert.notDeepEqual(a.polygon, b.polygon);
  assert.equal(JSON.stringify(catalog), original);
  assert.equal(prepareHamletDraft(id).draft.reviewed, false);
});

test('a named grend without geometry retains its identity, spelling and concurrency version', () => {
  const current = { id: '42', name: ' slåtta ØST ', version: 7, polygon: null, reviewed: false };
  const result = prepareHamletDraft('image-draft:slatta-ost', [current]);
  assert.equal(result.current, current); assert.equal(result.current.version, 7);
  assert.equal(result.draft.name, current.name); assert.equal(current.polygon, null);
  assert.ok(result.draft.polygon); assert.equal(result.draft.reviewed, false);
});

test('unknown, ambiguous and already mapped grends cannot replace saved boundaries', () => {
  assert.throws(() => prepareHamletDraft('unknown'), /gyldig kartutkast/);
  const id = HAMLET_DRAFT_OPTIONS[0].id;
  const draft = prepareHamletDraft(id).draft;
  for (const reviewed of [true, false]) {
    assert.throws(() => prepareHamletDraft(id, [{ ...draft, reviewed }]), /allerede et lagret polygon/);
  }
  assert.throws(() => prepareHamletDraft(id, [{ name: draft.name }, { name: draft.name.toLowerCase() }]), /Flere grender/);
});
