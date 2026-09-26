export const MAP_TASKS = Object.freeze({ REGISTER: 'register', HAMLETS: 'hamlets' });
export const MAP_PHASES = Object.freeze({
  IDLE: 'idle', SELECTING_AREA: 'selecting-area', AREA_READY: 'area-ready',
  FETCHING: 'fetching', RESULTS_READY: 'results-ready', REVIEWING: 'reviewing', ERROR: 'error',
});

export const emptyMapData = () => ({ addresses: null, roads: null, properties: null, comparison: null });

export function createMapWorkflowState() {
  return {
    task: MAP_TASKS.REGISTER, phase: MAP_PHASES.IDLE, areaSource: 'saved', area: null,
    activeHamlet: null, editMode: null, data: emptyMapData(), selected: null,
    selectedMemberId: null, busy: '', error: '', notice: '', retry: null, requestId: 0,
  };
}

function settledPhase(state) {
  if (state.data.comparison || state.data.addresses || state.data.properties || state.data.roads) return MAP_PHASES.RESULTS_READY;
  return state.area ? MAP_PHASES.AREA_READY : MAP_PHASES.IDLE;
}

export function mapWorkflowReducer(state, action) {
  switch (action.type) {
    case 'task-changed':
      return { ...state, task: action.task, selected: null, selectedMemberId: null, error: '', notice: '' };
    case 'area-source-changed':
      return { ...state, areaSource: action.source };
    case 'area-edit-started':
      if (state.phase === MAP_PHASES.FETCHING) return state;
      return { ...state, phase: MAP_PHASES.SELECTING_AREA, editMode: action.mode, error: '', notice: '', retry: null };
    case 'area-invalidated':
      return { ...state, phase: MAP_PHASES.SELECTING_AREA, area: null, activeHamlet: action.keepHamlet ? state.activeHamlet : null,
        data: emptyMapData(), selected: null, selectedMemberId: null, busy: '', error: '', notice: '', retry: null };
    case 'area-ready':
      return { ...state, phase: MAP_PHASES.AREA_READY, area: action.area, activeHamlet: action.hamlet ?? state.activeHamlet,
        editMode: null, data: action.keepData ? state.data : emptyMapData(), selected: null, selectedMemberId: null,
        busy: '', error: '', notice: '', retry: null };
    case 'area-cleared':
      return { ...state, phase: MAP_PHASES.IDLE, area: null, activeHamlet: null, editMode: null,
        data: emptyMapData(), selected: null, selectedMemberId: null, busy: '', error: '', notice: '', retry: null };
    case 'fetch-started':
      if (!state.area || state.editMode) return state;
      return { ...state, phase: MAP_PHASES.FETCHING, requestId: action.requestId, busy: action.busy,
        error: '', notice: action.notice || '', retry: null, selected: null, selectedMemberId: null };
    case 'fetch-succeeded':
      if (action.requestId !== state.requestId) return state;
      return { ...state, phase: MAP_PHASES.RESULTS_READY, data: action.data, busy: '', error: '',
        notice: action.notice || '', retry: action.retry || null };
    case 'fetch-failed':
      if (action.requestId !== state.requestId) return state;
      return { ...state, phase: MAP_PHASES.ERROR, busy: '', error: action.error, notice: '', retry: action.retry || null };
    case 'fetch-cancelled':
      if (action.requestId !== state.requestId) return state;
      return { ...state, phase: settledPhase(state), busy: '', error: '', notice: action.notice, retry: action.retry || null };
    case 'review-started':
      if (!state.data.comparison) return state;
      return { ...state, phase: MAP_PHASES.REVIEWING };
    case 'object-selected':
      return { ...state, phase: state.data.comparison ? MAP_PHASES.REVIEWING : settledPhase(state),
        selected: action.selected, selectedMemberId: null };
    case 'object-closed':
      return { ...state, phase: settledPhase(state), selected: null };
    case 'member-opened':
      return { ...state, phase: MAP_PHASES.REVIEWING, selectedMemberId: action.memberId };
    case 'member-closed':
      return { ...state, phase: state.data.comparison ? MAP_PHASES.REVIEWING : settledPhase(state), selectedMemberId: null };
    case 'notice-set':
      return { ...state, notice: action.notice, error: '' };
    case 'error-set':
      return { ...state, phase: MAP_PHASES.ERROR, error: action.error };
    default:
      return state;
  }
}
