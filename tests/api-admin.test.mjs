import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, plain, request, routeContext } from './helpers/load-module.mjs';

// This inventory exercises every application-owned admin handler. Service
// errors model the boundary; domain validation and permissions have own tests.
const cases = [
  ['members', 'GET', 'admin-members', 'getAdminMembers', 200],
  ['members', 'POST', 'admin-member-updates', 'createAdminMember', 201],
  ['members/[id]', 'GET', 'admin-members', 'getAdminMemberById', 200],
  ['members/[id]', 'PATCH', 'admin-member-updates', 'updateAdminMember', 200],
  ['members/[id]', 'DELETE', 'admin-member-updates', 'deleteAdminMember', 200],
  ['members/export', 'POST', 'member-export', 'createMemberExport', 200, { binary: true }],
  ['member-requests/[id]', 'PATCH', 'member-self-service', 'resolveAdminMemberRequest', 200, { body: { action: 'approve' }, unauthorized: 403 }],
  ['member-requests/[id]', 'PATCH', 'member-self-service', 'updateAdminMemberRequestProperty', 200, { body: { action: 'check_property' }, unauthorized: 403 }],
  ['surveys', 'GET', 'admin-surveys', 'getAdminSurveys', 200],
  ['surveys', 'POST', 'admin-surveys', 'createAdminSurvey', 201],
  ['surveys/[id]', 'PATCH', 'admin-surveys', 'updateAdminSurvey', 200],
  ['surveys/[id]', 'DELETE', 'admin-surveys', 'deleteAdminSurvey', 200],
  ['surveys/[id]/results', 'GET', 'admin-survey-results', 'getAdminSurveyResults', 200],
  ['surveys/[id]/results/export', 'GET', 'admin-survey-results', 'createAdminSurveyResultsExport', 200, { binary: true }],
  ['surveys/[id]/email', 'GET', 'survey-email', 'getSurveyEmailOverview', 200, { unauthorized: 403 }],
  ['surveys/[id]/email', 'POST', 'survey-email', 'sendSurveyTestEmail', 200, { body: { action: 'test', recipient: 'test@example.test' }, unauthorized: 403 }],
  ['surveys/[id]/email', 'POST', 'survey-email', 'createSurveyEmailCampaign', 201, { body: { action: 'send', groupId: '71' }, unauthorized: 403 }],
  ['surveys/[id]/attachments', 'POST', 'survey-files', 'uploadAdminSurveyAttachment', 201, { file: true }],
  ['surveys/[id]/attachments/[attachmentId]', 'PATCH', 'survey-files', 'updateAdminSurveyAttachment', 200],
  ['surveys/[id]/attachments/[attachmentId]', 'DELETE', 'survey-files', 'deleteAdminSurveyAttachment', 200],
  ['cms/pages', 'GET', 'cms-pages', 'getAdminCmsPages', 200],
  ['cms/pages', 'POST', 'cms-pages', 'createAdminCmsPage', 201],
  ['cms/pages/[id]', 'GET', 'cms-pages', 'getAdminCmsPage', 200],
  ['cms/pages/[id]', 'PATCH', 'cms-pages', 'updateAdminCmsPage', 200],
  ['cms/pages/[id]', 'DELETE', 'cms-pages', 'deleteAdminCmsPage', 200],
  ['cms/pages/[id]/status', 'PATCH', 'cms-pages', 'setAdminCmsPageStatus', 200],
  ['cms/pages/[id]/image', 'POST', 'cms-files', 'uploadAdminCmsFile', 201, { file: true }],
  ['cms/pages/[id]/image', 'DELETE', 'cms-files', 'deleteAdminCmsFile', 200],
  ['cms/pages/[id]/attachments', 'POST', 'cms-files', 'uploadAdminCmsFile', 201, { file: true }],
  ['cms/pages/[id]/attachments', 'PATCH', 'cms-files', 'reorderAdminCmsAttachments', 200],
  ['cms/pages/[id]/attachments/[attachmentId]', 'PATCH', 'cms-files', 'updateAdminCmsAttachment', 200],
  ['cms/pages/[id]/attachments/[attachmentId]', 'DELETE', 'cms-files', 'deleteAdminCmsFile', 200],
  ['matrikkel/runs', 'GET', 'matrikkel-sync', 'getMatrikkelRuns', 200, { unauthorized: 403 }],
  ['matrikkel/runs', 'POST', 'matrikkel-sync', 'createMatrikkelRun', 201, { unauthorized: 403 }],
  ['matrikkel/runs/[id]', 'DELETE', 'matrikkel-sync', 'deleteMatrikkelRunLog', 200, { unauthorized: 403 }],
  ['matrikkel/runs/[id]', 'DELETE', 'matrikkel-sync', 'cancelMatrikkelRun', 200, { query: '?action=cancel', unauthorized: 403 }],
  ['matrikkel/runs/[id]/process', 'POST', 'matrikkel-sync', 'processMatrikkelRun', 200, { unauthorized: 403 }],
  ['matrikkel/runs/[id]/items/[memberId]/approve', 'POST', 'matrikkel-sync', 'approveMatrikkelItem', 200, { unauthorized: 403 }],
];
const exportsByModule = {
  'admin-members': ['getAdminMembers', 'getAdminMemberById'],
  'admin-member-updates': ['createAdminMember', 'updateAdminMember', 'deleteAdminMember'],
  'member-export': ['createMemberExport'],
  'member-self-service': ['resolveAdminMemberRequest', 'updateAdminMemberRequestProperty'],
  'admin-surveys': ['getAdminSurveys', 'createAdminSurvey', 'copyAdminSurvey', 'updateAdminSurvey', 'deleteAdminSurvey'],
  'admin-survey-results': ['getAdminSurveyResults', 'createAdminSurveyResultsExport'],
  'survey-email': ['getSurveyEmailOverview', 'findSurveyRecipientProperties', 'sendSurveyTestEmail', 'createSurveyEmailCampaign', 'failPendingSurveyEmailCampaign'],
  'survey-files': ['uploadAdminSurveyAttachment', 'updateAdminSurveyAttachment', 'deleteAdminSurveyAttachment'],
  'cms-pages': ['getAdminCmsPages', 'createAdminCmsPage', 'copyAdminCmsPage', 'getAdminCmsPage', 'updateAdminCmsPage', 'deleteAdminCmsPage', 'setAdminCmsPageStatus'],
  'cms-files': ['uploadAdminCmsFile', 'deleteAdminCmsFile', 'reorderAdminCmsAttachments', 'updateAdminCmsAttachment'],
  'matrikkel-sync': ['getMatrikkelRuns', 'getMatrikkelRun', 'getMatrikkelMemberOptions', 'createMatrikkelRun', 'failPendingMatrikkelRun', 'deleteMatrikkelRunLog', 'cancelMatrikkelRun', 'processMatrikkelRun', 'approveMatrikkelItem'],
};

