import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAdminModule, adminModules } from '../lib/admin-navigation.js';

test('admin navigation maps nested routes to the persistent module', () => {
  const routes = {
    '/admin': 'overview',
    '/admin/inbox': 'inbox',
    '/admin/members': 'members',
    '/admin/members/groups': 'members',
    '/admin/members/matrikkel': 'matrikkel',
    '/admin/members/newsletters': 'newsletters',
    '/admin/map': 'map',
    '/admin/surveys': 'surveys',
    '/admin/web': 'web',
    '/admin/web/new': 'web',
    '/admin/web/preview/example': 'web',
    '/admin/usage': 'usage',
    '/admin/audit': 'audit',
  };

  for (const [pathname, expected] of Object.entries(routes)) {
    assert.equal(activeAdminModule(pathname), expected, pathname);
  }
});

test('admin module keys and paths are unique', () => {
  assert.equal(new Set(adminModules.map(({ key }) => key)).size, adminModules.length);
  assert.equal(new Set(adminModules.map(({ href }) => href)).size, adminModules.length);
});
