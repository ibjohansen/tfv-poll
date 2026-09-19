import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapWorkflowState, MAP_PHASES, MAP_TASKS, mapWorkflowReducer } from '../lib/map/workflow.js';

const area = { polygon: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } }, areaM2: 1000 };

test('map workflow exposes only valid area, fetch and review transitions', () => {
  let state = createMapWorkflowState();
  state = mapWorkflowReducer(state, { type: 'fetch-started', requestId: 1, busy: 'comparison' });
  assert.equal(state.phase, MAP_PHASES.IDLE, 'fetching cannot start without a finished area');
  state = mapWorkflowReducer(state, { type: 'area-edit-started', mode: 'drawing' });
  assert.equal(state.phase, MAP_PHASES.SELECTING_AREA);
  state = mapWorkflowReducer(state, { type: 'area-ready', area, hamlet: { id: '4', name: 'Testgrend' } });
  assert.equal(state.phase, MAP_PHASES.AREA_READY);
  state = mapWorkflowReducer(state, { type: 'fetch-started', requestId: 2, busy: 'comparison' });
  assert.equal(state.phase, MAP_PHASES.FETCHING);
  assert.equal(mapWorkflowReducer(state, { type: 'area-edit-started', mode: 'editing' }), state,
    'area editing cannot start during a fetch');
  state = mapWorkflowReducer(state, { type: 'fetch-succeeded', requestId: 2, data: { addresses: {}, properties: {}, roads: null, comparison: { rows: [] } } });
  assert.equal(state.phase, MAP_PHASES.RESULTS_READY);
  state = mapWorkflowReducer(state, { type: 'review-started' });
  assert.equal(state.phase, MAP_PHASES.REVIEWING);
});

test('task changes preserve unfinished work and stale responses cannot replace current results', () => {
  let state = mapWorkflowReducer(createMapWorkflowState(), { type: 'area-ready', area });
  state = mapWorkflowReducer(state, { type: 'task-changed', task: MAP_TASKS.HAMLETS });
  assert.equal(state.area, area);
  state = mapWorkflowReducer(state, { type: 'fetch-started', requestId: 7, busy: 'comparison' });
  const stale = mapWorkflowReducer(state, { type: 'fetch-succeeded', requestId: 6, data: { comparison: { rows: ['stale'] } } });
  assert.equal(stale, state);
  state = mapWorkflowReducer(state, { type: 'fetch-failed', requestId: 7, error: 'feil', retry: 'comparison' });
  assert.equal(state.phase, MAP_PHASES.ERROR);
  assert.equal(state.retry, 'comparison');
});

test('opening member details keeps one review surface active', () => {
  let state = { ...createMapWorkflowState(), area, data: { addresses: {}, properties: {}, roads: null, comparison: { rows: [] } } };
  state = mapWorkflowReducer(state, { type: 'object-selected', selected: { id: 'row-1' } });
  state = mapWorkflowReducer(state, { type: 'member-opened', memberId: '42' });
  assert.equal(state.selected.id, 'row-1');
  assert.equal(state.selectedMemberId, '42');
  assert.equal(state.phase, MAP_PHASES.REVIEWING);
  state = mapWorkflowReducer(state, { type: 'member-closed' });
  assert.equal(state.selectedMemberId, null);
  assert.equal(state.selected.id, 'row-1');
});