async function setup(path, overrides = {}) {
  const calls = [];
  const state = { error: null, limited: false, value: { id: 'a'.repeat(32), marker: 'synthetic-result', buffer: Buffer.from('test workbook'), campaign: { id: 'a'.repeat(32) } } };
  const dependencies = Object.fromEntries(Object.entries(exportsByModule).map(([module, names]) => [
    `@/lib/${module}`, Object.fromEntries(names.map((name) => [name, async (...args) => {
      calls.push({ name, args });
      if (state.error) throw state.error;
      return state.value;
    }])),
  ]));
  dependencies['@/lib/rate-limit'] = { isEmailRateLimited: () => state.limited };
  dependencies['@/lib/matrikkel-background'] = { dispatchMatrikkelRun: async () => { throw new Error('Unexpected background dispatch'); } };
  dependencies['@/lib/survey-email-background'] = {
    dispatchSurveyEmailCampaign: async () => { throw new Error('Unexpected background dispatch'); },
    requireSurveyEmailBackgroundConfigured: () => {},
  };
  dependencies['@/lib/admin-access'] = { requireMatrikkelSync: async () => {
    if (state.error?.message === 'Unauthorized') throw state.error;
  } };
  return { route: await loadModule(`app/api/admin/${path}/route.js`, { ...dependencies, ...overrides }), state, calls };
}

function makeRequest(path, method, options = {}, extra = {}) {
  if (options.file) {
    const form = new FormData();
    form.set('file', new File(['test'], 'test.png', { type: 'image/png' }));
    return request(`/api/admin/${path}`, { method, rawBody: form, ...extra });
  }
  return request(`/api/admin/${path}${options.query || ''}`, {
    method, ...(method === 'GET' ? {} : { body: options.body || { title: 'Test', status: 'draft', ids: [], imageId: 'b'.repeat(32) } }), ...extra,
  });
}

for (const [path, method, module, operation, status, options = {}] of cases) {
  test(`${method} /api/admin/${path} (${operation}): success, permissions and safe failures`, async () => {
    const { route, state, calls } = await setup(path);
    const response = await route[method](makeRequest(path, method, options), routeContext());
    assert.equal(response.status, status);
    assert.equal(calls.at(-1).name, operation, `Expected ${module} service`);
    assert.match(response.headers.get('cache-control'), /no-store/);
    if (options.binary) {
      assert.match(response.headers.get('content-disposition'), /attachment;.*\.xlsx/);
      assert.equal(await response.text(), 'test workbook');
    } else if (!['deleteAdminMember', 'deleteAdminSurvey', 'deleteAdminSurveyAttachment', 'deleteAdminCmsPage', 'deleteAdminCmsFile', 'reorderAdminCmsAttachments'].includes(operation)) {
      assert.match(await response.text(), /synthetic-result/);
    }
    if (path.includes('[id]')) assert.equal(calls.at(-1).args[0], 'a'.repeat(32));

    for (const [message, expected] of [['Unauthorized', options.unauthorized || 401], ['Forbidden', 403]]) {
      state.error = new Error(message);
      const denied = await route[method](makeRequest(path, method, options), routeContext());
      assert.equal(denied.status, expected, message);
      assert.doesNotMatch(await denied.text(), /synthetic-result|test workbook/);
    }
    state.error = Object.assign(new Error('postgres://secret-user:secret-password@private-host/db'), { code: '08006' });
    const failed = await route[method](makeRequest(path, method, options), routeContext());
    assert.equal(failed.status, 500, 'Unexpected database failures are server errors');
    assert.doesNotMatch(await failed.text(), /secret-user|secret-password|private-host|08006/);
  });
}

test('member search normalizes pagination and preserves combined filters', async () => {
  const { route, calls } = await setup('members');
  await route.GET(request('/api/admin/members?q=%20Test%20&page=NaN&dir=desc&contact=incomplete&comment=present'));
  assert.deepEqual(plain(calls[0].args), ['Test', 1, 'h_number', 'desc', true, true, { membershipStatus: '', hamletId: '', groupId: '', turufjellAsSharing: '' }]);
});

test('matrikkel start forwards an exact member selection', async () => {
  const { route, calls } = await setup('matrikkel/runs');
  await route.POST(request('/api/admin/matrikkel/runs', { method: 'POST', body: { memberId: '427', hNumber: null } }));
  assert.deepEqual(plain(calls.find((call) => call.name === 'createMatrikkelRun').args), [{ hNumber: null, memberId: '427' }]);
});

test('matrikkel start forwards a selected member batch', async () => {
  const { route, calls } = await setup('matrikkel/runs');
  await route.POST(request('/api/admin/matrikkel/runs', { method: 'POST', body: { memberIds: ['427', '428'] } }));
  assert.deepEqual(plain(calls.find((call) => call.name === 'createMatrikkelRun').args), [{ memberIds: ['427', '428'] }]);
});

test('admin write handlers with origin protection reject cross-site requests before mutation', async () => {
  for (const [path, method, , , , options = {}] of cases.filter(([path, method]) => method !== 'GET' && !['members', 'members/[id]', 'surveys', 'surveys/[id]'].includes(path))) {
    const { route, calls } = await setup(path);
    const response = await route[method](makeRequest(path, method, options, { headers: { origin: 'https://evil.test' } }), routeContext());
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.equal(calls.length, 0, path);
  }
});

test('file upload size limits reject before reading form or uploading', async () => {
  for (const path of ['cms/pages/[id]/image', 'cms/pages/[id]/attachments', 'surveys/[id]/attachments']) {
    const { route, calls } = await setup(path);
    const response = await route.POST(request('/api/admin/upload', { method: 'POST', headers: { 'content-length': String(22 * 1024 * 1024) } }), routeContext());
    assert.equal(response.status, 413);
    assert.equal(calls.length, 0);
  }
});

test('email actions require a valid action and respect rate limits', async () => {
  const { route, state, calls } = await setup('surveys/[id]/email');
  for (const body of [{}, { action: 'invalid' }]) assert.equal((await route.POST(request('/api/admin/email', { method: 'POST', body }), routeContext())).status, 400);
  state.limited = true;
  assert.equal((await route.POST(request('/api/admin/email', { method: 'POST', body: { action: 'send' } }), routeContext())).status, 429);
  assert.equal(calls.length, 0);
});

test('survey mailing forwards the selected email group to preview and campaign creation', async () => {
  const { route, calls } = await setup('surveys/[id]/email');
  await route.GET(request('/api/admin/surveys/test/email?page=2&groupId=71'), routeContext());
  assert.deepEqual(plain(calls.at(-1).args), ['a'.repeat(32), '2', '71', { includeOtherEmails: false, memberIds: [] }]);
  await route.POST(request('/api/admin/surveys/test/email', {
    method: 'POST', body: { action: 'send', groupId: '71' },
  }), routeContext());
  assert.deepEqual(plain(calls.at(-1).args), ['a'.repeat(32), { replaceCompleted: false, appendRecipients: false, groupId: '71' }]);
});

test('survey recipient search uses the protected survey service without returning full member records', async () => {
  const { route, calls } = await setup('surveys/[id]/email');
  const response = await route.GET(request('/api/admin/surveys/test/email?search=H25'), routeContext());
  assert.equal(response.status, 200);
  assert.equal(calls.at(-1).name, 'findSurveyRecipientProperties');
  assert.deepEqual(plain(calls.at(-1).args), ['a'.repeat(32), 'H25']);
  assert.match(response.headers.get('cache-control'), /private/);
});

test('survey append forwards only the explicitly selected group, properties and recipient policy', async () => {
  const { route, calls } = await setup('surveys/[id]/email');
  const response = await route.POST(request('/api/admin/surveys/test/email', { method: 'POST', body: {
    action: 'append', groupId: '71', memberIds: ['7'], includeOtherEmails: true, singleResponsePerProperty: true,
  } }), routeContext());
  assert.equal(response.status, 201);
  assert.deepEqual(plain(calls.at(-1).args), ['a'.repeat(32), { replaceCompleted: false, appendRecipients: true, groupId: '71',
    memberIds: ['7'], includeOtherEmails: true, singleResponsePerProperty: true }]);
});

test('copy actions use permission-checked copy services for surveys and articles', async () => {
  for (const [path, expected] of [['surveys', 'copyAdminSurvey'], ['cms/pages', 'copyAdminCmsPage']]) {
    const { route, calls, state } = await setup(path);
    const send = () => route.POST(request(`/api/admin/${path}`, { method: 'POST', body: { action: 'copy', sourceId: 'b'.repeat(32) } }));
    assert.equal((await send()).status, 201);
    assert.equal(calls.at(-1).name, expected);
    assert.deepEqual(plain(calls.at(-1).args), ['b'.repeat(32)]);
    state.error = new Error('Forbidden');
    assert.equal((await send()).status, 403);
  }
});

test('malformed JSON and non-object bodies never initiate an admin mutation or full sync', async () => {
  for (const [path, method, , , , options = {}] of cases.filter(([, method, , , , options = {}]) => method !== 'GET' && !options.file)) {
    // These actions intentionally have no JSON request body.
    if (method === 'DELETE' && path !== 'cms/pages/[id]/image') continue;
    if (path.includes('/process') || path.includes('/approve')) continue;
    const { route, calls } = await setup(path);
    for (const rawBody of ['{', 'null', '[]', '"string"']) {
      const response = await route[method](makeRequest(path, method, options, { rawBody }), routeContext());
      assert.equal(response.status, 400, `${method} ${path}: ${rawBody}`);
    }
    assert.equal(calls.length, 0, path);
  }
});

test('validation, missing entities and conflicts keep their HTTP semantics', async () => {
  for (const [path, method, message, expected, options = {}] of [
    ['members', 'POST', 'H-nummer is required', 400],
    ['members/[id]', 'PATCH', 'Invalid member', 400],
    ['members/[id]', 'PATCH', 'Member not found', 404],
    ['surveys/[id]', 'PATCH', 'Invalid survey', 400],
    ['surveys/[id]', 'DELETE', 'Survey not found', 404],
    ['surveys/[id]/attachments', 'POST', 'Too many survey attachments', 409, { file: true }],
    ['surveys/[id]/attachments/[attachmentId]', 'PATCH', 'Attachment not found', 404],
    ['cms/pages/[id]', 'PATCH', 'Invalid page', 400],
    ['cms/pages/[id]', 'PATCH', 'Page not found', 404],
    ['cms/pages/[id]/attachments', 'POST', 'Too many attachments', 409, { file: true }],
    ['matrikkel/runs', 'POST', 'Sync already running', 409],
    ['matrikkel/runs/[id]', 'DELETE', 'Run still active', 409],
    ['member-requests/[id]', 'PATCH', 'Member request property unresolved', 409],
  ]) {
    const { route, state } = await setup(path);
    state.error = new Error(message);
    const response = await route[method](makeRequest(path, method, options), routeContext());
    assert.equal(response.status, expected, message);
  }
});
